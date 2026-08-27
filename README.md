# Smriti

**AI-Based Cognitive Gaming and Memory Assistance Platform for Elderly Dementia Patients in the North Eastern Region (NER)**

Built for **CodeSprint 3.0 (SIH Internal Hackathon)** — Problem Statement **#26003**, Ministry of Development of North Eastern Region (MDoNER).

## The Problem

Elderly dementia patients in NER face limited access to specialised cognitive care due to geographic and infrastructure barriers. Generic cognitive-training apps don't account for a patient's personal history, language, or cultural context — and caregivers have no easy way to track engagement over time.

## The Solution

Smriti turns a patient's own life story into their therapy. A caregiver logs the patient's daily routine, personal memories, and favourite foods — this becomes the raw material for two cognitive games. Session data feeds a caregiver dashboard so progress (or decline) is visible over time, not guessed at.

## Features

- **Personalised Memory & Pattern Games** — questions generated from the patient's own saved life stories, not a generic question bank
- **Caregiver Dashboard** — Recharts-based performance graphs per game, tracked over time
- **Multilingual & Voice-Assisted** — English, Assamese, and Bengali support with text-to-speech narration for elderly accessibility
- **NER Cultural Theming** — regionally relevant content (Bihu, Kaziranga, Majuli, Muga Silk) woven into game content
- **AI Prescription Reader** — caregiver uploads a photo of a prescription; Gemini API extracts medicines and dosages, which the caregiver reviews before adding as reminders
- **Offline-First** — an IndexedDB-backed queue lets caregivers log records without connectivity; syncs automatically once back online
- **Secure Multi-Tenant Architecture** — Supabase Auth + Row Level Security scopes every caregiver to their own patient's data

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React (Vite) |
| Backend / DB | Supabase (Postgres, Auth, Storage) |
| Analytics | Recharts |
| AI (Prescription OCR) | Google Gemini API (`gemini-1.5-flash`) |
| Voice | Web Speech API |
| Offline Sync | IndexedDB |

## Getting Started

```bash
# Clone the repo
git clone https://github.com/rishideepmallick5-prog/Smriti-.git
cd smriti-app

# Install dependencies
npm install

# Set up environment variables
# Create a .env.local file with:
# VITE_SUPABASE_URL=your_supabase_url
# VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
# VITE_GEMINI_API_KEY=your_gemini_api_key

# Run the dev server
npm run dev
```

## Database Setup

Run the SQL schema in `supabase/schema.sql` (or your Supabase SQL Editor) to create the required tables: `patients`, `reminders`, `prescriptions`, `game_sessions`, `life_stories`, with Row Level Security policies scoping data to `caregiver_id`.

## MDoNER Problem Statement Compliance

- ✅ Interactive cognitive games & memory training
- ✅ AI/ML-driven adaptive scoring and performance tracking
- ✅ Multilingual and voice-assisted interaction for elderly users in NER

## Team

- **Team Name**: Cookie
- **Team ID**: YOUR_TEAM_ID

## License

Built for CodeSprint 3.0 (SIH Internal Hackathon), 2026.
