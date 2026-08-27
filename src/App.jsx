// src/App.jsx
import { useState, useEffect } from "react";
import PatientHome from "./pages/PatientHome";
import MemoryGame from "./pages/MemoryGame";
import PatternMatch from "./pages/PatternMatch";
import CaregiverDashboard from "./pages/CaregiverDashboard";
import Login from "./pages/Login";
import BottomTabBar from "./components/BottomTabBar";
import { useLanguage } from "./components/LanguageSelector";
import { strings } from "./i18n/strings";
import { supabase } from "./lib/supabaseClient";
import { processOfflineQueue } from "./lib/offlineUploadQueue";

const DEMO_PATIENT_ID = "88546630-8124-4047-8f78-b6a8be48fbc7";

export default function App() {
  const [screen, setScreen] = useState("home"); // "home" | "game" | "pattern" | "caregiver"
  const [activeTab, setActiveTab] = useState("home"); // "home" | "wellness" | "family"
  const [lang, setLang] = useLanguage("en");
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);

  const t = strings[lang] || strings.en;

  // Supabase Auth listener — relies on default session caching for offline access
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoadingSession(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoadingSession(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  // ── Offline → Online queue sync ─────────────────────────────────────
  useEffect(() => {
    function handleOnline() {
      console.log("[Smriti] Network restored — syncing offline upload queue…");
      processOfflineQueue((progress) => {
        console.log(
          `[Smriti] Synced ${progress.synced}/${progress.total} (${progress.failed} failed)`
        );
      }).then(({ synced, failed }) => {
        if (synced > 0) {
          console.log(`[Smriti] ✓ ${synced} prescription photo(s) synced to Supabase.`);
        }
        if (failed > 0) {
          console.warn(`[Smriti] ✗ ${failed} upload(s) failed — will retry next time.`);
        }
      });
    }

    window.addEventListener("online", handleOnline);

    if (navigator.onLine) {
      handleOnline();
    }

    return () => window.removeEventListener("online", handleOnline);
  }, []);

  function handleTabChange(tabId) {
    setActiveTab(tabId);
    if (tabId === "home") {
      setScreen("home");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (tabId === "wellness") {
      setScreen("home");
      setTimeout(() => {
        const el = document.getElementById("reminders-section");
        if (el) el.scrollIntoView({ behavior: "smooth" });
      }, 50);
    } else if (tabId === "family") {
      setScreen("caregiver");
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  // Handle explicit sign out — wipes local session and unmounts views
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setScreen("home");
    setActiveTab("home");
  };

  // Initial loading state while reading cached session
  if (loadingSession) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F5F2EB",
          color: "#1F3D33",
          fontFamily: "system-ui, sans-serif",
          fontWeight: 700,
        }}
      >
        Loading Smriti...
      </div>
    );
  }

  // 🔒 STRICT GLOBAL AUTH GATE: Require an active session for the entire application
  if (!session) {
    return (
      <Login
        lang={lang}
        onLoginSuccess={(newSession) => {
          setSession(newSession);
        }}
      />
    );
  }

  const userId = session?.user?.id;

  // ── Authenticated App Routes (keyed by userId to force fresh remounts on user switch) ──

  if (screen === "caregiver") {
    return (
      <>
        <CaregiverDashboard
          key={`${userId}_${activeTab}`}
          session={session}
          activeTab={activeTab}
          onSignOut={handleSignOut}
          lang={lang}
          onGoHome={() => {
            setScreen("home");
            setActiveTab("home");
          }}
        />
        <BottomTabBar
          activeTab={activeTab}
          onTabChange={handleTabChange}
          lang={lang}
        />
      </>
    );
  }

  if (screen === "game") {
    return (
      <MemoryGame
        key={`${userId}_game`}
        session={session}
        lang={lang}
        onGoHome={() => {
          setScreen("home");
          setActiveTab("home");
        }}
      />
    );
  }

  if (screen === "pattern") {
    return (
      <PatternMatch
        key={`${userId}_pattern`}
        session={session}
        lang={lang}
        onGoHome={() => {
          setScreen("home");
          setActiveTab("home");
        }}
      />
    );
  }

  return (
    <>
      <PatientHome
        key={`${userId}_${activeTab}`}
        session={session}
        activeTab={activeTab}
        lang={lang}
        onLangChange={setLang}
        onPlayGame={() => setScreen("game")}
        onPlayPatternGame={() => setScreen("pattern")}
        onNavigateToFamily={() => handleTabChange("family")}
      />
      <BottomTabBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        lang={lang}
      />
    </>
  );
}