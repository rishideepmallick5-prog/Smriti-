// src/components/LanguageSelector.jsx
import React from "react";
import { Globe, ChevronDown } from "lucide-react";
import { useLanguage, SUPPORTED_LANGUAGES, translations } from "../lib/useLanguage";

export { useLanguage, SUPPORTED_LANGUAGES, translations };
export const AVAILABLE_LANGUAGES = SUPPORTED_LANGUAGES;

export default function LanguageSelector({
  currentLang,
  onChange,
  variant = "dropdown", // "dropdown" | "pills"
  style,
  className = "",
}) {
  const { lang, setLang } = useLanguage(currentLang || "en");
  const activeLang = currentLang || lang;
  const handleChange = (code) => {
    if (onChange) {
      onChange(code);
    } else {
      setLang(code);
    }
  };

  if (variant === "pills") {
    return (
      <div
        className={`lang-toggle-group ${className}`}
        role="group"
        aria-label="Language selector"
        style={{
          display: "inline-flex",
          alignItems: "center",
          background: "#FAF8F5",
          border: "1.5px solid #D6CEBE",
          borderRadius: "20px",
          padding: "3px",
          gap: "2px",
          boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
          ...style,
        }}
      >
        {SUPPORTED_LANGUAGES.map((l) => {
          const isActive = l.code === activeLang;
          return (
            <button
              key={l.code}
              id={`lang-btn-${l.code}`}
              type="button"
              onClick={() => handleChange(l.code)}
              style={{
                border: "none",
                background: isActive ? "#E8A33D" : "transparent",
                color: isActive ? "#1F3D33" : "#52665E",
                borderRadius: "16px",
                padding: "6px 12px",
                fontSize: "13px",
                fontWeight: isActive ? "800" : "700",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
              title={l.label}
              aria-pressed={isActive}
            >
              {l.nativeName || l.label}
            </button>
          );
        })}
      </div>
    );
  }

  // Dropdown variant with clear visual indicators and senior accessibility
  return (
    <div
      className={`ph-lang-dropdown-container ${className}`}
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        ...style,
      }}
    >
      <div
        className="ph-lang-select-box"
        style={{
          display: "flex",
          alignItems: "center",
          background: "#FFFFFF",
          border: "2px solid #E8DFCB",
          borderRadius: "16px",
          padding: "6px 10px 6px 12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
          gap: "8px",
          transition: "border-color 0.2s ease, box-shadow 0.2s ease",
        }}
      >
        <Globe size={18} color="#1F3D33" style={{ flexShrink: 0 }} aria-hidden="true" />
        <select
          id="language-toggle-dropdown"
          aria-label="Toggle language"
          value={activeLang}
          onChange={(e) => handleChange(e.target.value)}
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            fontFamily: "inherit",
            fontSize: "14px",
            fontWeight: "800",
            color: "#1F3D33",
            cursor: "pointer",
            paddingRight: "6px",
          }}
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName} ({l.label})
            </option>
          ))}
        </select>
        <ChevronDown size={15} color="#6B7B6E" style={{ pointerEvents: "none", marginLeft: "-4px" }} aria-hidden="true" />
      </div>
    </div>
  );
}
