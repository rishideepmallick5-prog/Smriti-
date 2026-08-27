// src/utils/readPrescription.js
//
// Prescription OCR using Google Gemini Vision with fallback models.
//
// Usage:
//   import { readPrescription } from "../utils/readPrescription";
//   const result = await readPrescription(file); // File or Blob
//   // result: { text: string, medicines: Array<{name, dosage, instructions}> }
//
// Requires VITE_GEMINI_API_KEY in your .env.local file.

const getApiKey = () => import.meta.env.VITE_GEMINI_API_KEY;

const MODELS = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-pro"];

// ── Key guard — fail loud in development, fail silently in prod ───────────
if (!getApiKey()) {
  console.warn(
    "[readPrescription] ⚠️  VITE_GEMINI_API_KEY is not set.\n" +
    "Add it to your .env.local file and restart the dev server:\n" +
    "  VITE_GEMINI_API_KEY=your_key_here"
  );
}

const SYSTEM_PROMPT = `You are a medical prescription parser.
The user will provide an image of a prescription.
Extract all medicines and return a structured JSON response.
For each medicine found, include: name, dosage (e.g. "500mg"), and instructions (e.g. "twice daily after meals").
Also include the full raw text you can read from the prescription.

Respond ONLY with valid JSON in this exact shape:
{
  "rawText": "...",
  "medicines": [
    { "name": "...", "dosage": "...", "instructions": "..." }
  ]
}

If you cannot read the image clearly, return:
{ "rawText": "", "medicines": [], "error": "Could not read prescription image clearly." }`;

/**
 * Convert a File/Blob to a base64 string (without the data: prefix).
 * @param {File|Blob} file
 * @returns {Promise<string>}
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // result is "data:<mimeType>;base64,<data>"
      const base64 = reader.result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * readPrescription
 *
 * Sends a prescription image to Gemini Vision and returns structured data.
 * Tries fallback models if the primary model is busy (503/429).
 *
 * @param {File|Blob} file  - The prescription image file
 * @returns {Promise<{ rawText: string, medicines: Array<{name:string, dosage:string, instructions:string}>, error?: string }>}
 */
export async function readPrescription(file) {
  const apiKey = getApiKey();

  if (!apiKey) {
    console.error("[readPrescription] Missing Gemini API key in import.meta.env.VITE_GEMINI_API_KEY");
    return {
      rawText: "",
      medicines: [],
      error: "Gemini API key is not configured. Check VITE_GEMINI_API_KEY in .env.local.",
    };
  }

  if (!file) {
    return { rawText: "", medicines: [], error: "No file provided." };
  }

  try {
    const base64Data = await fileToBase64(file);
    const mimeType = file.type || "image/jpeg";

    const requestBody = {
      contents: [
        {
          parts: [
            { text: SYSTEM_PROMPT },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        temperature: 0.1,       // Low temperature for deterministic medical parsing
        maxOutputTokens: 1024,
      },
    };

    let lastError = null;

    for (const model of MODELS) {
      console.log(`[readPrescription] Attempting OCR with model: ${model}...`);
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        if (response.status === 503 || response.status === 429) {
          console.warn(`[readPrescription] Model ${model} returned ${response.status} (overloaded/rate limited). Falling back to next model...`);
          lastError = `Gemini model ${model} is currently overloaded (${response.status}).`;
          continue;
        }

        if (!response.ok) {
          const errBody = await response.text();
          console.error(`[readPrescription] Gemini API HTTP Error on model ${model}:`, {
            status: response.status,
            statusText: response.statusText,
            responseBody: errBody,
          });
          lastError = `Gemini API returned status ${response.status}: ${errBody.substring(0, 120)}`;
          if (response.status >= 500) {
            continue;
          }
          return {
            rawText: "",
            medicines: [],
            error: lastError,
          };
        }

        const data = await response.json();
        console.log(`[readPrescription] Gemini API Response received successfully from ${model}:`, data);

        const rawContent = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Strip markdown code fences if Gemini wraps the JSON
        const jsonText = rawContent.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();

        try {
          const parsed = JSON.parse(jsonText);
          return {
            rawText: parsed.rawText || "",
            medicines: Array.isArray(parsed.medicines) ? parsed.medicines : [],
            error: parsed.error || null,
          };
        } catch {
          console.warn("[readPrescription] Could not parse Gemini JSON response as JSON. Raw text:", rawContent);
          return {
            rawText: rawContent,
            medicines: [],
            error: "Could not parse structured data from the image. Raw text returned.",
          };
        }
      } catch (networkErr) {
        console.warn(`[readPrescription] Network or fetch error with ${model}:`, networkErr);
        lastError = networkErr?.message || "Network error";
        continue;
      }
    }

    return {
      rawText: "",
      medicines: [],
      error: lastError || "All Gemini models were unavailable or overloaded. Please try again in a few moments.",
    };
  } catch (err) {
    console.error("[readPrescription] Unexpected execution error:", err);
    return {
      rawText: "",
      medicines: [],
      error: err?.message || "Unknown error scanning prescription.",
    };
  }
}

/**
 * isGeminiConfigured
 *
 * Quick helper to check whether the key is available before showing the
 * OCR scan button to users — avoids showing a feature that will silently fail.
 *
 * @returns {boolean}
 */
export function isGeminiConfigured() {
  return Boolean(getApiKey());
}
