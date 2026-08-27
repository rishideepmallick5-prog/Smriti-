// src/pages/PatientHome.jsx
import { useState, useEffect, useCallback, useRef } from "react";
import { Volume2, VolumeX, Globe } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useLanguage, speakText, translations, SUPPORTED_LANGUAGES } from "../lib/useLanguage";
import LanguageSelector from "../components/LanguageSelector";
import { getLocalReminders, mergeDedupe } from "./CaregiverDashboard";
import "./PatientHome.css";

const MOODS = [
  { score: 3, emoji: "😊", labelKey: "mood_happy" },
  { score: 2, emoji: "😐", labelKey: "mood_okay" },
  { score: 1, emoji: "😔", labelKey: "mood_sad" },
];

function formatTime(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(":");
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function getReminderIcon(text) {
  if (!text) return "🔔";
  const lower = text.toLowerCase();
  if (lower.match(/med|pill|prescrip|doctor|tablet|medicine|ঔষধ|ঔষধ/)) return "💊";
  if (lower.match(/water|drink|hydrat|fluid|chai|tea|পানী|জল/)) return "💧";
  if (lower.match(/walk|stroll|exercise|step|go out|খোজ|হাঁটা/)) return "🚶";
  if (lower.match(/eat|lunch|dinner|food|meal|breakfast|snack|ভাত|খাদ্য/)) return "🍽️";
  return "🔔";
}

export default function PatientHome({
  session,
  patientId: propPatientId,
  lang: propLang,
  onLangChange,
  activeTab,
  onPlayGame,
  onPlayPatternGame,
  onNavigateToFamily,
}) {
  const { lang: contextLang, setLang: setContextLang, t } = useLanguage(propLang || "en");
  const lang = propLang || contextLang;

  const handleLanguageChange = (newLang) => {
    if (onLangChange) {
      onLangChange(newLang);
    }
    setContextLang(newLang);
  };

  const userId = session?.user?.id;

  // Strictly initialize states to null / empty arrays
  const [activePatient, setActivePatient] = useState(null);
  const [patientLoading, setPatientLoading] = useState(true);
  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(true);
  const [remindersError, setRemindersError] = useState(null);
  const [selectedMood, setSelectedMood] = useState(null);
  const [moodSaving, setMoodSaving] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: "" });
  const [speakingId, setSpeakingId] = useState(null);

  function showToast(message) {
    setToast({ visible: true, message });
    setTimeout(() => setToast((p) => ({ ...p, visible: false })), 2500);
  }

  const handleSpeak = useCallback((textOrObj, id = "general", customAudioText = null) => {
    if (!textOrObj && !customAudioText) return;
    setSpeakingId(id);
    speakText(textOrObj, lang, () => {
      setSpeakingId((curr) => (curr === id ? null : curr));
    }, customAudioText);
  }, [lang]);

  const fetchFirstPatient = useCallback(async () => {
    if (!userId) {
      setActivePatient(null);
      setPatientLoading(false);
      return;
    }
    setPatientLoading(true);
    const { data } = await supabase
      .from("patients")
      .select("id, name")
      .eq("caregiver_id", userId)
      .order("created_at", { ascending: true });
    
    if (data && data.length > 0) {
      setActivePatient(data[0]);
    } else {
      setActivePatient(null);
    }
    setPatientLoading(false);
  }, [userId]);

  // Fetch patient profile strictly filtered by caregiver_id = session.user.id
  useEffect(() => {
    if (!userId) {
      setActivePatient(null);
      setPatientLoading(false);
      return;
    }
    setPatientLoading(true);

    if (propPatientId) {
      supabase
        .from("patients")
        .select("id, name")
        .eq("id", propPatientId)
        .eq("caregiver_id", userId)
        .single()
        .then(({ data }) => {
          if (data) setActivePatient(data);
          else fetchFirstPatient();
        })
        .catch(() => fetchFirstPatient());
    } else {
      fetchFirstPatient();
    }
  }, [propPatientId, session, userId, activeTab, fetchFirstPatient]);

  // Load reminders strictly for active patient & caregiver_id (merging server + local cache)
  const loadReminders = useCallback(async () => {
    if (!activePatient?.id || !userId) {
      setReminders([]);
      setRemindersLoading(false);
      return;
    }
    setRemindersLoading(true);
    setRemindersError(null);

    const { data: serverData, error } = await supabase
      .from("reminders")
      .select("id, text, reminder_time, done")
      .eq("patient_id", activePatient.id)
      .eq("caregiver_id", userId)
      .order("done", { ascending: true })
      .order("reminder_time", { ascending: true, nullsFirst: false });

    const localReminders = getLocalReminders(activePatient.id);
    const merged = mergeDedupe(serverData || [], localReminders);

    if (error && merged.length === 0) {
      setRemindersError(error.message);
      setReminders([]);
    } else {
      setReminders(merged);
    }
    setRemindersLoading(false);
  }, [activePatient?.id, userId]);

  useEffect(() => {
    loadReminders();
  }, [loadReminders, activeTab]);

  // Auto re-fetch on window focus or tab navigation
  useEffect(() => {
    function handleFocus() {
      fetchFirstPatient();
      loadReminders();
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [fetchFirstPatient, loadReminders]);

  async function handleReminderDone(reminder) {
    if (reminder.done) return;
    setReminders((p) =>
      p.map((r) => (r.id === reminder.id ? { ...r, done: true } : r))
    );
    const { error } = await supabase
      .from("reminders")
      .update({ done: true })
      .eq("id", reminder.id);
    if (error) {
      setReminders((p) =>
        p.map((r) => (r.id === reminder.id ? { ...r, done: false } : r))
      );
      showToast("Could not save. Try again.");
    } else {
      handleSpeak(t.reminder_done || t.done, `done-${reminder.id}`);
      showToast("✓ " + reminder.text);
    }
  }

  async function handleMoodSelect(mood) {
    if (moodSaving) return;
    setSelectedMood(mood.score);
    setMoodSaving(true);
    handleSpeak(t[mood.labelKey], `mood-${mood.score}`);
    if (activePatient?.id && userId) {
      await supabase.from("mood_checkins").insert({
        patient_id: activePatient.id,
        caregiver_id: userId,
        score: mood.score,
        phase: "general",
      });
    }
    setMoodSaving(false);
    showToast(mood.emoji + "  " + t[mood.labelKey]);
  }

  const spokenPatientIdRef = useRef(null);

  // Greeting voice readout - runs strictly ONCE per patient profile
  useEffect(() => {
    if (activePatient?.id && spokenPatientIdRef.current !== activePatient.id) {
      spokenPatientIdRef.current = activePatient.id;
      const audioPrefix = t.audio?.greeting || t.audio?.home_greeting || "Good morning";
      const greetingAudio = `${String(audioPrefix).trim()} ${activePatient.name || ""}`;
      const timer = setTimeout(() => {
        speakText(greetingAudio, lang);
      }, 600);
      return () => {
        clearTimeout(timer);
      };
    }
  }, [activePatient?.id, activePatient?.name]); // Strict dependencies, never loops on render

  // Loading state
  if (patientLoading) {
    return (
      <div className="ph-root" role="main">
        <header className="ph-topbar">
          <h1 className="ph-greeting">Smriti</h1>
          <LanguageSelector
            currentLang={lang}
            onChange={handleLanguageChange}
            variant="dropdown"
          />
        </header>
        <div className="ph-state-card">
          <div className="ph-spinner" aria-hidden="true" />
          {t.loading}
        </div>
      </div>
    );
  }

  // ── STRICT EMPTY STATE: No patient added yet ─────────────────────
  if (!activePatient) {
    return (
      <div className="ph-root" role="main">
        <header className="ph-topbar">
          <h1 className="ph-greeting">
            Welcome to <span>Smriti</span>
          </h1>
          <LanguageSelector
            currentLang={lang}
            onChange={handleLanguageChange}
            variant="dropdown"
          />
        </header>

        <div className="ph-state-card empty-patient-setup-card">
          <div style={{ fontSize: "40px", marginBottom: "12px" }}>🌿</div>
          <h2 style={{ fontSize: "20px", fontWeight: "800", color: "#1F3D33", marginBottom: "8px" }}>
            {lang === "bn"
              ? "কোনো রোগীর প্রোফাইল পাওয়া যায়নি"
              : lang === "as"
              ? "কোনো ৰোগীৰ প্ৰফাইল পোৱা নগ'ল"
              : "No Patient Profile Found"}
          </h2>
          <p style={{ fontSize: "15px", color: "#52665E", lineHeight: "1.5", marginBottom: "20px" }}>
            {lang === "bn"
              ? "শুরু করতে অনুগ্রহ করে ফ্যামিলি ট্যাবে একটি রোগীর প্রোফাইল তৈরি করুন।"
              : lang === "as"
              ? "আৰম্ভ কৰিবলৈ অনুগ্ৰহ কৰি পৰিয়াল টেবত এজন ৰোগীৰ প্ৰফাইল তৈয়াৰ কৰক।"
              : "Please set up a patient profile in the Family tab to get started."}
          </p>
          {onNavigateToFamily && (
            <button
              className="ph-game-btn"
              style={{ minHeight: "56px", fontSize: "16px", padding: "12px 24px" }}
              onClick={onNavigateToFamily}
            >
              {lang === "bn"
                ? "ফ্যামিলি ট্যাবে যান ➔"
                : lang === "as"
                ? "পৰিয়াল টেবলৈ যাওক ➔"
                : "Go to Family Tab ➔"}
            </button>
          )}
        </div>
      </div>
    );
  }

  const greetingPrefix = t.greeting || t.home_greeting || "Good morning";
  const greetingText = `${String(greetingPrefix).trim()} ${activePatient?.name || ""}`;
  const greetingAudioText = `${(t.audio?.greeting || t.audio?.home_greeting || String(greetingPrefix)).trim()} ${activePatient?.name || ""}`;
  const moodPromptText = t.how_feeling || t.home_mood_prompt || "How are you feeling today?";
  const remindersTitleText = t.reminders || t.home_reminders_title || "Reminders";

  // ── ACTIVE PATIENT HOME VIEW ───────────────────────────────────────
  return (
    <div className="ph-root" role="main">
      {/* Top Bar with Greeting & Language Toggle Dropdown */}
      <header className="ph-topbar">
        <div className="ph-greeting-wrap">
          <h1 className="ph-greeting">
            {String(greetingPrefix).trim()} <span>{activePatient?.name || ""}</span>
          </h1>
          <button
            id="speak-greeting-btn"
            type="button"
            className={`ph-speaker-btn micro${speakingId === "greeting" ? " speaking" : ""}`}
            onClick={() => handleSpeak(greetingText, "greeting", greetingAudioText)}
            aria-label={`${t.read_aloud || "Read aloud"}: ${greetingText}`}
            title={t.read_aloud || "Read aloud"}
          >
            <Volume2 size={20} />
          </button>
        </div>
        <LanguageSelector
          currentLang={lang}
          onChange={handleLanguageChange}
          variant="dropdown"
        />
      </header>

      {/* Mood Check-in with Audio Readout */}
      <section aria-label="Mood check-in">
        <div className="ph-section-header-row">
          <p className="ph-mood-prompt">{moodPromptText}</p>
          <button
            id="speak-mood-prompt-btn"
            type="button"
            className={`ph-speaker-btn micro${speakingId === "mood-prompt" ? " speaking" : ""}`}
            onClick={() => handleSpeak(moodPromptText, "mood-prompt")}
            aria-label={`${t.read_aloud || "Read aloud"}: ${moodPromptText}`}
            title={t.read_aloud || "Read aloud"}
          >
            <Volume2 size={18} />
          </button>
        </div>

        <div className="ph-mood-buttons" role="group" aria-label="Mood options">
          {(MOODS || []).map((mood) => (
            <button
              key={mood.score}
              id={`mood-btn-${mood.score}`}
              className={`ph-mood-btn${
                selectedMood === mood.score ? " selected" : ""
              }`}
              onClick={() => handleMoodSelect(mood)}
              disabled={moodSaving}
              aria-pressed={selectedMood === mood.score}
              aria-label={t[mood.labelKey]}
            >
              <span className="ph-mood-emoji" aria-hidden="true">
                {mood.emoji}
              </span>
              {t[mood.labelKey]}
            </button>
          ))}
        </div>
      </section>

      <hr className="ph-divider" aria-hidden="true" />

      {/* Reminders List with Speaker Icons */}
      <section id="reminders-section" aria-label={remindersTitleText}>
        <div className="ph-reminders-header">
          <div className="ph-reminders-icon" aria-hidden="true">
            🔔
          </div>
          <h2 className="ph-reminders-title">{remindersTitleText}</h2>
          <button
            id="speak-reminders-title-btn"
            type="button"
            className={`ph-speaker-btn micro${speakingId === "reminders-title" ? " speaking" : ""}`}
            onClick={() => handleSpeak(remindersTitleText, "reminders-title")}
            aria-label={`${t.read_aloud || "Read aloud"}: ${remindersTitleText}`}
            title={t.read_aloud || "Read aloud"}
          >
            <Volume2 size={18} />
          </button>
        </div>

        {remindersLoading && (
          <div className="ph-state-card" role="status" aria-live="polite">
            <div className="ph-spinner" aria-hidden="true" />
            {t.loading}
          </div>
        )}
        {remindersError && (
          <div className="ph-state-card error" role="alert">
            ⚠ {remindersError}
          </div>
        )}
        {!remindersLoading && !remindersError && (reminders || []).length === 0 && (
          <div className="ph-state-card">
            🌿 {t.no_reminders || (lang === "bn" ? "আজকের জন্য কোনো স্মারক নেই" : lang === "as" ? "আজিৰ বাবে কোনো কথা নাই" : "No reminders for today")}
          </div>
        )}
        {!remindersLoading && !remindersError && reminders.length > 0 && (
          <ul className="ph-reminders-list" aria-label={remindersTitleText}>
            {reminders.map((reminder, idx) => {
              const isItemSpeaking = speakingId === `reminder-${reminder.id}`;
              return (
                <li
                  key={reminder.id}
                  className={`ph-reminder-card${reminder.done ? " done" : ""}${isItemSpeaking ? " speaking-active" : ""}`}
                  style={{ animationDelay: `${idx * 60}ms` }}
                >
                  <div className="ph-reminder-icon-box" aria-hidden="true">
                    {getReminderIcon(reminder.text)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="ph-reminder-text-row">
                      <span className="ph-reminder-text">{reminder.text}</span>
                      {/* Speaker icon next to reminder item */}
                      <button
                        id={`speak-reminder-${reminder.id}`}
                        type="button"
                        className={`ph-speaker-btn inline-speaker${isItemSpeaking ? " speaking" : ""}`}
                        onClick={() => handleSpeak(reminder.text, `reminder-${reminder.id}`)}
                        aria-label={`${t.read_aloud || "Read aloud"}: ${reminder.text}`}
                        title={t.read_aloud || "Read aloud"}
                      >
                        <Volume2 size={18} />
                      </button>
                    </div>
                    {reminder.reminder_time && (
                      <div className="ph-reminder-time">
                        {formatTime(reminder.reminder_time)}
                      </div>
                    )}
                  </div>
                  {!reminder.done ? (
                    <button
                      id={`reminder-done-${reminder.id}`}
                      className="ph-reminder-done-btn"
                      onClick={() => handleReminderDone(reminder)}
                      aria-label={`${t.reminder_done || t.done}: ${reminder.text}`}
                    >
                      {t.reminder_done || t.done}
                    </button>
                  ) : (
                    <span className="ph-checkmark" aria-label="Done" role="img">
                      ✅
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Cognitive Games */}
      <section className="ph-game-section">
        <button
          id="play-memory-game-btn"
          className="ph-game-btn"
          onClick={() => {
            handleSpeak(t.play_game || t.home_play_game, "game-memory");
            if (onPlayGame) onPlayGame();
          }}
          aria-label={t.play_game || t.home_play_game}
        >
          <span className="ph-game-btn-icon" aria-hidden="true">
            🧠
          </span>
          {t.play_game || t.home_play_game}
        </button>
        <button
          id="play-pattern-game-btn"
          className="ph-game-btn pattern"
          onClick={() => {
            handleSpeak(t.play_pattern || t.home_play_pattern_game || "Play Pattern Game", "game-pattern");
            if (onPlayPatternGame) onPlayPatternGame();
          }}
          aria-label={t.play_pattern || t.home_play_pattern_game || "Play Pattern Game"}
        >
          <span className="ph-game-btn-icon" aria-hidden="true">
            🧩
          </span>
          {t.play_pattern || t.home_play_pattern_game || "Play Pattern Game"}
        </button>
      </section>

      <div
        className={`ph-toast${toast.visible ? " visible" : ""}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {toast.message}
      </div>
    </div>
  );
}