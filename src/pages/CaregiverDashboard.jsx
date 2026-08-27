// src/pages/CaregiverDashboard.jsx
//
// Caregiver Dashboard — Smriti
// All data is fetched dynamically from Supabase strictly filtering by caregiver_id = session.user.id.
// Merges local storage records with Supabase results for seamless offline/tab navigation persistence.

import { useState, useEffect, useCallback, useRef } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Menu, Pill, AlertTriangle, Edit2, Plus, LogOut, ChevronDown,
  PawPrint, Utensils, MapPin, Sparkles, X, FileText,
  Camera, Upload, WifiOff, UserPlus, Heart, TrendingUp, Bell,
  Eye, Maximize2, Image as ImageIcon, Trash2, Check
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { strings } from "../i18n/strings";
import { computeDifficulty } from "./MemoryGame";
import { uploadOrQueue, getPendingCount, processOfflineQueue } from "../lib/offlineUploadQueue";
import TrendBadge from "../components/TrendBadge";
import { getPerformanceTrend } from "../utils/trendAnalysis";
import { readPrescription, isGeminiConfigured } from "../utils/readPrescription";
import "./CaregiverDashboard.css";

// ── Category config ───────────────────────────────────────────────────
const CATEGORIES = ["life_event", "favorite_food", "person", "place", "daily_note"];
const CAT_ICONS = {
  life_event: Sparkles,
  favorite_food: Utensils,
  person: PawPrint,
  place: MapPin,
  daily_note: FileText,
};
const catLabel = (cat, t) => t[`cat_${cat}`] || cat.replace(/_/g, " ");

// ── Local Storage Cache & Deduplication Helpers ───────────────────────
export function getLocalStories(patientId) {
  if (!patientId) return [];
  try {
    const raw = localStorage.getItem(`smriti_stories_${patientId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalStory(patientId, story) {
  if (!patientId || !story) return;
  try {
    const existing = getLocalStories(patientId);
    const updated = [story, ...existing.filter((s) => String(s.id) !== String(story.id))];
    localStorage.setItem(`smriti_stories_${patientId}`, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed saving local story:", err);
  }
}

export function getLocalReminders(patientId) {
  if (!patientId) return [];
  try {
    const raw = localStorage.getItem(`smriti_reminders_${patientId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalReminder(patientId, reminder) {
  if (!patientId || !reminder) return;
  try {
    const existing = getLocalReminders(patientId);
    const updated = [reminder, ...existing.filter((r) => String(r.id) !== String(reminder.id))];
    localStorage.setItem(`smriti_reminders_${patientId}`, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed saving local reminder:", err);
  }
}

export function getLocalGameSessions(patientId) {
  if (!patientId) return [];
  try {
    const raw = localStorage.getItem(`smriti_game_sessions_${patientId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalGameSession(patientId, session) {
  if (!patientId || !session) return;
  try {
    const existing = getLocalGameSessions(patientId);
    const updated = [...existing.filter((s) => String(s.id) !== String(session.id)), session];
    localStorage.setItem(`smriti_game_sessions_${patientId}`, JSON.stringify(updated));
  } catch (err) {
    console.warn("Failed saving local game session:", err);
  }
}

export function mergeDedupe(serverItems = [], localItems = []) {
  const map = new Map();
  const validServer = Array.isArray(serverItems) ? serverItems : [];
  const validLocal = Array.isArray(localItems) ? localItems : [];

  validServer.forEach((item) => {
    if (item && item.id !== undefined && item.id !== null) map.set(String(item.id), item);
  });
  validLocal.forEach((item) => {
    if (item && item.id !== undefined && item.id !== null && !map.has(String(item.id))) {
      map.set(String(item.id), item);
    }
  });
  return Array.from(map.values());
}

// ── Toast hook ────────────────────────────────────────────────────────
function useToast() {
  const [toast, setToast] = useState({ visible: false, msg: "", type: "success" });
  function show(msg, type = "success") {
    setToast({ visible: true, msg, type });
    setTimeout(() => setToast((p) => ({ ...p, visible: false })), 3200);
  }
  return [toast, show];
}

// ═══════════════════════════════════════════════════════════════════════
export default function CaregiverDashboard({ lang = "en", onGoHome, session, onSignOut, activeTab }) {
  const t = strings[lang] || strings.en;
  const fileInputRef = useRef(null);
  const userId = session?.user?.id;

  // ── Patients ────────────────────────────────────────────────────────
  const [patients, setPatients] = useState([]);
  const [patientsLoading, setPL] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [showAddPt, setShowAddPt] = useState(false);
  const [newName, setNewName] = useState("");
  const [newLang, setNewLang] = useState("en");
  const [savingPt, setSavingPt] = useState(false);

  // ── Medical overview (fetched per patient) ──────────────────────────
  const [prescriptions, setPrescriptions] = useState([]);
  const [allergies, setAllergies] = useState([]);
  const [editingMedical, setEditingMedical] = useState(false);
  const [newRxName, setNewRxName] = useState("");
  const [newRxDosage, setNewRxDosage] = useState("");
  const [newAllergyName, setNewAllergyName] = useState("");
  const [editingRxId, setEditingRxId] = useState(null);
  const [editRxName, setEditRxName] = useState("");
  const [editRxDosage, setEditRxDosage] = useState("");
  const [updatingRx, setUpdatingRx] = useState(false);

  // ── Reminders ───────────────────────────────────────────────────────
  const [reminders, setReminders] = useState([]);
  const [showAddReminderModal, setShowAddReminderModal] = useState(false);
  const [reminderText, setReminderText] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [savingReminder, setSavingReminder] = useState(false);

  // ── Prescription photo upload ─────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [prescriptionPhotoUrl, setPrescriptionPhotoUrl] = useState(null);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [pendingUploads, setPendingUploads] = useState(0);

  // ── Prescription AI OCR ──────────────────────────────────────────
  const scanInputRef = useRef(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [scannedMedicines, setScannedMedicines] = useState([]);   // [{ name, dosage, instructions }]

  // ── Patient data ────────────────────────────────────────────────────
  const [moods, setMoods] = useState([]);
  const [gameSessions, setGameSessions] = useState([]);
  const [stories, setStories] = useState([]);
  const [dataLoading, setDL] = useState(false);

  // ── FAB Modal ───────────────────────────────────────────────────────
  const [showFabModal, setShowFabModal] = useState(false);
  const [stCat, setStCat] = useState("life_event");
  const [stTitle, setStTitle] = useState("");
  const [stDesc, setStDesc] = useState("");
  const [savingSt, setSavingSt] = useState(false);

  // ── Toast ───────────────────────────────────────────────────────────
  const [toast, showToast] = useToast();

  // ══════════════════════════════════════════════════════════════════════
  //  DATA FETCHING
  // ══════════════════════════════════════════════════════════════════════

  // Check pending offline uploads on mount
  useEffect(() => {
    getPendingCount().then(setPendingUploads).catch(() => {});
  }, []);

  // Listen for online event to refresh pending count
  useEffect(() => {
    function handleOnline() {
      setTimeout(() => {
        getPendingCount().then(setPendingUploads).catch(() => {});
      }, 3000);
    }
    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, []);

  // ── Load patients strictly for this caregiver_id ────────────────────
  useEffect(() => {
    if (!userId) {
      setPatients([]);
      setPL(false);
      return;
    }
    setPL(true);
    supabase
      .from("patients")
      .select("id, name, preferred_language")
      .eq("caregiver_id", userId)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error("[Dashboard] patients fetch error:", error.message);
        const pts = data || [];
        setPatients(pts);
        if (pts.length > 0) {
          setSelectedId(pts[0].id);
        } else {
          setSelectedId("");
        }
        setPL(false);
      });
  }, [userId]);

  // ── Load selected patient's data strictly filtered by caregiver_id ────
  const loadPatientData = useCallback(async (pid) => {
    if (!pid) {
      setMoods([]);
      setGameSessions([]);
      setStories([]);
      setPrescriptions([]);
      setAllergies([]);
      setReminders([]);
      setDL(false);
      return;
    }
    setDL(true);

    // 1. Fetch Mood Checkins
    try {
      let q = supabase
        .from("mood_checkins")
        .select("score, logged_at")
        .eq("patient_id", pid)
        .order("logged_at", { ascending: true })
        .limit(30);
      if (userId) q = q.eq("caregiver_id", userId);
      const { data, error } = await q;
      if (error) console.warn("[Dashboard] mood_checkins fetch error:", error.message);
      setMoods(data || []);
    } catch (err) {
      console.warn("[Dashboard] mood_checkins catch:", err);
      setMoods([]);
    }

    // 2. Fetch Game Sessions (game_sessions table has: id, patient_id, caregiver_id, category, correct, total, played_at)
    let serverSessions = [];
    try {
      let q = supabase
        .from("game_sessions")
        .select("id, category, correct, total, played_at")
        .eq("patient_id", pid)
        .order("played_at", { ascending: true })
        .limit(30);
      if (userId) q = q.eq("caregiver_id", userId);
      const { data, error } = await q;
      if (error) {
        console.warn("[Dashboard] game_sessions fetch error:", error.message);
      } else {
        serverSessions = data || [];
      }
    } catch (err) {
      console.warn("[Dashboard] game_sessions catch:", err);
    }
    const localSessions = getLocalGameSessions(pid);
    setGameSessions(mergeDedupe(serverSessions, localSessions));

    // 3. Fetch Life Stories (life_stories table has: id, patient_id, category, title, description, photo_url, created_at)
    let serverStories = [];
    try {
      const { data, error } = await supabase
        .from("life_stories")
        .select("id, category, title, description, photo_url, created_at")
        .eq("patient_id", pid)
        .order("created_at", { ascending: false });
      if (error) {
        console.warn("[Dashboard] life_stories fetch error:", error.message);
      } else {
        serverStories = data || [];
      }
    } catch (err) {
      console.warn("[Dashboard] life_stories catch:", err);
    }
    const localStories = getLocalStories(pid);
    setStories(mergeDedupe(serverStories, localStories));

    // 4. Fetch Prescriptions
    try {
      let q = supabase
        .from("prescriptions")
        .select("id, name, dosage")
        .eq("patient_id", pid)
        .order("created_at", { ascending: true });
      if (userId) q = q.eq("caregiver_id", userId);
      const rxRes = await q;
      setPrescriptions(rxRes.data || []);
    } catch {
      setPrescriptions([]);
    }

    // 5. Fetch Allergies
    try {
      let q = supabase
        .from("allergies")
        .select("id, name")
        .eq("patient_id", pid)
        .order("created_at", { ascending: true });
      if (userId) q = q.eq("caregiver_id", userId);
      const algRes = await q;
      setAllergies(algRes.data || []);
    } catch {
      setAllergies([]);
    }

    // 6. Fetch Reminders
    try {
      let q = supabase
        .from("reminders")
        .select("id, text, reminder_time, done")
        .eq("patient_id", pid)
        .order("done", { ascending: true })
        .order("reminder_time", { ascending: true, nullsFirst: false });
      if (userId) q = q.eq("caregiver_id", userId);
      const remRes = await q;
      const serverReminders = remRes.data || [];
      const localReminders = getLocalReminders(pid);
      setReminders(mergeDedupe(serverReminders, localReminders));
    } catch {
      setReminders(getLocalReminders(pid));
    }

    // 7. Load Prescription Photo (LocalStorage cache + Supabase Storage)
    try {
      const localPhoto = localStorage.getItem(`smriti_rx_photo_${pid}`);
      if (localPhoto) {
        setPrescriptionPhotoUrl(localPhoto);
      } else {
        setPrescriptionPhotoUrl(null);
      }

      if (supabase) {
        const folder = userId ? `${userId}/${pid}` : pid;
        supabase.storage
          .from("prescriptions")
          .list(folder, { limit: 5, sortBy: { column: "created_at", order: "desc" } })
          .then(({ data: files }) => {
            if (files && files.length > 0) {
              const valid = files.find((f) => f.name && !f.name.startsWith("."));
              if (valid) {
                const { data: pubData } = supabase.storage
                  .from("prescriptions")
                  .getPublicUrl(`${folder}/${valid.name}`);
                if (pubData?.publicUrl) {
                  setPrescriptionPhotoUrl(pubData.publicUrl);
                }
              }
            }
          })
          .catch(() => {});
      }
    } catch {
      // ignore
    }

    setDL(false);
  }, [userId]);

  useEffect(() => {
    if (selectedId) {
      loadPatientData(selectedId);
    } else {
      setMoods([]);
      setGameSessions([]);
      setStories([]);
      setPrescriptions([]);
      setAllergies([]);
      setReminders([]);
      setPrescriptionPhotoUrl(null);
      setUploadPreview(null);
    }
  }, [selectedId, loadPatientData, activeTab]);

  // Sync data on window focus or tab navigation
  useEffect(() => {
    function handleFocus() {
      if (selectedId) {
        loadPatientData(selectedId);
      }
    }
    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [selectedId, loadPatientData]);

  // ══════════════════════════════════════════════════════════════════════
  //  HANDLERS
  // ══════════════════════════════════════════════════════════════════════

  async function handleAddPatient(e) {
    e.preventDefault();
    if (!newName.trim()) {
      showToast("✗ Please enter a patient name.", "error");
      return;
    }
    setSavingPt(true);

    const { data: authData, error: authError } = await supabase.auth.getSession();
    if (authError || !authData?.session?.user) {
      console.error("No active session found during save!", authError);
      showToast("✗ No active session found during save!", "error");
      setSavingPt(false);
      return;
    }

    const actualUserId = authData.session.user.id;
    console.log("Attempting to save patient with caregiver_id:", actualUserId);

    try {
      await supabase.from("caregivers").upsert(
        { id: actualUserId, email: authData.session.user.email || "" },
        { onConflict: "id" }
      );
    } catch (err) {
      console.warn("Caregivers upsert skipped:", err);
    }

    const { data, error } = await supabase
      .from("patients")
      .insert([
        {
          name: newName.trim(),
          preferred_language: newLang,
          caregiver_id: actualUserId,
        },
      ])
      .select("id, name, preferred_language")
      .single();

    if (!error && data) {
      setPatients((p) => [...p, data]);
      setSelectedId(data.id);
      setNewName("");
      setNewLang("en");
      setShowAddPt(false);
      showToast("✓ " + t.patient_added_ok);
    } else if (error) {
      console.error("[Add Patient Error]", error);
      showToast("✗ " + (error.message || "Failed to add patient"), "error");
    }
    setSavingPt(false);
  }

  async function handleAddReminder(e) {
    if (e) e.preventDefault();
    if (!reminderText.trim() || !selectedId) return;
    setSavingReminder(true);

    const { data: authData } = await supabase.auth.getSession();
    const actualUserId = authData?.session?.user?.id || userId;

    const payload = {
      patient_id: selectedId,
      caregiver_id: actualUserId,
      text: reminderText.trim(),
      reminder_time: reminderTime || null,
      done: false,
    };

    const { data, error } = await supabase
      .from("reminders")
      .insert([payload])
      .select()
      .single();

    if (!error && data) {
      saveLocalReminder(selectedId, data);
      setReminders((p) => mergeDedupe([data], p));
      showToast("✓ Reminder saved!");
    } else {
      const fallbackItem = {
        id: "local_rem_" + Date.now(),
        ...payload,
        created_at: new Date().toISOString(),
      };
      saveLocalReminder(selectedId, fallbackItem);
      setReminders((p) => mergeDedupe([fallbackItem], p));
      showToast("✓ Reminder saved locally.", "offline");
    }

    setReminderText("");
    setReminderTime("");
    setShowAddReminderModal(false);
    setSavingReminder(false);
  }

  async function handleAddRecord(e) {
    e.preventDefault();
    if (!stTitle.trim() || !stDesc.trim() || !selectedId) return;
    setSavingSt(true);

    const payload = {
      patient_id: selectedId,
      category: stCat,
      title: stTitle.trim(),
      description: stDesc.trim(),
    };

    try {
      const { data, error } = await supabase
        .from("life_stories")
        .insert([payload])
        .select()
        .single();

      if (!error && data) {
        saveLocalStory(selectedId, data);
        setStories((p) => mergeDedupe([data], p));
        showToast("✓ Record added!");
      } else {
        const fallbackItem = {
          id: "local_story_" + Date.now(),
          ...payload,
          created_at: new Date().toISOString(),
        };
        saveLocalStory(selectedId, fallbackItem);
        setStories((p) => mergeDedupe([fallbackItem], p));
        showToast("✓ Record saved locally.", "offline");
      }
    } catch (err) {
      console.warn("Failed saving life story to Supabase, saving locally:", err);
      const fallbackItem = {
        id: "local_story_" + Date.now(),
        ...payload,
        created_at: new Date().toISOString(),
      };
      saveLocalStory(selectedId, fallbackItem);
      setStories((p) => mergeDedupe([fallbackItem], p));
      showToast("✓ Record saved locally.", "offline");
    }

    setStTitle("");
    setStDesc("");
    setShowFabModal(false);
    setSavingSt(false);
  }

  async function handleAddPrescription() {
    if (!newRxName.trim() || !selectedId) return;

    const { data: authData } = await supabase.auth.getSession();
    const actualUserId = authData?.session?.user?.id || userId;

    const payload = {
      patient_id: selectedId,
      caregiver_id: actualUserId,
      name: newRxName.trim(),
      dosage: newRxDosage.trim() || "",
    };

    const { data, error } = await supabase
      .from("prescriptions")
      .insert([payload])
      .select()
      .single();

    if (!error && data) {
      setPrescriptions((p) => [...p, data]);
    } else {
      setPrescriptions((p) => [...p, { id: Date.now(), ...payload }]);
    }
    setNewRxName("");
    setNewRxDosage("");
    showToast("✓ Prescription added!");
  }

  function startEditingPrescription(rx) {
    setEditingRxId(rx.id);
    setEditRxName(rx.name || "");
    setEditRxDosage(rx.dosage || "");
  }

  function cancelEditingPrescription() {
    setEditingRxId(null);
    setEditRxName("");
    setEditRxDosage("");
  }

  async function handleUpdatePrescription(rxId) {
    if (!editRxName.trim()) {
      showToast("✗ Medication name cannot be empty.", "error");
      return;
    }
    setUpdatingRx(true);
    const updatedFields = {
      name: editRxName.trim(),
      dosage: editRxDosage.trim(),
    };

    // Update in Supabase
    try {
      const { error } = await supabase
        .from("prescriptions")
        .update(updatedFields)
        .eq("id", rxId);

      if (error) {
        console.warn("[Prescriptions] Supabase update warning:", error.message);
      }
    } catch (err) {
      console.warn("[Prescriptions] Update error:", err);
    }

    // Update local state immediately
    setPrescriptions((prev) =>
      prev.map((rx) => (rx.id === rxId ? { ...rx, ...updatedFields } : rx))
    );

    cancelEditingPrescription();
    setUpdatingRx(false);
    showToast("✓ Prescription updated!", "success");
  }

  async function handleDeletePrescription(rxId, rxName) {
    // Immediately remove from local React state
    setPrescriptions((prev) => prev.filter((rx) => rx.id !== rxId));

    try {
      const { error } = await supabase
        .from("prescriptions")
        .delete()
        .eq("id", rxId);

      if (error) {
        console.warn("[Prescriptions] Supabase delete warning:", error.message);
      }
    } catch (err) {
      console.warn("[Prescriptions] Delete error:", err);
    }

    showToast(`✓ Removed ${rxName || "prescription"}`);
  }

  async function handleAddAllergy() {
    if (!newAllergyName.trim() || !selectedId) return;

    const { data: authData } = await supabase.auth.getSession();
    const actualUserId = authData?.session?.user?.id || userId;

    const payload = {
      patient_id: selectedId,
      caregiver_id: actualUserId,
      name: newAllergyName.trim(),
    };

    const { data, error } = await supabase
      .from("allergies")
      .insert([payload])
      .select()
      .single();

    if (!error && data) {
      setAllergies((p) => [...p, data]);
    } else {
      setAllergies((p) => [...p, { id: Date.now(), ...payload }]);
    }
    setNewAllergyName("");
    showToast("✓ Allergy added!");
  }

  // ── Prescription Photo Upload (cloud storage) ────────────────────
  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    const { data: authData } = await supabase.auth.getSession();
    const actualUserId = authData?.session?.user?.id || userId;

    if (!file || !actualUserId) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setUploadPreview(dataUrl);
      setPrescriptionPhotoUrl(dataUrl);
      if (selectedId) {
        try {
          localStorage.setItem(`smriti_rx_photo_${selectedId}`, dataUrl);
        } catch (err) {
          console.warn("Could not cache photo to localStorage:", err);
        }
      }
    };
    reader.readAsDataURL(file);

    setUploading(true);
    const result = await uploadOrQueue(file, actualUserId, selectedId);

    if (result.status === "uploaded") {
      showToast("✓ Prescription photo uploaded to cloud!", "success");
    } else if (result.status === "queued") {
      const count = await getPendingCount();
      setPendingUploads(count);
      showToast("📥 Saved offline. Will sync when connected.", "offline");
    } else {
      showToast("✗ Upload failed: " + (result.error || "Unknown error"), "error");
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── Prescription AI OCR Scan ──────────────────────────────────
  async function handleAIScan(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (scanInputRef.current) scanInputRef.current.value = "";

    // Show image preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target.result;
      setUploadPreview(dataUrl);
      setPrescriptionPhotoUrl(dataUrl);
      if (selectedId) {
        try {
          localStorage.setItem(`smriti_rx_photo_${selectedId}`, dataUrl);
        } catch (err) {
          console.warn("Could not cache scanned photo to localStorage:", err);
        }
      }
    };
    reader.readAsDataURL(file);

    setScanning(true);
    setScanError(null);
    setScannedMedicines([]);

    try {
      const result = await readPrescription(file);

      if (result.error && (!result.medicines || result.medicines.length === 0)) {
        setScanError(result.error);
        showToast("✗ " + result.error, "error");
        alert("Failed to scan prescription. Please try again.");
        return;
      }

      if (!result.medicines || result.medicines.length === 0) {
        setScanError("No medicines detected. Try a clearer image.");
        showToast("No medicines detected. Try a clearer image.", "error");
        return;
      }

      setScannedMedicines(result.medicines);
      showToast(`✓ Found ${result.medicines.length} medicine(s) — review below.`, "success");
    } catch (err) {
      console.error("[handleAIScan] Error:", err);
      setScanError("Failed to scan prescription. Please try again.");
      alert("Failed to scan prescription. Please try again.");
    } finally {
      setScanning(false);
    }
  }

  // Add all scanned medicines to the patient record in one batch
  async function handleConfirmScannedMedicines() {
    if (!scannedMedicines.length || !selectedId) return;

    const { data: authData } = await supabase.auth.getSession();
    const actualUserId = authData?.session?.user?.id || userId;

    const payloads = scannedMedicines.map((m) => ({
      patient_id: selectedId,
      caregiver_id: actualUserId,
      name: m.name || "Unknown",
      dosage: [m.dosage, m.instructions].filter(Boolean).join(" — ") || "",
    }));

    const { data, error } = await supabase
      .from("prescriptions")
      .insert(payloads)
      .select();

    if (!error && data) {
      setPrescriptions((p) => [...p, ...data]);
    } else {
      // Fallback — add locally with temp IDs
      setPrescriptions((p) => [
        ...p,
        ...payloads.map((pl) => ({ id: "local_rx_" + Date.now() + Math.random(), ...pl })),
      ]);
    }

    setScannedMedicines([]);
    setScanError(null);
    showToast(`✓ ${payloads.length} prescription(s) added!`, "success");
  }

  async function handleManualSync() {
    if (!navigator.onLine) {
      showToast("⚠ Still offline. Connect to sync.", "offline");
      return;
    }
    setUploading(true);
    try {
      const { synced, failed, errors } = await processOfflineQueue();
      const count = await getPendingCount();
      setPendingUploads(count);
      if (synced > 0 && failed === 0) {
        showToast(`✓ Synced ${synced} photo(s)!`, "success");
      } else if (failed > 0) {
        const errorSummary = errors?.[0]?.error || "Check Supabase storage bucket setup";
        console.error("[CaregiverDashboard] Sync failures:", errors);
        showToast(`✗ ${failed} upload(s) failed: ${errorSummary}`, "error");
      } else {
        showToast("Queue is empty — nothing to sync.", "success");
      }
    } catch (err) {
      console.error("[CaregiverDashboard] Unexpected error in handleManualSync:", err);
      showToast(`✗ Sync error: ${err.message}`, "error");
    } finally {
      setUploading(false);
    }
  }

  // ── Chart 1: Mood Trends Data ──────────────────────────────────────
  const moodChartData = (moods || []).map((m) => ({
    date: m?.logged_at
      ? new Date(m.logged_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
      : "",
    score: m?.score,
  }));

  // ── Chart 2: Memory Game Performance Data ──────────────────────────
  // Sessions for memory game: anything that is NOT pattern_recognition
  const memorySessions = (gameSessions || [])
    .filter((s) => s?.category !== "pattern_recognition")
    .sort((a, b) => new Date(a?.played_at || 0) - new Date(b?.played_at || 0))
    .map((s) => ({
      accuracy: s?.total > 0 ? Math.round(((s?.correct || 0) / s.total) * 100) : 0,
      played_at: s?.played_at,
    }));

  const memoryChartData = memorySessions.map((s) => ({
    date: s.played_at
      ? new Date(s.played_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
      : "",
    accuracy: s.accuracy,
  }));

  const memoryTrend = getPerformanceTrend(memorySessions);

  // ── Chart 3: Pattern Game Performance Data ─────────────────────────
  const patternSessions = (gameSessions || [])
    .filter((s) => s?.category === "pattern_recognition")
    .sort((a, b) => new Date(a?.played_at || 0) - new Date(b?.played_at || 0))
    .map((s) => ({
      accuracy: s?.total > 0 ? Math.round(((s?.correct || 0) / s.total) * 100) : 0,
      played_at: s?.played_at,
    }));

  const patternChartData = patternSessions.map((s) => ({
    date: s.played_at
      ? new Date(s.played_at).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })
      : "",
    accuracy: s.accuracy,
  }));

  const patternTrend = getPerformanceTrend(patternSessions);

  const hasPatients = (patients || []).length > 0;

  // ════════════════════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════════════════════
  return (
    <div className="caregiver-dashboard-root">
      {/* ── Navbar ──────────────────────────────────────────────────── */}
      <header className="cg-header">
        <div className="header-left">
          <button className="icon-btn-ghost" aria-label="Back to Home" onClick={onGoHome}>
            <Menu size={22} color="#1F3D33" />
          </button>
          <span className="cg-header-title">Caregiver Support</span>
        </div>
        <div className="header-right">
          {onSignOut && (
            <button className="signout-btn" onClick={onSignOut} title="Sign Out">
              <LogOut size={16} />
              <span>Sign Out</span>
            </button>
          )}
          <div className="user-avatar-circle">
            <span className="avatar-initial">
              {session?.user?.email?.[0]?.toUpperCase() || "C"}
            </span>
          </div>
        </div>
      </header>

      <main className="cg-main-container">
        <h1 className="cg-page-title">Patient Profiles & Records</h1>

        {/* ════════════════════════════════════════════════════════════ */}
        {/*  EMPTY STATE — No patients yet                             */}
        {/* ════════════════════════════════════════════════════════════ */}
        {!patientsLoading && !hasPatients && !showAddPt && (
          <div className="empty-state-card">
            <div className="empty-state-icon-wrap">
              <Heart size={36} className="empty-state-icon" />
            </div>
            <h2 className="empty-state-heading">Welcome to Smriti</h2>
            <p className="empty-state-body">
              Add your first patient to get started. You'll be able to track their prescriptions,
              allergies, life stories, and cognitive health — all in one place.
            </p>
            <button
              className="empty-state-cta"
              onClick={() => setShowAddPt(true)}
            >
              <UserPlus size={18} />
              <span>+ Add Patient</span>
            </button>
          </div>
        )}

        {/* ── Patient Selection Bar (only when patients exist) ─────── */}
        {(hasPatients || showAddPt) && (
          <>
            <div className="patient-select-bar">
              <div className="patient-dropdown-wrap">
                {patientsLoading ? (
                  <span className="cg-spinner" />
                ) : (
                  <select
                    id="patient-selector"
                    className="patient-select-input"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                  >
                    {(patients || []).length === 0 && <option value="">No patients yet</option>}
                    {(patients || []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
                <ChevronDown size={18} className="select-arrow" />
              </div>

              <button className="add-patient-pill-btn" onClick={() => setShowAddPt(!showAddPt)}>
                <Plus size={16} />
                <span>Patient</span>
              </button>
            </div>

            {/* Inline Add Patient Drawer */}
            {showAddPt && (
              <form className="add-patient-inline-card" onSubmit={handleAddPatient}>
                <h3>Add New Patient Profile</h3>
                <div className="form-row-inline">
                  <input
                    type="text"
                    required
                    placeholder="Patient Full Name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="cg-input"
                  />
                  <select
                    value={newLang}
                    onChange={(e) => setNewLang(e.target.value)}
                    className="cg-select"
                  >
                    <option value="en">English</option>
                    <option value="as">অসমীয়া (Assamese)</option>
                  </select>
                </div>
                <div className="form-actions-inline">
                  <button type="submit" className="cg-btn-primary" disabled={savingPt}>
                    {savingPt ? "Saving..." : "Save Patient"}
                  </button>
                  <button
                    type="button"
                    className="cg-btn-secondary"
                    onClick={() => setShowAddPt(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </>
        )}

        {/* ════════════════════════════════════════════════════════════ */}
        {/*  PATIENT-SPECIFIC CONTENT                                   */}
        {/* ════════════════════════════════════════════════════════════ */}
        {selectedId && (
          <>
            {/* Loading indicator */}
            {dataLoading && (
              <div className="data-loading-indicator">
                <span className="cg-spinner" />
                <span>Loading patient data…</span>
              </div>
            )}

            {/* ── CARD 1: Medical Overview ──────────────────────────── */}
            <section className="cg-card medical-overview-card">
              <div className="card-header-row">
                <h2 className="card-heading">Medical Overview</h2>
                <button
                  className="icon-edit-btn"
                  title="Edit Medical Records"
                  onClick={() => setEditingMedical(!editingMedical)}
                >
                  <Edit2 size={16} />
                </button>
              </div>

              {/* ACTIVE PRESCRIPTIONS */}
              <div className="medical-subsection">
                <span className="subsection-label">ACTIVE PRESCRIPTIONS</span>
                {(prescriptions || []).length === 0 ? (
                  <div className="subsection-empty">
                    <Pill size={16} />
                    <span>No prescriptions recorded yet.</span>
                  </div>
                ) : (
                  <div className="medical-item-list">
                    {(prescriptions || []).map((rx) => {
                      const isEditing = editingRxId === rx.id;
                      if (isEditing) {
                        return (
                          <div key={rx.id} className="medical-item-row prescription-row editing-row">
                            <div className="rx-inline-edit-inputs">
                              <input
                                type="text"
                                className="rx-edit-input rx-edit-name"
                                placeholder="Medication name"
                                value={editRxName}
                                onChange={(e) => setEditRxName(e.target.value)}
                                autoFocus
                              />
                              <input
                                type="text"
                                className="rx-edit-input rx-edit-dosage"
                                placeholder="Dosage (e.g. 500mg)"
                                value={editRxDosage}
                                onChange={(e) => setEditRxDosage(e.target.value)}
                              />
                            </div>
                            <div className="rx-inline-edit-actions">
                              <button
                                type="button"
                                className="rx-save-inline-btn"
                                title="Save changes"
                                disabled={updatingRx}
                                onClick={() => handleUpdatePrescription(rx.id)}
                              >
                                <Check size={14} />
                                <span>Save</span>
                              </button>
                              <button
                                type="button"
                                className="rx-cancel-inline-btn"
                                title="Cancel edit"
                                onClick={cancelEditingPrescription}
                              >
                                <X size={14} />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div key={rx.id} className="medical-item-row prescription-row">
                          <div className="item-icon-circle prescription-icon-bg">
                            <Pill size={16} className="prescription-icon" />
                          </div>
                          <span className="item-text">
                            {rx.name}{rx.dosage ? ` - ${rx.dosage}` : ""}
                          </span>
                          {(uploadPreview || prescriptionPhotoUrl) && (
                            <button
                              type="button"
                              className="rx-row-thumb-btn"
                              title="View attached prescription document"
                              onClick={() => setShowPhotoModal(true)}
                            >
                              <img
                                src={uploadPreview || prescriptionPhotoUrl}
                                alt="Rx document"
                                className="rx-row-mini-thumb"
                              />
                              <span className="rx-thumb-label">View Rx</span>
                            </button>
                          )}
                          <div className="item-row-actions">
                            <button
                              type="button"
                              className="item-action-icon edit"
                              title="Edit prescription name or dosage"
                              onClick={() => startEditingPrescription(rx)}
                            >
                              <Edit2 size={14} />
                            </button>
                            <button
                              type="button"
                              className="item-action-icon delete"
                              title="Delete prescription permanently"
                              onClick={() => handleDeletePrescription(rx.id, rx.name)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* KNOWN ALLERGIES */}
              <div className="medical-subsection">
                <span className="subsection-label">KNOWN ALLERGIES</span>
                {(allergies || []).length === 0 ? (
                  <div className="subsection-empty">
                    <AlertTriangle size={16} />
                    <span>No allergies recorded yet.</span>
                  </div>
                ) : (
                  <div className="medical-item-list">
                    {(allergies || []).map((alg) => (
                      <div key={alg.id} className="medical-item-row allergy-row">
                        <div className="item-icon-circle allergy-icon-bg">
                          <AlertTriangle size={16} className="allergy-icon" />
                        </div>
                        <span className="item-text">{alg.name}</span>
                        <button className="item-edit-icon" onClick={() => setEditingMedical(true)}>
                          <Edit2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ── PRESCRIPTION PHOTO UPLOAD ───────────────────────── */}
              <div className="medical-subsection photo-upload-section">
                <span className="subsection-label">PRESCRIPTION PHOTO</span>

                {/* Hidden file inputs */}
                <input
                  ref={fileInputRef}
                  id="rx-photo-input"
                  type="file"
                  accept="image/*"
                  className="hidden-file-input"
                  onChange={handlePhotoUpload}
                />
                <input
                  ref={scanInputRef}
                  id="rx-scan-input"
                  type="file"
                  accept="image/*"
                  className="hidden-file-input"
                  onChange={handleAIScan}
                />

                {/* Button row */}
                <div className="upload-btn-row">
                  <button
                    className="upload-photo-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading || scanning}
                  >
                    {uploading ? (
                      <>
                        <span className="cg-spinner upload-spinner" />
                        <span>Uploading…</span>
                      </>
                    ) : (
                      <>
                        <Camera size={18} />
                        <span>Upload Prescription Photo</span>
                      </>
                    )}
                  </button>

                  {/* AI Scan button — only shown when Gemini key is present */}
                  {isGeminiConfigured() && (
                    <button
                      id="ai-scan-prescription-btn"
                      className="upload-photo-btn ai-scan-btn"
                      onClick={() => scanInputRef.current?.click()}
                      disabled={uploading || scanning}
                      title="Scan prescription image with Gemini AI to auto-fill medicines"
                    >
                      {scanning ? (
                        <>
                          <span className="cg-spinner upload-spinner" />
                          <span>Scanning with AI…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={18} />
                          <span>Scan with AI</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Offline queue badge */}
                {pendingUploads > 0 && (
                  <div className="offline-queue-badge">
                    <WifiOff size={14} />
                    <span>{pendingUploads} photo{pendingUploads > 1 ? "s" : ""} queued offline</span>
                    {navigator.onLine && (
                      <button className="sync-now-btn" onClick={handleManualSync} disabled={uploading}>
                        <Upload size={14} />
                        Sync Now
                      </button>
                    )}
                  </div>
                )}

                {/* Photo preview thumbnail & details card */}
                {(uploadPreview || prescriptionPhotoUrl) && (
                  <div className="prescription-photo-card">
                    <div
                      className="prescription-photo-thumb-wrap"
                      onClick={() => setShowPhotoModal(true)}
                      title="Click to view full image"
                    >
                      <img
                        src={uploadPreview || prescriptionPhotoUrl}
                        alt="Prescription Document Preview"
                        className="prescription-photo-thumb"
                      />
                      <div className="prescription-photo-overlay">
                        <Maximize2 size={16} />
                        <span>Enlarge</span>
                      </div>
                    </div>

                    <div className="prescription-photo-details">
                      <div className="photo-badge-row">
                        <span className="photo-status-badge">
                          <ImageIcon size={12} />
                          {uploadPreview ? "Uploaded Preview" : "Cloud Record"}
                        </span>
                        <button
                          type="button"
                          className="photo-remove-btn"
                          title="Remove prescription image preview"
                          onClick={() => {
                            setUploadPreview(null);
                            setPrescriptionPhotoUrl(null);
                            if (selectedId) {
                              try {
                                localStorage.removeItem(`smriti_rx_photo_${selectedId}`);
                              } catch {}
                            }
                            showToast("Prescription preview cleared");
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <p className="photo-hint-text">
                        Prescription photo on record for this patient.
                      </p>

                      <div className="photo-actions-row">
                        <button
                          type="button"
                          className="photo-action-btn-view"
                          onClick={() => setShowPhotoModal(true)}
                        >
                          <Eye size={13} />
                          <span>View Full Size</span>
                        </button>
                        <button
                          type="button"
                          className="photo-action-btn-change"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploading || scanning}
                        >
                          <Camera size={13} />
                          <span>Replace</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* AI scan error */}
                {scanError && !scanning && (
                  <p className="scan-error-msg">
                    {scanError}
                  </p>
                )}

                {/* AI scan results — medicines detected */}
                {scannedMedicines.length > 0 && !scanning && (
                  <div className="scan-results-panel">
                    <p className="scan-results-heading">
                      AI detected {scannedMedicines.length} medicine(s) — review and confirm:
                    </p>
                    <ul className="scan-medicines-list">
                      {scannedMedicines.map((m, idx) => (
                        <li key={idx} className="scan-medicine-item">
                          <span className="scan-med-name">{m.name || "Unknown"}</span>
                          {m.dosage && <span className="scan-med-dosage">{m.dosage}</span>}
                          {m.instructions && <span className="scan-med-instructions">{m.instructions}</span>}
                        </li>
                      ))}
                    </ul>
                    <div className="scan-action-row">
                      <button
                        id="confirm-scanned-medicines-btn"
                        className="btn-confirm-scan"
                        onClick={handleConfirmScannedMedicines}
                      >
                        ✓ Add All to Prescriptions
                      </button>
                      <button
                        className="btn-dismiss-scan"
                        onClick={() => { setScannedMedicines([]); setScanError(null); }}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}
              </div>


              {/* Inline Edit Form for Medical */}
              {editingMedical && (
                <div className="medical-edit-drawer">
                  <h4>Manage Prescriptions & Allergies</h4>
                  <div className="edit-subgroup">
                    <label className="subsection-label" style={{ marginBottom: "6px" }}>Add Prescription</label>
                    <div className="flex-input-row">
                      <input
                        type="text"
                        className="input-med-name"
                        placeholder="Medication name"
                        value={newRxName}
                        onChange={(e) => setNewRxName(e.target.value)}
                      />
                      <input
                        type="text"
                        className="input-dosage"
                        placeholder="Dosage"
                        value={newRxDosage}
                        onChange={(e) => setNewRxDosage(e.target.value)}
                      />
                      <button type="button" className="btn-add-mini" onClick={handleAddPrescription}>
                        + Add
                      </button>
                    </div>
                  </div>

                  <div className="edit-subgroup" style={{ marginTop: "14px" }}>
                    <label className="subsection-label" style={{ marginBottom: "6px" }}>Add Allergy</label>
                    <div className="flex-input-row">
                      <input
                        type="text"
                        className="input-med-name"
                        placeholder="Allergy name"
                        value={newAllergyName}
                        onChange={(e) => setNewAllergyName(e.target.value)}
                      />
                      <button type="button" className="btn-add-mini" onClick={handleAddAllergy}>
                        + Add
                      </button>
                    </div>
                  </div>

                  <button className="btn-done-editing" onClick={() => setEditingMedical(false)}>
                    Close Editor
                  </button>
                </div>
              )}
            </section>

            {/* ── CARD: Daily Reminders & Schedule ──────────────────── */}
            <section className="cg-card reminders-overview-card">
              <div className="card-header-row">
                <h2 className="card-heading">Daily Reminders & Tasks</h2>
                <button
                  className="add-patient-pill-btn"
                  style={{ padding: "6px 12px", fontSize: "12px" }}
                  onClick={() => setShowAddReminderModal(true)}
                >
                  <Plus size={14} />
                  <span>Add Reminder</span>
                </button>
              </div>

              {(reminders || []).length === 0 ? (
                <div className="subsection-empty">
                  <Bell size={18} />
                  <span>No reminders set for this patient yet. Tap "+ Add Reminder" above.</span>
                </div>
              ) : (
                <div className="medical-item-list">
                  {(reminders || []).map((rem) => (
                    <div key={rem.id} className="medical-item-row prescription-row">
                      <div className="item-icon-circle prescription-icon-bg">
                        <Bell size={16} className="prescription-icon" />
                      </div>
                      <div style={{ flex: 1 }}>
                        <span className="item-text" style={{ textDecoration: rem.done ? "line-through" : "none" }}>
                          {rem.text}
                        </span>
                        {rem.reminder_time && (
                          <div style={{ fontSize: "12px", color: "#6B7B6E", marginTop: "2px" }}>
                            🕒 {rem.reminder_time}
                          </div>
                        )}
                      </div>
                      {rem.done ? (
                        <span style={{ fontSize: "12px", fontWeight: "800", color: "#1F3D33", background: "#D2F1E4", padding: "4px 8px", borderRadius: "8px" }}>
                          Done ✅
                        </span>
                      ) : (
                        <span style={{ fontSize: "12px", fontWeight: "700", color: "#7A8C84" }}>
                          Pending
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── CARD 2: Life Stories & Memories ───────────────────── */}
            <section className="cg-card stories-overview-card">
              <div className="card-header-row">
                <h2 className="card-heading">Life Stories & Memories</h2>
              </div>

              {(stories || []).length === 0 ? (
                <div className="subsection-empty stories-empty">
                  <Sparkles size={20} />
                  <span>No stories yet. Tap "+ Add New Record" to save a memory.</span>
                </div>
              ) : (
                <div className="stories-item-list">
                  {(stories || []).map((item) => {
                    const IconComp = CAT_ICONS[item?.category] || PawPrint;
                    return (
                      <div key={item.id} className="story-item-row">
                        <div className="story-icon-circle">
                          <IconComp size={18} className="story-icon" />
                        </div>
                        <div className="story-text-content">
                          <h3 className="story-title">{item.title}</h3>
                          <p className="story-subtitle">{item.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* ── CARD 3: Cognitive Analytics Dashboard (Recharts) ─────── */}
            <section className="cg-card analytics-card">
              <div className="card-header-row">
                <h2 className="card-heading">Cognitive & Mood Trends</h2>
              </div>

              {moodChartData.length === 0 && memoryChartData.length === 0 && patternChartData.length === 0 ? (
                <div className="subsection-empty analytics-empty">
                  <TrendingUp size={24} style={{ marginBottom: 4 }} />
                  <span style={{ fontSize: 14, fontWeight: 700, color: "#1F3D33" }}>
                    Not enough data to display trends.
                  </span>
                  <span style={{ fontSize: 13, color: "#52665E" }}>
                    Have the patient play a game or log a mood to see analytics.
                  </span>
                </div>
              ) : (
                <div className="charts-grid-container">
                  {/* Chart 1: Mood Trends */}
                  <div className="single-chart-box">
                    <h3 className="chart-title">Mood Trends</h3>
                    {moodChartData.length === 0 ? (
                      <div className="subsection-empty">No mood check-in data recorded yet.</div>
                    ) : (
                      <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={moodChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#EFEAE1" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7B6E" }} />
                            <YAxis
                              domain={[1, 3]}
                              ticks={[1, 2, 3]}
                              tick={{ fontSize: 11, fill: "#6B7B6E" }}
                              tickFormatter={(v) => (v === 3 ? "😊" : v === 2 ? "😐" : "😔")}
                            />
                            <Tooltip
                              formatter={(v) => [v === 3 ? "Happy (3)" : v === 2 ? "Okay (2)" : "Not great (1)", "Mood"]}
                            />
                            <Line
                              type="monotone"
                              dataKey="score"
                              stroke="#1F3D33"
                              strokeWidth={3}
                              dot={{ r: 5, fill: "#1F3D33" }}
                              activeDot={{ r: 7 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Chart 2: Memory Game Performance */}
                  <div className="single-chart-box" style={{ marginTop: 20 }}>
                    <h3 className="chart-title">Memory Game Performance</h3>
                    {memoryChartData.length === 0 ? (
                      <div className="subsection-empty">No memory game sessions played yet.</div>
                    ) : (
                      <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={memoryChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#EFEAE1" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7B6E" }} />
                            <YAxis
                              domain={[0, 100]}
                              ticks={[0, 25, 50, 75, 100]}
                              tick={{ fontSize: 11, fill: "#6B7B6E" }}
                              tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip
                              formatter={(v) => [`${v}%`, "Accuracy"]}
                            />
                            <Line
                              type="monotone"
                              dataKey="accuracy"
                              stroke="#E8A33D"
                              strokeWidth={3}
                              dot={{ r: 5, fill: "#E8A33D" }}
                              activeDot={{ r: 7 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <TrendBadge trend={memoryTrend} gameLabel="Memory Game" />
                  </div>

                  {/* Chart 3: Pattern Game Performance */}
                  <div className="single-chart-box" style={{ marginTop: 20 }}>
                    <h3 className="chart-title">Pattern Game Performance</h3>
                    {patternChartData.length === 0 ? (
                      <div className="subsection-empty">No pattern game sessions played yet.</div>
                    ) : (
                      <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={patternChartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#EFEAE1" />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#6B7B6E" }} />
                            <YAxis
                              domain={[0, 100]}
                              ticks={[0, 25, 50, 75, 100]}
                              tick={{ fontSize: 11, fill: "#6B7B6E" }}
                              tickFormatter={(v) => `${v}%`}
                            />
                            <Tooltip
                              formatter={(v) => [`${v}%`, "Accuracy"]}
                            />
                            <Line
                              type="monotone"
                              dataKey="accuracy"
                              stroke="#52665E"
                              strokeWidth={3}
                              dot={{ r: 5, fill: "#52665E" }}
                              activeDot={{ r: 7 }}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <TrendBadge trend={patternTrend} gameLabel="Pattern Game" />
                  </div>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      {/* ── FAB ─────────────────────────────────────────────────────── */}
      {selectedId && (
        <button className="fab-add-btn" onClick={() => setShowFabModal(true)} aria-label="Add New Record">
          <Plus size={22} />
          <span>Add New Record</span>
        </button>
      )}

      {/* ── Add New Reminder Modal ────────────────────────────────────── */}
      {showAddReminderModal && (
        <div className="modal-backdrop" onClick={() => setShowAddReminderModal(false)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>+ Add New Reminder</h3>
              <button className="modal-close-btn" onClick={() => setShowAddReminderModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddReminder} className="modal-form">
              <div className="form-group">
                <label>Reminder Message / Task</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Take morning medicine"
                  value={reminderText}
                  onChange={(e) => setReminderText(e.target.value)}
                  className="cg-input"
                />
              </div>

              <div className="form-group">
                <label>Scheduled Time (Optional)</label>
                <input
                  type="time"
                  value={reminderTime}
                  onChange={(e) => setReminderTime(e.target.value)}
                  className="cg-input"
                />
              </div>

              <div className="modal-actions">
                <button type="submit" className="cg-btn-primary" disabled={savingReminder}>
                  {savingReminder ? "Saving..." : "Save Reminder"}
                </button>
                <button
                  type="button"
                  className="cg-btn-secondary"
                  onClick={() => setShowAddReminderModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Add New Record Modal ────────────────────────────────────── */}
      {showFabModal && (
        <div className="modal-backdrop" onClick={() => setShowFabModal(false)}>
          <div className="modal-content-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>+ Add New Record</h3>
              <button className="modal-close-btn" onClick={() => setShowFabModal(false)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddRecord} className="modal-form">
              <div className="form-group">
                <label>Category</label>
                <select value={stCat} onChange={(e) => setStCat(e.target.value)} className="cg-select">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{catLabel(c, t)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Childhood Pet"
                  value={stTitle}
                  onChange={(e) => setStTitle(e.target.value)}
                  className="cg-input"
                />
              </div>
              <div className="form-group">
                <label>Details / Description</label>
                <textarea
                  required
                  placeholder="e.g. Buster the dog"
                  value={stDesc}
                  onChange={(e) => setStDesc(e.target.value)}
                  className="cg-textarea"
                />
              </div>
              <div className="modal-actions">
                <button type="submit" className="cg-btn-primary" disabled={savingSt}>
                  {savingSt ? "Saving..." : "Save Record"}
                </button>
                <button type="button" className="cg-btn-secondary" onClick={() => setShowFabModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Prescription Photo Lightbox Modal ───────────────────────── */}
      {showPhotoModal && (uploadPreview || prescriptionPhotoUrl) && (
        <div className="modal-backdrop photo-lightbox-backdrop" onClick={() => setShowPhotoModal(false)}>
          <div className="photo-lightbox-card" onClick={(e) => e.stopPropagation()}>
            <div className="lightbox-header">
              <div className="lightbox-title-group">
                <FileText size={18} color="#E8A33D" />
                <span className="lightbox-title">Prescription Document Preview</span>
              </div>
              <button
                className="lightbox-close-btn"
                onClick={() => setShowPhotoModal(false)}
                title="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="lightbox-img-container">
              <img
                src={uploadPreview || prescriptionPhotoUrl}
                alt="Full Prescription Document"
                className="lightbox-full-image"
              />
            </div>
            <div className="lightbox-footer">
              <span className="lightbox-footer-info">
                {uploadPreview ? "Local / Pending Sync" : "Synced via Supabase Storage"}
              </span>
              <button
                className="cg-btn-primary"
                style={{ padding: "8px 18px", fontSize: "13px" }}
                onClick={() => setShowPhotoModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ───────────────────────────────────────────────────── */}
      <div className={`cg-toast ${toast.type} ${toast.visible ? "visible" : ""}`}>
        {toast.msg}
      </div>
    </div>
  );
}