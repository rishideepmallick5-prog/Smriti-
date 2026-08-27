import { useState, useEffect, useCallback, useRef } from "react";

export const SUPPORTED_LANGUAGES = {
  en: "en-IN",
  hi: "hi-IN",
  as: "as-IN",
  bn: "bn-IN",
};

export function useTextToSpeech() {
  const [voicesReady, setVoicesReady] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voicesRef = useRef([]);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    function loadVoices() {
      const v = window.speechSynthesis.getVoices();
      if (v.length > 0) { voicesRef.current = v; setVoicesReady(true); }
    }
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const speak = useCallback((text, langCode = "en-IN") => {
    if (!("speechSynthesis" in window) || !text) return;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = langCode;
    utterance.rate = 0.9;
    utterance.pitch = 1;

    const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices() || [];
    if (voices.length > 0) {
      let match = voices.find(
        (v) => v.lang && v.lang.toLowerCase() === langCode.toLowerCase()
      );
      if (!match) {
        match = voices.find(
          (v) =>
            v.lang &&
            (v.lang.toUpperCase().includes("-IN") ||
              v.lang.toUpperCase().includes("_IN") ||
              v.lang.toLowerCase().startsWith("hi") ||
              v.lang.toLowerCase().includes("india"))
        );
        if (match) {
          console.warn("Exact voice not found, using fallback:", match.name);
        } else {
          match = voices.find((v) => v.default) || voices[0];
          if (match) {
            console.warn("Exact voice not found, using fallback:", match.name);
          }
        }
      }
      if (match) utterance.voice = match;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    timeoutRef.current = setTimeout(() => {
      window.speechSynthesis.speak(utterance);
    }, 50);
  }, []);

  const stop = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { speak, stop, isSpeaking, voicesReady };
}
