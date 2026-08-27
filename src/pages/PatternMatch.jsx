// src/pages/PatternMatch.jsx
//
// Pattern Match card-flip game — Smriti / North-East Cognitive Care
// Features culturally familiar icons from the North-Eastern Region (Tea, Rhino, Gamosa, Harvest, Pepa, etc.)

import { useState, useEffect, useCallback } from "react";
import { Volume2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { strings } from "../i18n/strings";
import { useLanguage, speakText } from "../lib/useLanguage";
import { computeDifficulty } from "./MemoryGame";
import { saveLocalGameSession, getLocalGameSessions } from "./CaregiverDashboard";
import "./PatternMatch.css";

// ── Culturally Familiar North-East Regional Icons & Items ──────────
const REGIONAL_CULTURAL_ITEMS = [
  { icon: "🍵", name: { en: "Assam Tea", as: "অসম চাহ", bn: "আসাম চা" } },
  { icon: "🦏", name: { en: "One-horned Rhino", as: "এশিঙীয়া গঁড়", bn: "একশৃঙ্গ গণ্ডার" } },
  { icon: "🧣", name: { en: "Gamosa", as: "গামোচা", bn: "গামোসা" } },
  { icon: "🌾", name: { en: "Golden Harvest", as: "সোণালী শস্য", bn: "সোনালী ধান" } },
  { icon: "🪈", name: { en: "Bihu Pepa", as: "বিহু পেঁপা", bn: "বিহু পেঁপা" } },
  { icon: "🛶", name: { en: "Brahmaputra Boat", as: "ব্ৰহ্মপুত্ৰৰ নাও", bn: "নৌকা" } },
  { icon: "🥞", name: { en: "Bihu Pitha", as: "তিল পিঠা", bn: "তিল পিঠা" } },
  { icon: "🪘", name: { en: "Dhol Drum", as: "বিহু ঢোল", bn: "ঢোল" } },
];

const GRID_CONFIG = {
  easy:   { pairsCount: 3, gridClass: "easy" },
  medium: { pairsCount: 6, gridClass: "medium" },
  hard:   { pairsCount: 8, gridClass: "hard" },
};

function shuffle(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function PatternMatch({ patientId, session, lang: propLang = "en", onGoHome }) {
  const { lang: contextLang, t } = useLanguage(propLang);
  const lang = propLang || contextLang || "en";

  // ── State ──────────────────────────────────────────────────────
  const [phase, setPhase]           = useState("loading"); // loading | playing | complete | error
  const [difficulty, setDifficulty] = useState("medium");
  const [cards, setCards]           = useState([]);
  const [flippedIds, setFlippedIds] = useState([]);
  const [moves, setMoves]           = useState(0);
  const [matchedCount, setMatched] = useState(0);
  const [seconds, setSeconds]       = useState(0);
  const [saving, setSaving]         = useState(false);
  const [errorMsg, setErrorMsg]     = useState("");
  const [lastMatchedName, setLastMatchedName] = useState("");

  const handleAudioSpeak = useCallback(
    (text, id = "general") => {
      speakText(text, lang);
    },
    [lang]
  );

  // ── Timer ──────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // ── Load & Init Game ───────────────────────────────────────────
  const loadGame = useCallback(async () => {
    setPhase("loading");
    setMoves(0);
    setMatched(0);
    setSeconds(0);
    setFlippedIds([]);
    setLastMatchedName("");

    let computedDiff = "medium";

    if (patientId && supabase) {
      try {
        const { data, error } = await supabase
          .from("game_sessions")
          .select("correct, total, played_at")
          .eq("patient_id", patientId)
          .eq("category", "pattern_recognition")
          .order("played_at", { ascending: false })
          .limit(3);

        if (error) {
          const local = getLocalGameSessions(patientId).filter((s) => s?.category === "pattern_recognition");
          computedDiff = computeDifficulty(local);
        } else if (data && data.length > 0) {
          computedDiff = computeDifficulty(data);
        } else {
          const local = getLocalGameSessions(patientId).filter((s) => s?.category === "pattern_recognition");
          computedDiff = computeDifficulty(local);
        }
      } catch (err) {
        console.warn("Error fetching past pattern sessions:", err);
        const local = getLocalGameSessions(patientId).filter((s) => s?.category === "pattern_recognition");
        computedDiff = computeDifficulty(local);
      }
    } else if (patientId) {
      const local = getLocalGameSessions(patientId).filter((s) => s?.category === "pattern_recognition");
      computedDiff = computeDifficulty(local);
    }

    setDifficulty(computedDiff);

    const { pairsCount } = GRID_CONFIG[computedDiff];
    const selectedItems = shuffle(REGIONAL_CULTURAL_ITEMS).slice(0, pairsCount);
    
    const deckItems = shuffle([...selectedItems, ...selectedItems]);

    const deckCards = deckItems.map((item, idx) => ({
      id: idx,
      icon: item.icon,
      name: item.name[lang] || item.name.en,
      flipped: false,
      matched: false,
    }));

    setCards(deckCards);
    setPhase("playing");

    setTimeout(() => {
      handleAudioSpeak(t.pattern_game_prompt || "Find the matching pairs", "prompt");
    }, 500);
  }, [patientId, lang, handleAudioSpeak, t.pattern_game_prompt]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  // ── Card Click Handler ──────────────────────────────────────────
  async function handleCardClick(card) {
    if (phase !== "playing") return;
    if (card.flipped || card.matched) return;
    if (flippedIds.length >= 2) return;

    const nextFlipped = [...flippedIds, card.id];
    setFlippedIds(nextFlipped);

    // Flip target card face-up
    setCards((prev) =>
      prev.map((c) => (c.id === card.id ? { ...c, flipped: true } : c))
    );

    if (nextFlipped.length === 2) {
      const newMoves = moves + 1;
      setMoves(newMoves);

      const [firstId, secondId] = nextFlipped;
      const firstCard  = cards.find((c) => c.id === firstId);
      const secondCard = card;

      if (firstCard.icon === secondCard.icon) {
        // Match!
        const matchedLabel = secondCard.name || secondCard.icon;
        setLastMatchedName(matchedLabel);
        handleAudioSpeak(matchedLabel, "match");
        const newMatched = matchedCount + 1;
        setMatched(newMatched);

        setCards((prev) =>
          prev.map((c) =>
            c.id === firstId || c.id === secondId
              ? { ...c, matched: true, flipped: true }
              : c
          )
        );
        setFlippedIds([]);

        const { pairsCount } = GRID_CONFIG[difficulty];
        if (newMatched >= pairsCount) {
          // Game complete!
          const excess = Math.max(0, newMoves - pairsCount);
          const correct = Math.max(0, pairsCount - excess);
          const total = pairsCount;

          const { data: authData } = await supabase.auth.getSession();
          const actualUserId = authData?.session?.user?.id || session?.user?.id;

          let pid = patientId;
          if ((!pid || pid === "88546630-8124-4047-8f78-b6a8be48fbc7") && actualUserId && supabase) {
            try {
              const { data: pts } = await supabase
                .from("patients")
                .select("id")
                .eq("caregiver_id", actualUserId)
                .order("created_at", { ascending: true })
                .limit(1);
              if (pts && pts.length > 0) pid = pts[0].id;
            } catch (e) {
              console.warn("Patient ID resolution error:", e);
            }
          }

          const sessionRecord = {
            id: "game_sess_" + Date.now(),
            patient_id: pid,
            caregiver_id: actualUserId,
            game_type: "pattern",
            category: "pattern_recognition",
            correct,
            total,
            played_at: new Date().toISOString(),
          };

          if (pid && actualUserId && supabase) {
            setSaving(true);
            try {
              const { data, error } = await supabase
                .from("game_sessions")
                .insert([
                  {
                    patient_id: pid,
                    caregiver_id: actualUserId,
                    category: "pattern_recognition",
                    correct,
                    total,
                    played_at: new Date().toISOString(),
                  },
                ])
                .select()
                .single();

              if (!error && data) {
                saveLocalGameSession(pid, data);
              } else {
                saveLocalGameSession(pid, sessionRecord);
              }
            } catch (e) {
              console.warn("Pattern game session save error:", e);
              saveLocalGameSession(pid, sessionRecord);
            }
            setSaving(false);
          } else if (pid) {
            saveLocalGameSession(pid, sessionRecord);
          }

          setTimeout(() => {
            handleAudioSpeak(t.pattern_complete_title || "Well done!", "complete");
          }, 400);
          setPhase("complete");
        }
      } else {
        // No match — flip back after short delay
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c) =>
              c.id === firstId || c.id === secondId
                ? { ...c, flipped: false }
                : c
            )
          );
          setFlippedIds([]);
        }, 900);
      }
    }
  }

  const { pairsCount, gridClass } = GRID_CONFIG[difficulty];
  const excess  = Math.max(0, moves - pairsCount);
  const correct = Math.max(0, pairsCount - excess);
  const diffLabel = t[`difficulty_${difficulty}`] || difficulty;

  // ══════════════════════════════════════════════════════════════
  // RENDER: Loading
  if (phase === "loading") return (
    <div className="pm-root" role="main">
      <header className="pm-topbar">
        <h1 className="pm-title">🧩 <span>{t.pattern_game_title || "Pattern Match"}</span></h1>
      </header>
      <div className="pm-state-card">
        <div className="pm-spinner" aria-hidden="true" />
        <p className="pm-state-body">{t.game_loading || "Loading game…"}</p>
      </div>
    </div>
  );

  // RENDER: Error
  if (phase === "error") return (
    <div className="pm-root" role="main">
      <header className="pm-topbar">
        <button className="pm-back-btn" onClick={onGoHome}>← {t.game_go_home || "Go Home"}</button>
      </header>
      <div className="pm-state-card error">
        <div className="pm-state-icon">⚠️</div>
        <p className="pm-state-title">{errorMsg}</p>
      </div>
    </div>
  );

  // RENDER: Complete
  if (phase === "complete") {
    const accuracyPct = Math.round((correct / (pairsCount || 1)) * 100);
    return (
      <div className="pm-root" role="main">
        <header className="pm-topbar">
          <h1 className="pm-title">🧩 <span>{t.pattern_game_title || "Pattern Match"}</span></h1>
        </header>
        <div className="pm-complete" aria-live="polite">
          <div className="pm-complete-star" aria-hidden="true">
            {correct >= Math.ceil(pairsCount * 0.8) ? "🌟" : correct >= Math.ceil(pairsCount * 0.5) ? "😊" : "💪"}
          </div>
          <h2 className="pm-complete-title">{t.pattern_complete_title || "Well done!"}</h2>
          <div className="mg-score-card">
            <div className="mg-score-number">{correct}</div>
            <div className="mg-score-denom">{t.game_score_suffix || "out of"} {pairsCount}</div>
            <div className="mg-score-label">{t.game_score_label || "Score"} ({accuracyPct}% accuracy)</div>
            <div style={{ marginTop: "14px", display: "flex", justifyContent: "center", gap: "16px", fontSize: "14px", fontWeight: "800", color: "#1F3D33" }}>
              <span>{t.pattern_moves_label || "Moves"}: {moves}</span>
              <span>•</span>
              <span>{t.pattern_time_label || "Time"}: {seconds}s</span>
            </div>
          </div>
          <div className="pm-complete-actions">
            <button
              id="pattern-play-again-btn"
              type="button"
              className="pm-play-again-btn"
              onClick={loadGame}
              disabled={saving}
            >
              🔄 {t.game_play_again || "Play Again"}
            </button>
            <button
              id="pattern-go-home-btn"
              type="button"
              className="pm-home-btn"
              onClick={onGoHome}
            >
              🏠 {t.game_go_home || "Go Home"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // RENDER: Playing
  return (
    <div className="pm-root" role="main">
      {/* Top bar */}
      <header className="pm-topbar">
        <button className="pm-back-btn" onClick={onGoHome} aria-label={t.game_go_home || "Go Home"}>
          ← {t.game_go_home || "Go Home"}
        </button>
        <h1 className="pm-title">🧩 <span>{t.pattern_game_title || "Pattern Match"}</span></h1>
      </header>

      {/* Stats bar */}
      <div className="pm-stats-bar" role="status">
        <div className="pm-stat-item">
          <span>{t.pattern_moves_label || "Moves"}:</span>
          <span className="pm-stat-value">{moves}</span>
        </div>
        <div className="pm-stat-item">
          <span>{t.pattern_time_label || "Time"}:</span>
          <span className="pm-stat-value">{seconds}s</span>
        </div>
        <div className="pm-diff-badge">
          {t.difficulty_label || "Level"}: {diffLabel}
        </div>
      </div>

      {lastMatchedName && (
        <div style={{ textAlign: "center", fontSize: "14px", fontWeight: "800", color: "#E8A33D", animation: "mg-pop 0.3s ease both" }}>
          ✓ {lastMatchedName}
        </div>
      )}

      {/* Cards Grid with North-East Regional Cultural Icons */}
      <div className="pm-grid-wrap">
        <div className={`pm-grid ${gridClass}`} role="group" aria-label={t.pattern_game_prompt || "Find the matching pairs"}>
          {cards.map((card) => {
            const isFacedown = !card.flipped && !card.matched;
            let cardClass = "pm-card-btn";
            if (card.matched) cardClass += " matched";
            else if (card.flipped) cardClass += " faceup";
            else cardClass += " facedown";

            return (
              <button
                key={card.id}
                id={`pm-card-${card.id}`}
                type="button"
                className={cardClass}
                onClick={() => handleCardClick(card)}
                disabled={card.matched || (card.flipped && flippedIds.includes(card.id))}
                aria-label={isFacedown ? "Face down card" : card.name || card.icon}
                title={!isFacedown ? card.name : ""}
              >
                {!isFacedown && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }}>
                    <span style={{ fontSize: "clamp(28px, 7vw, 42px)", lineHeight: 1 }}>{card.icon}</span>
                    <span style={{ fontSize: "11px", fontWeight: "800", color: "#1F3D33", marginTop: "2px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "70px" }}>
                      {card.name}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}