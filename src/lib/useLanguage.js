// src/lib/useLanguage.js
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { strings } from "../i18n/strings";

// BCP-47 Language mapping for Web Speech API
export const LANGUAGE_BCP47 = {
  en: "en-IN",
  as: "as-IN",
  bn: "bn-IN",
  hi: "hi-IN",
};

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English", nativeName: "English", bcp47: "en-IN" },
  { code: "as", label: "Assamese", nativeName: "অসমীয়া", bcp47: "as-IN" },
  { code: "bn", label: "Bengali", nativeName: "বাংলা", bcp47: "bn-IN" },
];

// Helper to create entry with display text and phonetic audioText
const item = (text, audioText) => ({ text, audioText: audioText || text });

// Phonetic translation dictionary structure: { [lang]: { [key]: { text, audioText } } }
export const translations = {
  en: {
    greeting: item("Good morning", "Good morning"),
    reminders: item("Reminders", "Reminders"),
    play_game: item("Play Memory Game", "Play Memory Game"),
    play_pattern: item("Play Pattern Game", "Play Pattern Game"),
    how_feeling: item("How are you feeling today?", "How are you feeling today?"),
    mood_happy: item("Happy", "Happy"),
    mood_okay: item("Okay", "Okay"),
    mood_sad: item("Not great", "Not great"),
    done: item("Done", "Done"),
    need_help: item("I need help", "I need help"),
    wellness: item("Wellness", "Wellness"),
    family: item("Family", "Family"),
    no_reminders: item("No reminders for today", "No reminders for today"),
    loading: item("Loading…", "Loading"),
    listen: item("Listen", "Listen"),
    read_aloud: item("Read aloud", "Read aloud"),
    select_language: item("Select Language", "Select Language"),
    home_greeting: item("Good morning,", "Good morning,"),
    home_mood_prompt: item("How are you feeling today?", "How are you feeling today?"),
    home_reminders_title: item("Reminders", "Reminders"),
    home_play_game: item("Play Memory Game", "Play Memory Game"),
    home_play_pattern_game: item("Play Pattern Game", "Play Pattern Game"),
    home_sos: item("I need help", "I need help"),
    reminder_done: item("Done", "Done"),
    reminder_medicine: item("Take your medicine", "Take your medicine"),
    reminder_water: item("Drink a glass of water", "Drink a glass of water"),
    reminder_walk: item("Go for a short walk", "Go for a short walk"),
    reminder_appointment: item("Doctor's appointment today", "Doctor's appointment today"),
    ...Object.fromEntries(
      Object.entries(strings.en).map(([k, v]) => [k, item(v, v)])
    ),
  },

  as: {
    greeting: item("শুভ প্ৰভাত", "Shubh probhat"),
    reminders: item("মনত ৰখা কথাবোৰ", "Monot rokha kothabor"),
    play_game: item("স্মৃতিৰ খেল খেলক", "Smritir khel khelok"),
    play_pattern: item("ছবি মেলোৱা খেল খেলক", "Chobi melowa khel khelok"),
    how_feeling: item("আজিলৈ আপুনি কেনে অনুভৱ কৰি আছে?", "Ajiloi aponi kene onubhob kori aase?"),
    mood_happy: item("সুখী", "Sukhi"),
    mood_okay: item("ঠিকেই আছে", "Thikei aase"),
    mood_sad: item("ভাল নাই", "Bhal nai"),
    done: item("কৰা হ'ল", "Kora hol"),
    need_help: item("মোক সহায় লাগে", "Mok sohai lage"),
    wellness: item("স্বাস্থ্য", "Swasthya"),
    family: item("পৰিয়াল", "Poriyal"),
    no_reminders: item("আজিৰ বাবে কোনো কথা নাই", "Ajir baabe kono kotha nai"),
    loading: item("লোড হৈ আছে…", "Load hoi aase"),
    listen: item("শুনক", "Xunok"),
    read_aloud: item("পঢ়ি শুনক", "Porhi xunok"),
    select_language: item("ভাষা বাছক", "Bhasha basok"),
    home_greeting: item("শুভ প্ৰভাত,", "Shubh probhat,"),
    home_mood_prompt: item("আজিলৈ আপুনি কেনে অনুভৱ কৰি আছে?", "Ajiloi aponi kene onubhob kori aase?"),
    home_reminders_title: item("মনত ৰখা কথাবোৰ", "Monot rokha kothabor"),
    home_play_game: item("স্মৃতিৰ খেল খেলক", "Smritir khel khelok"),
    home_play_pattern_game: item("ছবি মেলোৱা খেল খেলক", "Chobi melowa khel khelok"),
    home_sos: item("মোক সহায় লাগে", "Mok sohai lage"),
    reminder_done: item("কৰা হ'ল", "Kora hol"),
    reminder_medicine: item("আপোনাৰ ঔষধ খাওক", "Apunar oushodh khaok"),
    reminder_water: item("এগ্লাছ পানী খাওক", "Eglash pani khaok"),
    reminder_walk: item("অলপ খোজ কাঢ়ি আহি", "Olop khoj karhi aahi"),
    reminder_appointment: item("আজি চিকিৎসকৰ ওচৰলৈ যাব লাগিব", "Aji chikitshokor osoroloi jabo lagibo"),
    ...Object.fromEntries(
      Object.entries(strings.as).map(([k, v]) => [
        k,
        item(v, strings.as[k] || v),
      ])
    ),
  },

  bn: {
    greeting: item("শুভ সকাল", "Shubho shokal"),
    reminders: item("স্মারকসূচি", "Smarok shuchi"),
    play_game: item("স্মৃতি গেম খেলুন", "Smriti game khelun"),
    play_pattern: item("প্যাটার্ন গেম খেলুন", "Pattern game khelun"),
    how_feeling: item("আজ আপনার কেমন বোধ হচ্ছে?", "Aaj aaponar kemon bodh hochhe?"),
    mood_happy: item("খুশি", "Khushi"),
    mood_okay: item("মোটামুটি", "Motamuti"),
    mood_sad: item("ভালো না", "Bhalo na"),
    done: item("সম্পন্ন", "Shomponno"),
    need_help: item("আমার সাহায্য প্রয়োজন", "Aamar sahajjo proyojon"),
    wellness: item("স্বাস্থ্য ও কল্যাণ", "Shastho o kolyan"),
    family: item("পরিবার", "Poribar"),
    no_reminders: item("আজকের জন্য কোনো স্মারক নেই", "Aajker jonno kono smarok nei"),
    loading: item("লোড হচ্ছে…", "Load hochhe"),
    listen: item("শুনুন", "Shunun"),
    read_aloud: item("পড়ে শুনুন", "Pore shunun"),
    select_language: item("ভাষা নির্বাচন করুন", "Bhasha nirbachon korun"),
    home_greeting: item("শুভ সকাল,", "Shubho shokal,"),
    home_mood_prompt: item("আজ আপনার কেমন বোধ হচ্ছে?", "Aaj aaponar kemon bodh hochhe?"),
    home_reminders_title: item("স্মারকসূচি", "Smarok shuchi"),
    home_play_game: item("স্মৃতি গেম খেলুন", "Smriti game khelun"),
    home_play_pattern_game: item("প্যাটার্ন গেম খেলুন", "Pattern game khelun"),
    home_sos: item("আমার সাহায্য প্রয়োজন", "Aamar sahajjo proyojon"),
    reminder_done: item("সম্পন্ন", "Shomponno"),
    reminder_medicine: item("ওষুধ গ্রহণ করুন", "Oushodh grohon korun"),
    reminder_water: item("এক গ্লাস জল পান করুন", "Ek glass jol paan korun"),
    reminder_walk: item("একটু হেঁটে আসুন", "Ektu hete aashun"),
    reminder_appointment: item("আজ ডাক্তারের অ্যাপয়েন্টমেন্ট আছে", "Aaj doctor er appointment aachhe"),
    ...Object.fromEntries(
      Object.entries(strings.bn).map(([k, v]) => [
        k,
        item(v, strings.bn[k] || v),
      ])
    ),
  },
};

// Common phrase phonetic fallback map
const PHONETIC_LOOKUP = {
  // Assamese phrases
  "শুভ প্ৰভাত": "Shubh probhat",
  "শুভ প্ৰভাত,": "Shubh probhat,",
  "মনত ৰখা কথাবোৰ": "Monot rokha kothabor",
  "স্মৃতিৰ খেল খেলক": "Smritir khel khelok",
  "ছবি মেলোৱা খেল খেলক": "Chobi melowa khel khelok",
  "আজিলৈ আপুনি কেনে অনুভৱ কৰি আছে?": "Ajiloi aponi kene onubhob kori aase?",
  "এতিয়া আপুনি কেনে অনুভৱ কৰি আছে?": "Etiya aponi kene onubhob kori aase?",
  "সুখী": "Sukhi",
  "ঠিকেই আছে": "Thikei aase",
  "ভাল নাই": "Bhal nai",
  "কৰা হ'ল": "Kora hol",
  "মোক সহায় লাগে": "Mok sohai lage",
  "আপোনাৰ ঔষধ খাওক": "Apunar oushodh khaok",
  "এগ্লাছ পানী খাওক": "Eglash pani khaok",
  "অলপ খোজ কাঢ়ি আহি": "Olop khoj karhi aahi",
  "আজি চিকিৎসকৰ ওচৰলৈ যাব লাগিব": "Aji chikitshokor osoroloi jabo lagibo",
  "আজিৰ বাবে কোনো কথা নাই": "Ajir baabe kono kotha nai",
  // Bengali phrases
  "শুভ সকাল": "Shubho shokal",
  "শুভ সকাল,": "Shubho shokal,",
  "স্মারকসূচি": "Smarok shuchi",
  "স্মৃতি গেম খেলুন": "Smriti game khelun",
  "প্যাটার্ন গেম খেলুন": "Pattern game khelun",
  "আজ আপনার কেমন বোধ হচ্ছে?": "Aaj aaponar kemon bodh hochhe?",
  "এখন আপনার কেমন লাগছে?": "Ekhon aaponar kemon lagchhe?",
  "খুশি": "Khushi",
  "মোটামুটি": "Motamuti",
  "ভালো না": "Bhalo na",
  "সম্পন্ন": "Shomponno",
  "আমার সাহায্য প্রয়োজন": "Aamar sahajjo proyojon",
  "ওষুধ গ্রহণ করুন": "Oushodh grohon korun",
  "এক গ্লাস জল পান করুন": "Ek glass jol paan korun",
  "একটু হেঁটে আসুন": "Ektu hete aashun",
  "আজ ডাক্তারের অ্যাপয়েন্টমেন্ট আছে": "Aaj doctor er appointment aachhe",
  "আজকের জন্য কোনো স্মারক নেই": "Aajker jonno kono smarok nei",
};

/**
 * Resolves input text into phonetic audioText string.
 */
export function resolveAudioText(input, lang = "en") {
  if (!input) return "";
  if (typeof input === "object" && input.audioText) {
    return input.audioText;
  }
  if (typeof input === "object" && input.text) {
    return resolveAudioText(input.text, lang);
  }

  const str = String(input).trim();
  if (PHONETIC_LOOKUP[str]) {
    return PHONETIC_LOOKUP[str];
  }

  const dict = translations[lang] || {};
  for (const key in dict) {
    if (dict[key]?.text === str && dict[key]?.audioText) {
      return dict[key].audioText;
    }
  }

  return str;
}

// Debounce timer to prevent timeout stacking and stuttering
let speechTimeout = null;

/**
 * Reads text aloud using phonetic audio fallback and forced en-IN / hi-IN voice.
 * @param {string|Object} input - Text string, audioText string, or { text, audioText } entry
 * @param {string} lang - Language code ('en', 'as', 'bn')
 * @param {Function} [onEnd] - Callback when speech ends
 * @param {string} [customAudioText] - Explicit audioText override
 */
export function speakText(input, lang = "en", onEnd = null, customAudioText = null) {
  if (speechTimeout) {
    clearTimeout(speechTimeout);
    speechTimeout = null;
  }

  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel(); // Clear any pending/overlapping speech queue immediately
  }

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    console.warn("Web Speech API (speechSynthesis) is not supported in this browser.");
    if (onEnd) onEnd();
    return;
  }
  if (!input && !customAudioText) return;

  try {
    // 1. Resolve phonetic audio text
    let spokenText = customAudioText || resolveAudioText(input, lang);
    if (!spokenText) spokenText = String(input);

    const utterance = new SpeechSynthesisUtterance(spokenText);
    utterance.lang = "en-IN"; // Forced Indian English / Hindi baseline
    utterance.rate = 0.88;    // Steady, elder-friendly pace
    utterance.pitch = 1.0;

    // 2. Force speakText to always use an "en-IN" (Indian English) or "hi-IN" (Hindi) voice
    const voices = window.speechSynthesis.getVoices() || [];
    if (voices.length > 0) {
      const forcedVoice =
        voices.find(
          (v) =>
            v.lang &&
            (v.lang.toLowerCase() === "en-in" ||
              v.lang.toLowerCase().replace("_", "-") === "en-in")
        ) ||
        voices.find(
          (v) =>
            v.lang &&
            (v.lang.toLowerCase() === "hi-in" ||
              v.lang.toLowerCase().replace("_", "-") === "hi-in")
        ) ||
        voices.find(
          (v) =>
            v.lang &&
            (v.lang.toUpperCase().includes("-IN") ||
              v.lang.toUpperCase().includes("_IN") ||
              v.lang.toLowerCase().startsWith("hi") ||
              v.lang.toLowerCase().includes("india"))
        ) ||
        voices.find((v) => v.default) ||
        voices[0];

      if (forcedVoice) {
        utterance.voice = forcedVoice;
        console.warn("Using forced Indian English/Hindi voice for phonetic playback:", forcedVoice.name);
      }
    }

    if (onEnd) {
      utterance.onend = onEnd;
      utterance.onerror = () => onEnd();
    }

    speechTimeout = setTimeout(() => {
      try {
        window.speechSynthesis.speak(utterance);
      } catch (err) {
        console.error("speechSynthesis.speak error in timeout:", err);
        if (onEnd) onEnd();
      }
    }, 50);
  } catch (err) {
    console.error("speakText error:", err);
    if (onEnd) onEnd();
  }
}

/**
 * Builds a React-safe string translation accessor while keeping .audio and .entries accessible
 */
function createTranslationAccessor(lang) {
  const dict = translations[lang] || translations.en;
  const target = {
    audio: {},
    entries: dict,
  };

  for (const key in dict) {
    target[key] = dict[key].text;
    target.audio[key] = dict[key].audioText;
  }

  return target;
}

// React Context for App-wide Language Management
export const LanguageContext = createContext(null);

export function LanguageProvider({ children, initialLang = "en" }) {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem("app_language") || initialLang;
    } catch {
      return initialLang;
    }
  });

  const setLang = useCallback((newLang) => {
    setLangState(newLang);
    try {
      localStorage.setItem("app_language", newLang);
    } catch (e) {
      console.warn("Failed to persist language in localStorage", e);
    }
  }, []);

  const t = useMemo(() => {
    return createTranslationAccessor(lang);
  }, [lang]);

  const speak = useCallback(
    (textOrObj, onEnd, customAudioText) => {
      speakText(textOrObj, lang, onEnd, customAudioText);
    },
    [lang]
  );

  const value = useMemo(
    () => ({
      lang,
      language: lang,
      setLang,
      setLanguage: setLang,
      t,
      translations: t,
      dictionary: translations,
      supportedLanguages: SUPPORTED_LANGUAGES,
      speakText: (textOrObj, l = lang, onEnd, customAudioText) =>
        speakText(textOrObj, l, onEnd, customAudioText),
      speak,
    }),
    [lang, setLang, t, speak]
  );

  return React.createElement(LanguageContext.Provider, { value }, children);
}

/**
 * Universal useLanguage hook.
 * Works both with Context Provider or as a standalone hook.
 */
export function useLanguage(defaultLang = "en") {
  const context = useContext(LanguageContext);

  const [localLang, setLocalLangState] = useState(() => {
    try {
      return localStorage.getItem("app_language") || defaultLang;
    } catch {
      return defaultLang;
    }
  });

  const setLocalLang = useCallback((newLang) => {
    setLocalLangState(newLang);
    try {
      localStorage.setItem("app_language", newLang);
    } catch (e) {
      console.warn("Failed to persist language in localStorage", e);
    }
  }, []);

  if (context) {
    const result = [context.lang, context.setLang];
    return Object.assign(result, context);
  }

  const currentLang = localLang;
  const currentT = createTranslationAccessor(currentLang);

  const result = [currentLang, setLocalLang];
  return Object.assign(result, {
    lang: currentLang,
    language: currentLang,
    setLang: setLocalLang,
    setLanguage: setLocalLang,
    t: currentT,
    translations: currentT,
    dictionary: translations,
    supportedLanguages: SUPPORTED_LANGUAGES,
    speakText: (textOrObj, l = currentLang, onEnd, customAudioText) =>
      speakText(textOrObj, l, onEnd, customAudioText),
    speak: (textOrObj, onEnd, customAudioText) =>
      speakText(textOrObj, currentLang, onEnd, customAudioText),
  });
}

export default useLanguage;
