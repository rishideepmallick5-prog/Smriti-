// src/pages/MemoryGame.jsx
//
// Memory Game screen — Smriti / North-East Cognitive Care
// Localized with culturally familiar themes from the North-Eastern Region (Assam, Meghalaya, etc.)
// Features contextually-aware distractor generation for life stories and cultural questions.

import { useState, useEffect, useCallback, useRef } from "react";
import { Volume2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { strings } from "../i18n/strings";
import { useLanguage, speakText } from "../lib/useLanguage";
import { getLocalStories, saveLocalGameSession, mergeDedupe } from "./CaregiverDashboard";
import "./MemoryGame.css";

// ── Difficulty configuration ──────────────────────────────────────
export function computeDifficulty(recentSessions) {
  if (!recentSessions || recentSessions.length === 0) return "medium";
  const totalCorrect = recentSessions.reduce((sum, s) => sum + (s.correct || 0), 0);
  const totalQuestions = recentSessions.reduce((sum, s) => sum + (s.total || 0), 0);
  if (totalQuestions === 0) return "medium";

  const accuracy = totalCorrect / totalQuestions;
  if (accuracy >= 0.8) return "hard";
  if (accuracy >= 0.5) return "medium";
  return "easy";
}

export const DIFFICULTY_CONFIG = {
  easy: { optionsPerQuestion: 2, questionsPerSession: 4 },
  medium: { optionsPerQuestion: 3, questionsPerSession: 5 },
  hard: { optionsPerQuestion: 4, questionsPerSession: 6 },
};

// ── Categorized Fallback Distractors Dictionary ────────────────────
export const CATEGORIZED_FALLBACK_DISTRACTORS = {
  locations: {
    en: ["Kaziranga", "Majuli", "Guwahati", "Shillong", "Local Park", "Tezpur", "Jorhat", "Dibrugarh", "Brahmaputra Riverfront"],
    as: ["কাজিৰঙা", "মাজুলী", "গুৱাহাটী", "শ্বিলং", "স্থানীয় উদ্যান", "তেজপুৰ", "যোৰহাট", "ডিব্ৰুগড়", "ব্ৰহ্মপুত্ৰৰ পাৰ"],
    bn: ["কাজিবাঙা", "মাজুলী", "গুয়াহাটি", "শিলং", "স্থানীয় পার্ক", "তেজপুর", "যোরহাট", "ডিব্রুগড়", "ব্রহ্মপুত্র তীর"],
  },
  people: {
    en: ["Uncle", "Neighbor", "Brother", "Friend", "Grandfather", "Aunt", "Sister", "Cousin", "Teacher"],
    as: ["খুৰা", "চুবুৰীয়া", "ভাই", "বন্ধু", "ককা", "বৌ", "ভনী", "শিক্ষক"],
    bn: ["কাকা", "প্রতিবেশী", "ভাই", "বন্ধু", "দাদু", "কাকিমা", "বোন", "শিক্ষক"],
  },
  food: {
    en: ["Til Pitha", "Masor Tenga", "Narikol Laru", "Assam Tea", "Sticky Rice", "Khar", "Pithaguri", "Payas"],
    as: ["তিল পিঠা", "মাছৰ টেঙা", "নাৰিকল লাড়ু", "অসম চাহ", "বৰা চাউল", "খাৰ", "পায়স"],
    bn: ["তিল পিঠা", "মাছের টক", "নারকেল নাড়ু", "আসাম চা", "ক্ষীর", "পায়েস", "পোলাও"],
  },
  events: {
    en: ["Magh Bihu", "Bohag Bihu", "Wedding Anniversary", "Birthday Celebration", "Puja Gathering"],
    as: ["মাঘ বিহু", "বোহাগ বিহু", "বিবাহ বার্ষিকী", "জন্মদিন উদযাপন", "পূজা সমাৱেশ"],
    bn: ["মাঘ বিহু", "বৈশাখী বিহু", "বিবাহ বার্ষিকী", "জন্মদিন উৎসব", "পূজা উৎসব"],
  },
};

function shuffle(arr) {
  const a = [...(arr || [])];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Context-aware Distractor & Multiple-Choice Option Generator
 * Analyzes question string keywords to serve contextually relevant wrong options.
 * @param {Object} storyOrQuestion - The question or life story item
 * @param {Array} allStories - List of all patient stories/memories
 * @param {number} optionsCount - Number of options to generate (default 3)
 * @param {string} lang - Selected language ("en", "as", "bn")
 * @returns {Array} Shuffled array of options containing correct answer and context-aware distractors
 */
export function generateOptions(storyOrQuestion, allStories = [], optionsCount = 3, lang = "en") {
  const correctAnswer =
    storyOrQuestion.description ||
    storyOrQuestion.correctAnswer ||
    storyOrQuestion.title ||
    "";
  
  const questionStr = (
    storyOrQuestion.prompt ||
    storyOrQuestion.title ||
    storyOrQuestion.question ||
    ""
  ).toLowerCase();

  const category = (storyOrQuestion.category || "").toLowerCase();
  const neededDistractors = Math.max(1, optionsCount - 1);
  let candidatePool = [];

  // 1. Keyword-based matching
  const locationKeywords = ["spot", "place", "where", "city", "town", "village", "park", "river", "island", "station", "garden", "ঠাই", "স্থান", "নগৰ", "ক'ত", "নদী", "জায়গা", "কোথায়", "শহর", "গ্রাম"];
  const peopleKeywords = ["who", "name", "person", "friend", "cousin", "relative", "family", "uncle", "doctor", "teacher", "father", "mother", "brother", "sister", "কোন", "নাম", "ব্যক্তি", "বন্ধু", "মানুহ", "কে", "কেমন"];
  const foodKeywords = ["food", "eat", "dish", "sweet", "drink", "taste", "cook", "tea", "curry", "rice", "meal", "breakfast", "dinner", "lunch", "খাদ্য", "খোৱা", "চাহ", "পিঠা", "খাবার", "মিষ্টি", "রান্না", "চা"];
  const eventKeywords = ["festival", "event", "celebration", "day", "when", "year", "wedding", "anniversary", "উৎসৱ", "দিন", "কেতিয়া", "উৎসব", "কখন"];

  const hasLocKeyword = locationKeywords.some((k) => questionStr.includes(k));
  const hasPeopleKeyword = peopleKeywords.some((k) => questionStr.includes(k));
  const hasFoodKeyword = foodKeywords.some((k) => questionStr.includes(k));
  const hasEventKeyword = eventKeywords.some((k) => questionStr.includes(k));

  let keywordCategory = null;
  if (hasLocKeyword) keywordCategory = "locations";
  else if (hasPeopleKeyword) keywordCategory = "people";
  else if (hasFoodKeyword) keywordCategory = "food";
  else if (hasEventKeyword) keywordCategory = "events";

  // If keyword matched, pick from corresponding categorized fallback array
  if (keywordCategory && CATEGORIZED_FALLBACK_DISTRACTORS[keywordCategory]) {
    const locPool = CATEGORIZED_FALLBACK_DISTRACTORS[keywordCategory][lang] || CATEGORIZED_FALLBACK_DISTRACTORS[keywordCategory].en;
    candidatePool.push(...shuffle(locPool));
  }

  // 2. Same data type from database stories
  if (category) {
    const sameCatStories = allStories
      .filter((s) => s.id !== storyOrQuestion.id && (s.category || "").toLowerCase() === category)
      .map((s) => s.description || s.title);
    candidatePool.push(...shuffle(sameCatStories));

    // Also inject categorized fallback for that category if available
    let mappedCat = null;
    if (category === "place") mappedCat = "locations";
    else if (category === "person") mappedCat = "people";
    else if (category === "favorite_food") mappedCat = "food";
    else if (category === "life_event" || category === "festival") mappedCat = "events";

    if (mappedCat && CATEGORIZED_FALLBACK_DISTRACTORS[mappedCat]) {
      const catPool = CATEGORIZED_FALLBACK_DISTRACTORS[mappedCat][lang] || CATEGORIZED_FALLBACK_DISTRACTORS[mappedCat].en;
      candidatePool.push(...shuffle(catPool));
    }
  }

  // 3. Fall back to other database stories
  const otherStories = allStories
    .filter((s) => s.id !== storyOrQuestion.id)
    .map((s) => s.description || s.title);
  candidatePool.push(...shuffle(otherStories));

  // Select unique non-empty wrong answers
  const selectedWrong = [];
  for (const cand of candidatePool) {
    if (selectedWrong.length >= neededDistractors) break;
    if (
      cand &&
      cand.trim() !== "" &&
      cand !== correctAnswer &&
      !selectedWrong.includes(cand)
    ) {
      selectedWrong.push(cand);
    }
  }

  // If still need more distractors, pull from full fallback pool
  if (selectedWrong.length < neededDistractors) {
    const allDistractors = Object.values(CATEGORIZED_FALLBACK_DISTRACTORS).flatMap(
      (dict) => dict[lang] || dict.en
    );
    for (const cand of shuffle(allDistractors)) {
      if (selectedWrong.length >= neededDistractors) break;
      if (cand && cand !== correctAnswer && !selectedWrong.includes(cand)) {
        selectedWrong.push(cand);
      }
    }
  }

  // 4. Shuffle final array so correct answer position is randomized
  return shuffle([correctAnswer, ...selectedWrong]);
}

// ── Culturally Familiar North-East Regional Memory Seed Data ────────────────────────
export const NORTH_EAST_CULTURAL_QUESTIONS = [
  {
    id: "ne_harvest_festival",
    category: "festival",
    categoryLabel: { en: "Festival", as: "উৎসৱ", bn: "উৎসব" },
    icon: "🌾",
    question: {
      en: "Which traditional festival marks the end of the harvesting season in Assam?",
      as: "কোনটো পৰম্পৰাগত উৎসৱে শস্য চপোৱাৰ সমাপ্তি সূচায়?",
      bn: "কোনটি ঐতিহ্যবাহী উৎসব ফসল তোলার মরশুম শেষ হওয়াকে চিহ্নিত করে?",
    },
    audioText: {
      en: "Which traditional festival marks the end of the harvesting season in Assam?",
      as: "Konto poromporagoto utsobhe xoshyo sopowar xomapti xusai?",
      bn: "Konti oitijjyobahi utsob phosol tolar morshum shesh howake chinnito kore?",
    },
    options: {
      en: ["Magh Bihu", "Rongali Bihu", "Kati Bihu", "Durga Puja"],
      as: ["মাঘ বিহু", "ৰঙালী বিহু", "কাতি বিহু", "দুৰ্গা পূজা"],
      bn: ["মাঘ বিহু", "রঙালি বিহু", "কাতি বিহু", "দুর্গা পূজা"],
    },
    correctAnswer: {
      en: "Magh Bihu",
      as: "মাঘ বিহু",
      bn: "মাঘ বিহু",
    },
  },
  {
    id: "ne_traditional_silk",
    category: "traditional_silk",
    categoryLabel: { en: "Traditional Silk", as: "পৰম্পৰাগত ৰেচম", bn: "ঐতিহ্যবাহী রেশম" },
    icon: "👘",
    question: {
      en: "Which of these is a world-famous traditional golden silk of Assam?",
      as: "তলৰ কোনটো অসমৰ বিখ্যাত সোণালী ৰেচম?",
      bn: "নিচের কোনটি আসামের বিশ্বখ্যাত ঐতিহ্যবাহী সোনালী রেশম?",
    },
    audioText: {
      en: "Which of these is a world-famous traditional golden silk of Assam?",
      as: "Tolor konto Axomor bikhyato xunali rexom?",
      bn: "Nicher konti Asamer bishwakhyato oitijjyobahi shonali reshom?",
    },
    options: {
      en: ["Muga Silk", "Tussar Silk", "Mulberry Silk", "Pashmina"],
      as: ["মুগা ৰেচম", "তসৰ ৰেচম", "মালবেৰী ৰেচম", "পশমিনা"],
      bn: ["মুগা রেশম", "তসর রেশম", "মালবেরি রেশম", "পশমিনা"],
    },
    correctAnswer: {
      en: "Muga Silk",
      as: "মুগা ৰেচম",
      bn: "মুগা রেশম",
    },
  },
  {
    id: "ne_wildlife_rhino",
    category: "wildlife",
    categoryLabel: { en: "Wildlife Heritage", as: "বন্যপ্ৰাণী ঐতিহ্য", bn: "বন্যপ্রাণী ঐতিহ্য" },
    icon: "🦏",
    question: {
      en: "Which national park in Assam is famous for the great one-horned rhinoceros?",
      as: "এশিঙীয়া গঁড়ৰ বাবে অসমৰ কোনটো ৰাষ্ট্ৰীয় উদ্যান পৃথিৱী বিখ্যাত?",
      bn: "একশৃঙ্গ গণ্ডারের জন্য আসামের কোন জাতীয় উদ্যান বিশ্ববিখ্যাত?",
    },
    audioText: {
      en: "Which national park in Assam is famous for the great one-horned rhinoceros?",
      as: "Exingiya gonror babe Axomor konto rastriyo uddan prithibi bikhyato?",
      bn: "Ekshringo gondarer jonno Asamer kon jatiyo uddan bishwabikhyato?",
    },
    options: {
      en: ["Kaziranga National Park", "Manas National Park", "Sundarbans", "Jim Corbett"],
      as: ["কাজিৰঙা ৰাষ্ট্ৰীয় উদ্যান", "মানস ৰাষ্ট্ৰীয় উদ্যান", "সুন্দৰবন", "জিম ক'ৰবেট"],
      bn: ["কাজিবাঙা জাতীয় উদ্যান", "মানস জাতীয় উদ্যান", "সুন্দরবন", "জিম করবেট"],
    },
    correctAnswer: {
      en: "Kaziranga National Park",
      as: "কাজিৰঙা ৰাষ্ট্ৰীয় উদ্যান",
      bn: "কাজিবাঙা জাতীয় উদ্যান",
    },
  },
  {
    id: "ne_bihu_delicacy",
    category: "favorite_food",
    categoryLabel: { en: "Traditional Cuisine", as: "পৰম্পৰাগত খাদ্য", bn: "ঐতিহ্যবাহী খাবার" },
    icon: "🥞",
    question: {
      en: "Which sweet delicacy made with rice flour and jaggery is made during Bihu?",
      as: "বিহুত চাউলৰ গুড়ি আৰু গুড়েৰে কি সুস্বাদু পিঠা প্ৰস্তুত কৰা হয়?",
      bn: "বিহুতে চালের গুঁড়ো ও গুড় দিয়ে তৈরি ঐতিহ্যবাহী মিষ্টান্ন কোনটি?",
    },
    audioText: {
      en: "Which sweet delicacy made with rice flour and jaggery is made during Bihu?",
      as: "Bihut saulor guri aru gurere ki suswadu pitha prostut kora hoi?",
      bn: "Bihute chaler guro o gur diye toiri oitijjyobahi mishtanno konti?",
    },
    options: {
      en: ["Til Pitha", "Rasgulla", "Jalebi", "Gulab Jamun"],
      as: ["তিল পিঠা", "ৰসগোল্লা", "জিলেপী", "গোলাপ জামুন"],
      bn: ["তিল পিঠা", "রসগোল্লা", "জিলিপি", "গোলাপ জামুন"],
    },
    correctAnswer: {
      en: "Til Pitha",
      as: "তিল পিঠা",
      bn: "তিল পিঠা",
    },
  },
  {
    id: "ne_horn_instrument",
    category: "music_culture",
    categoryLabel: { en: "Music & Culture", as: "সংগীত আৰু সংস্কৃতি", bn: "সঙ্গীত ও সংস্কৃতি" },
    icon: "🪈",
    question: {
      en: "Which wind instrument made from buffalo horn is played in Bihu dance?",
      as: "ম'হৰ শিঙেৰে নিৰ্মিত কোনটো সুৰীয়া বাদ্য বিহুনৃত্যত বজোৱা হয়?",
      bn: "মহিষের শিং দিয়ে তৈরি কোন ঐতিহ্যবাহী বাদ্যযন্ত্র বিহু নৃত্যে বাজানো হয়?",
    },
    audioText: {
      en: "Which wind instrument made from buffalo horn is played in Bihu dance?",
      as: "Mohor xingere nirmito konto suriya badyo bihunrityot bojowa hoi?",
      bn: "Mohishey shing diye toiri kon oitijjyobahi badyojontro bihu nritye bajano hoi?",
    },
    options: {
      en: ["Pepa", "Flute", "Shehnai", "Harmonium"],
      as: ["পেঁপা", "বাঁহী", "সানাই", "হাৰমনিয়াম"],
      bn: ["পেঁপা", "বাঁশি", "সানাই", "হারমোনিয়াম"],
    },
    correctAnswer: {
      en: "Pepa",
      as: "পেঁপা",
      bn: "পেঁপা",
    },
  },
  {
    id: "ne_majuli_island",
    category: "geography",
    categoryLabel: { en: "Geography & Places", as: "ভূগোল আৰু স্থান", bn: "ভূগোল ও স্থান" },
    icon: "🏝️",
    question: {
      en: "Which is the famous large river island on the Brahmaputra River?",
      as: "ব্ৰহ্মপুত্ৰ নদীৰ বুকুত অৱস্থিত বিখ্যাত নদীদ্বীপ কোনটো?",
      bn: "ব্রহ্মপুত্র নদের বুকে অবস্থিত বিখ্যাত নদীদ্বীপ কোনটি?",
    },
    audioText: {
      en: "Which is the famous large river island on the Brahmaputra River?",
      as: "Brahmaputra nodir bukut awasthito bikhyato nodidwip konto?",
      bn: "Brahmaputra noder bukey obosthito bikhyato nodidweep konti?",
    },
    options: {
      en: ["Majuli", "Umananda", "Havelock", "Munroe"],
      as: ["মাজুলী", "উমানন্দ", "হেভলক", "মুনৰো"],
      bn: ["মাজুলী", "উমানন্দ", "হ্যাভলক", "মুনরো"],
    },
    correctAnswer: {
      en: "Majuli",
      as: "মাজুলী",
      bn: "মাজুলী",
    },
  },
  {
    id: "ne_assam_tea",
    category: "favorite_food",
    categoryLabel: { en: "Traditional Beverage", as: "পৰম্পৰাগত পানীয়", bn: "ঐতিহ্যবাহী পানীয়" },
    icon: "🍵",
    question: {
      en: "What beverage from the lush gardens of Assam is cherished across the globe?",
      as: "অসমৰ শ্যামলী বাগিচাৰ কোনটো পানীয় সমগ্ৰ বিশ্বতে সমাদৃত?",
      bn: "আসামের শ্যামল চা বাগান থেকে কোন পানীয়টি বিশ্বজুড়ে সমাদৃত?",
    },
    audioText: {
      en: "What beverage from the lush gardens of Assam is cherished across the globe?",
      as: "Axomor shyamoli bagisar konto paniyo somogro bishwot somadrito?",
      bn: "Asamer shyamol cha bagan theke kon paniyoti bishwojure shomadrito?",
    },
    options: {
      en: ["Assam CTC Tea", "Darjeeling Green Tea", "Filter Coffee", "Kahwa"],
      as: ["অসম চাহ", "দাৰ্জিলিং সেউজ চাহ", "ফিল্টাৰ কফি", "কাহৱা"],
      bn: ["আসাম চা", "দার্জিলিং গ্রিন টি", "ফিল্টার কফি", "কাহওয়া"],
    },
    correctAnswer: {
      en: "Assam CTC Tea",
      as: "অসম চাহ",
      bn: "আসাম চা",
    },
  },
  {
    id: "ne_gamosa_respect",
    category: "tradition",
    categoryLabel: { en: "Cultural Symbol", as: "সাংস্কৃতিক প্ৰতীক", bn: "সাংস্কৃতিক প্রতীক" },
    icon: "🧣",
    question: {
      en: "Which red-and-white woven cloth is gifted as a symbol of love and respect in Assam?",
      as: "অসমত সন্মান আৰু মৰমৰ প্ৰতীক হিচাপে কি ৰঙা-বগা ফুলাম কাপোৰ উপহাৰ দিয়া হয়?",
      bn: "আসামে শ্রদ্ধা ও ভালোবাসার প্রতীক হিসেবে লাল-সাদা কোন বস্ত্র উপহার দেওয়া হয়?",
    },
    audioText: {
      en: "Which red-and-white woven cloth is gifted as a symbol of love and respect in Assam?",
      as: "Axomot xonman aru moromor protik hisape ki ronga-boga fulam kapor upohar diya hoi?",
      bn: "Asame shraddha o bhalobashar protik hishebe lal-shada kon bostro upohar dewa hoi?",
    },
    options: {
      en: ["Gamosa", "Dokbona", "Mekhela", "Pashmina"],
      as: ["গামোচা", "মেখেলা", "দখনা", "শাল"],
      bn: ["গামোসা", "মেখলা", "দখনা", "শাল"],
    },
    correctAnswer: {
      en: "Gamosa",
      as: "গামোচা",
      bn: "গামোসা",
    },
  },
];

export default function MemoryGame({ patientId, session, lang: propLang = "en", onGoHome }) {
  const { lang: contextLang, t } = useLanguage(propLang);
  const lang = propLang || contextLang || "en";

  // ── State ──────────────────────────────────────────────────────
  const [phase, setPhase] = useState("loading"); // loading | playing | complete
  const [difficulty, setDifficulty] = useState("medium");
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [answered, setAnswered] = useState(false);
  const [results, setResults] = useState([]);
  const [saving, setSaving] = useState(false);
  const [speakingKey, setSpeakingKey] = useState(null);

  const handleAudioSpeak = useCallback(
    (textOrObj, keyId = "general", customAudioText = null) => {
      setSpeakingKey(keyId);
      speakText(textOrObj, lang, () => {
        setSpeakingKey((curr) => (curr === keyId ? null : curr));
      }, customAudioText);
    },
    [lang]
  );

  // ── Load game questions (North-East cultural seed + patient life memories) ──
  const loadGame = useCallback(async () => {
    setPhase("loading");
    setCurrentIdx(0);
    setSelectedOption(null);
    setAnswered(false);
    setResults([]);

    let activePid = patientId;
    let customStories = [];

    try {
      let userId = session?.user?.id;
      if (!userId && supabase) {
        try {
          const { data: authData } = await supabase.auth.getSession();
          userId = authData?.session?.user?.id;
        } catch (e) {
          console.warn("Auth session error:", e);
        }
      }

      if ((!activePid || activePid === "88546630-8124-4047-8f78-b6a8be48fbc7") && userId && supabase) {
        try {
          const { data: pts } = await supabase
            .from("patients")
            .select("id")
            .eq("caregiver_id", userId)
            .order("created_at", { ascending: true })
            .limit(1);
          if (pts && pts.length > 0) activePid = pts[0].id;
        } catch (e) {
          console.warn("Patient lookup error:", e);
        }
      }

      if (activePid && supabase) {
        try {
          const { data } = await supabase
            .from("life_stories")
            .select("id, category, title, description, photo_url, created_at")
            .eq("patient_id", activePid)
            .order("created_at", { ascending: false });
          if (data) customStories = data;
        } catch (e) {
          console.warn("Fetch life stories error:", e);
        }
      }

      const localStories = activePid ? getLocalStories(activePid) : [];
      const combinedStories = mergeDedupe(customStories, localStories);

      // Options & question counts based on difficulty
      const optionsCount = DIFFICULTY_CONFIG[difficulty]?.optionsPerQuestion || 3;
      const count = DIFFICULTY_CONFIG[difficulty]?.questionsPerSession || 5;

      // Build cultural questions with context-aware distractor generator
      const formattedCultural = NORTH_EAST_CULTURAL_QUESTIONS.map((item) => {
        const qText = item.question[lang] || item.question.en;
        const qAudio = item.audioText[lang] || item.audioText.en;
        const cAnswer = item.correctAnswer[lang] || item.correctAnswer.en;
        const catName = item.categoryLabel[lang] || item.categoryLabel.en;

        const finalOptions = generateOptions(
          { prompt: qText, correctAnswer: cAnswer, category: item.category },
          combinedStories,
          optionsCount,
          lang
        );

        return {
          id: item.id,
          category: item.category,
          categoryLabel: catName,
          icon: item.icon,
          prompt: qText,
          audioText: qAudio,
          options: finalOptions,
          correctAnswer: cAnswer,
        };
      });

      // Also convert patient-specific stories into quiz questions with keyword-aware distractors
      const formattedCustom = combinedStories.map((story) => {
        const cAnswer = story.description || story.title;
        const finalOptions = generateOptions(story, combinedStories, optionsCount, lang);

        let icon = "📸";
        if (story.category === "place") icon = "🏞️";
        else if (story.category === "person") icon = "👤";
        else if (story.category === "favorite_food") icon = "🍽️";
        else if (story.category === "life_event") icon = "🎉";

        return {
          id: story.id,
          category: story.category || "life_event",
          categoryLabel: story.title,
          icon,
          photo_url: story.photo_url,
          prompt: story.title,
          audioText: story.title,
          options: finalOptions,
          correctAnswer: cAnswer,
        };
      });

      // Merge and pick balanced questions
      const allAvailable = [...formattedCustom, ...shuffle(formattedCultural)];
      const sessionQuestions = allAvailable.slice(0, count);

      setQuestions(sessionQuestions);
      setPhase("playing");

      if (sessionQuestions.length > 0) {
        setTimeout(() => {
          handleAudioSpeak(sessionQuestions[0].prompt, "q-prompt-initial", sessionQuestions[0].audioText);
        }, 500);
      }
    } catch (err) {
      console.warn("MemoryGame error:", err);
      // Fail-safe: Always load North-East cultural seed questions
      const fallback = shuffle(NORTH_EAST_CULTURAL_QUESTIONS).slice(0, 4).map((item) => ({
        id: item.id,
        category: item.category,
        categoryLabel: item.categoryLabel[lang] || item.categoryLabel.en,
        icon: item.icon,
        prompt: item.question[lang] || item.question.en,
        audioText: item.audioText[lang] || item.audioText.en,
        options: generateOptions(
          { prompt: item.question[lang] || item.question.en, correctAnswer: item.correctAnswer[lang] || item.correctAnswer.en, category: item.category },
          [],
          3,
          lang
        ),
        correctAnswer: item.correctAnswer[lang] || item.correctAnswer.en,
      }));
      setQuestions(fallback);
      setPhase("playing");
    }
  }, [patientId, session, difficulty, lang, handleAudioSpeak]);

  useEffect(() => {
    loadGame();
  }, [loadGame]);

  // ── Answer a question ──────────────────────────────────────────
  function handleOptionSelect(option) {
    if (answered || !questions[currentIdx]) return;
    const isCorrect = option === questions[currentIdx].correctAnswer;
    setSelectedOption(option);
    setAnswered(true);
    handleAudioSpeak(isCorrect ? (t.game_correct || "That's right!") : (t.game_incorrect || "Not quite, try another one"), "feedback");
    setResults((prev) => [...prev, { correct: isCorrect }]);
  }

  // ── Advance to next question or finish ─────────────────────────
  async function handleNext() {
    const nextIdx = currentIdx + 1;
    if (nextIdx < questions.length) {
      setCurrentIdx(nextIdx);
      setSelectedOption(null);
      setAnswered(false);
      const nextQ = questions[nextIdx];
      setTimeout(() => {
        handleAudioSpeak(nextQ.prompt, `q-${nextQ.id}`, nextQ.audioText);
      }, 300);
    } else {
      const correctCount = (results || []).filter((r) => r?.correct).length;
      const total = (questions || []).length;
      const category = questions[0]?.category || "festival";

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
        game_type: "memory",
        category,
        correct: correctCount,
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
                category,
                correct: correctCount,
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
          console.warn("Game session save error:", e);
          saveLocalGameSession(pid, sessionRecord);
        }
        setSaving(false);
      } else if (pid) {
        saveLocalGameSession(pid, sessionRecord);
      }

      handleAudioSpeak(t.game_complete_title || "Well done!", "complete");
      setPhase("complete");
    }
  }

  function optionClass(option) {
    if (!answered || !questions[currentIdx]) return "mg-option-btn";
    const isCorrect = option === questions[currentIdx].correctAnswer;
    if (option === selectedOption) return isCorrect ? "mg-option-btn correct" : "mg-option-btn incorrect";
    if (isCorrect) return "mg-option-btn reveal-correct";
    return "mg-option-btn";
  }

  const correctCount = (results || []).filter((r) => r?.correct).length;
  const diffLabel = t[`difficulty_${difficulty}`] || difficulty;

  // ══════════════════════════════════════════════════════════════
  // RENDER: Loading
  if (phase === "loading") {
    return (
      <div className="mg-root" role="main">
        <header className="mg-topbar">
          <h1 className="mg-title">🧠 <span>{t.game_title || "Memory Game"}</span></h1>
        </header>
        <div className="mg-state-card">
          <div className="mg-spinner" aria-hidden="true" />
          <p className="mg-state-body">{t.game_loading || "Getting your memories ready…"}</p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: Complete & Score Tracking
  if (phase === "complete") {
    const accuracyPct = Math.round((correctCount / (questions.length || 1)) * 100);
    return (
      <div className="mg-root" role="main">
        <header className="mg-topbar">
          <h1 className="mg-title">🧠 <span>{t.game_title || "Memory Game"}</span></h1>
        </header>
        <div className="mg-complete" aria-live="polite">
          <div className="mg-complete-star" aria-hidden="true">
            {correctCount >= Math.ceil((questions || []).length * 0.8) ? "🌟" : correctCount >= Math.ceil((questions || []).length * 0.5) ? "😊" : "💪"}
          </div>
          <h2 className="mg-complete-title">{t.game_complete_title || "Well done!"}</h2>
          
          <div className="mg-score-card">
            <div className="mg-score-number">{correctCount}</div>
            <div className="mg-score-denom">{t.game_score_suffix || "out of"} {(questions || []).length}</div>
            <div className="mg-score-label">{t.game_score_label || "Score"} ({accuracyPct}% accuracy)</div>
            
            <div style={{ marginTop: "14px", display: "inline-flex", alignItems: "center", gap: "6px", background: "rgba(31,61,51,0.08)", padding: "6px 14px", borderRadius: "12px", fontSize: "14px", fontWeight: "800", color: "#1F3D33" }}>
              <span>🌿 North-East Cultural Recall</span>
            </div>
          </div>

          <div className="mg-complete-actions">
            <button
              id="play-again-btn"
              type="button"
              className="mg-play-again-btn"
              onClick={loadGame}
              disabled={saving}
            >
              🔄 {t.game_play_again || "Play Again"}
            </button>
            <button
              id="go-home-btn"
              type="button"
              className="mg-home-btn"
              onClick={onGoHome}
            >
              🏠 {t.game_go_home || "Go Home"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // RENDER: Playing Quiz
  const q = (questions || [])[currentIdx];
  if (!q) {
    return (
      <div className="mg-root" role="main">
        <header className="mg-topbar">
          <button className="mg-back-btn" onClick={onGoHome}>← {t.game_go_home || "Back"}</button>
        </header>
        <div className="mg-state-card">
          <p className="mg-state-body">{t.game_loading || "Loading questions…"}</p>
        </div>
      </div>
    );
  }

  const progress = ((currentIdx) / (questions.length || 1)) * 100;

  return (
    <div className="mg-root" role="main">
      <header className="mg-topbar">
        <button className="mg-back-btn" onClick={onGoHome} aria-label={t.game_go_home || "Back"}>
          ← {t.game_go_home || "Back"}
        </button>
        <h1 className="mg-title">🧠 <span>{t.game_title || "Memory Game"}</span></h1>
      </header>

      <div className="mg-progress-wrap" role="status" aria-label={`${t.game_question_of || "Question"} ${currentIdx + 1} ${t.game_of || "of"} ${questions.length}`}>
        <div className="mg-progress-header">
          <div className="mg-progress-label">
            {t.game_question_of || "Question"} {currentIdx + 1} {t.game_of || "of"} {questions.length}
          </div>
          <div className="mg-diff-badge">
            {t.difficulty_label || "Level"}: {diffLabel}
          </div>
        </div>
        <div className="mg-progress-bar-bg" aria-hidden="true">
          <div className="mg-progress-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Question Card with Cultural Icon / Image */}
      <div className="mg-question-card" key={q.id}>
        {q.photo_url ? (
          <img className="mg-photo" src={q.photo_url} alt={q.prompt} />
        ) : (
          <div className="mg-photo-placeholder" aria-hidden="true">
            <span style={{ fontSize: "72px" }}>{q.icon || "🌿"}</span>
          </div>
        )}
        <div className="mg-question-body">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px", marginBottom: "8px" }}>
            <span className="mg-question-sub" style={{ textTransform: "uppercase", letterSpacing: "0.06em", color: "#E8A33D", fontWeight: "800", margin: 0 }}>
              {q.icon} {q.categoryLabel}
            </span>
            <button
              id={`speak-question-btn-${currentIdx}`}
              type="button"
              className="ph-speaker-btn inline-speaker"
              onClick={() => handleAudioSpeak(q.prompt, `q-${q.id}`, q.audioText)}
              aria-label="Read question aloud"
              title="Read aloud"
              style={{ width: "32px", height: "32px" }}
            >
              <Volume2 size={16} />
            </button>
          </div>

          <h2 className="mg-question-title">{q.prompt}</h2>

          <div className="mg-options" role="group" aria-label="Answer options">
            {(q.options || []).map((option, idx) => (
              <button
                key={idx}
                id={`option-btn-${idx}`}
                type="button"
                className={optionClass(option)}
                onClick={() => handleOptionSelect(option)}
                disabled={answered}
                aria-pressed={selectedOption === option}
              >
                <span style={{ marginRight: "10px", opacity: 0.6, fontSize: "14px", fontWeight: "900" }}>
                  {String.fromCharCode(65 + idx)}.
                </span>
                {option}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Answer Feedback Banner */}
      {answered && (
        <div
          className={`mg-feedback ${selectedOption === q.correctAnswer ? "correct" : "incorrect"}`}
          role="alert"
          aria-live="assertive"
        >
          <span className="mg-feedback-icon" aria-hidden="true">
            {selectedOption === q.correctAnswer ? "✅" : "💡"}
          </span>
          <div>
            <div style={{ fontWeight: "900" }}>
              {selectedOption === q.correctAnswer ? (t.game_correct || "That's right!") : (t.game_incorrect || "Not quite")}
            </div>
            {selectedOption !== q.correctAnswer && (
              <div style={{ fontSize: "14px", fontWeight: "700", marginTop: "2px", opacity: 0.9 }}>
                {lang === "as" ? `সঠিক উত্তৰ: ${q.correctAnswer}` : lang === "bn" ? `সঠিক উত্তর: ${q.correctAnswer}` : `Correct answer: ${q.correctAnswer}`}
              </div>
            )}
          </div>
        </div>
      )}

      {answered && (
        <button
          id="next-question-btn"
          type="button"
          className="mg-next-btn"
          onClick={handleNext}
          disabled={saving}
        >
          {currentIdx + 1 < questions.length ? `${t.game_question_of || "Question"} ${currentIdx + 2} →` : `🏁 ${t.game_complete_title || "Finish"}`}
        </button>
      )}
    </div>
  );
}