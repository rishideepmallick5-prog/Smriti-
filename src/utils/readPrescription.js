// src/utils/readPrescription.js
//
// Prescription OCR using Google Gemini Vision (gemini-1.5-flash).
//
// Usage:
//   import { readPrescription } from "../utils/readPrescription";
//   const result = await readPrescription(file); // File or Blob
//   // result: { text: string, medicines: Array<{name, dosage, instructions}> }
//
// Requires VITE_GEMINI_API_KEY in your .env.local file.

const getApiKey = () => import.meta.env.VITE_GEMINI_API_KEY;

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

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

  try {
    console.log("[readPrescription] Preparing image upload for Gemini (gemini-1.5-flash)...");
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

    console.log("[readPrescription] Calling Gemini API endpoint...");
    let response;
    let retries = 2;
    let delay = 1000;

    while (retries >= 0) {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (response.status === 503 || response.status === 429) {
        if (retries > 0) {
          console.warn(`[readPrescription] Gemini API returned ${response.status} (busy/rate limit). Retrying in ${delay}ms... (${retries} retries left)`);
          await new Promise((r) => setTimeout(r, delay));
          delay *= 1.5;
          retries--;
          continue;
        }
      }
      break;
    }

    if (!response.ok) {
      const errBody = await response.text();
      console.error("[readPrescription] Gemini API HTTP Error:", {
        status: response.status,
        statusText: response.statusText,
        responseBody: errBody,
      });
      return {
        rawText: "",
        medicines: [],
        error: response.status === 503 
          ? "Gemini model is currently experiencing high demand. Please try again in a few seconds."
          : `Gemini API returned status ${response.status}: ${errBody.substring(0, 120)}`,
      };
    }

    const data = await response.json();
    console.log("[readPrescription] Gemini API Response received successfully:", data);

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
      // Gemini responded but not valid JSON — return raw text
      console.warn("[readPrescription] Could not parse Gemini JSON response as JSON. Raw text:", rawContent);
      return {
        rawText: rawContent,
        medicines: [],
        error: "Could not parse structured data from the image. Raw text returned.",
      };
    }
  } catch (err) {
    console.error("[readPrescription] Unexpected network or execution error:", err);
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
