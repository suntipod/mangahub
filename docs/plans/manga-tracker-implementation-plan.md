# Manga Tracker Implementation Plan (Manga Bookmark & Multi-Source Hub)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

---

## 1. Overview & Objectives

Build a responsive, modern web application (PWA) tailored for tracking manga reading progress across devices (iPhone Safari + PC Browser):
- **Cloud Sync**: Supabase Free Tier (PostgreSQL + Realtime Sync) with Local-First offline fallback.
- **Smart URL Scraper**: Paste manga URL -> automatically extracts title, cover poster image, and initial chapter.
- **Multi-Source Link Hub**: One manga can be bound to multiple reader websites (Up-Manga, Slow-Manga, Chibi-Manga, etc.). If one site goes down, switch to backup site in 1 tap.
- **1-Tap Reading Flow**: "อ่านต่อ" button opens the exact chapter URL. A quick `+1` button increments the read count without manual typing.
- **iPhone PWA Ready**: Installable to iOS Home Screen with native app feel (dark theme, iOS safe-area insets, notch-compatible, bottom navigation).

---

## 2. Skill Mapping by Phase

| Phase | Tasks | Skills Utilized | Rationale |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Technical Spec & Domain Modeling | `mattpocock:to-spec`, `mattpocock:domain-modeling`, `ponytail:ponytail` | Formalize domain entities (Manga, Sources, Chapters), avoid over-engineering. |
| **Phase 2** | Project Architecture & Tech Stack Setup | `karpathy-guidelines`, `ui-ux-pro-max:design-system` | Set up Next.js + Tailwind CSS + Lucide Icons + PWA manifest cleanly and minimally. |
| **Phase 3** | Smart URL Metadata Scraper (API) | `superpowers:test-driven-development`, `caveman:surgical-patch` | Extract OpenGraph, HTML metadata, and regex chapter patterns reliably without CORS issues. |
| **Phase 4** | Supabase Cloud Database & Local-First Sync | `superpowers:test-driven-development`, `aileron-protocol` | Implement robust dual-layer persistence: immediate local responsiveness + cloud synchronization. |
| **Phase 5** | High-End Mobile & Desktop UI/UX | `ui-ux-pro-max`, `taste-skill:taste-skill`, `taste-skill:soft-skill`, `impeccable` | Craft the dark-themed bookshelf UI, 1-tap read buttons, multi-source selector, and smooth micro-interactions. |
| **Phase 6** | Verification & Deployment Guide | `superpowers:verification-before-completion`, `9arm-skills:scrutinize` | Verify end-to-end flow, run build tests, provide 1-click Vercel + Supabase setup guide. |

---

## 3. Domain Model Specification

### Entities:
1. **`Manga`**:
   - `id`: string (UUID)
   - `title`: string
   - `alt_title`: string (optional Thai/English/Korean alias)
   - `cover_url`: string
   - `current_chapter`: number (e.g. 118)
   - `total_chapters`: number | null
   - `status`: 'reading' | 'on_hold' | 'completed' | 'plan_to_read'
   - `rating`: number (1-5) or tier ('S' | 'A' | 'B')
   - `notes`: string
   - `last_read_at`: ISO timestamp
   - `created_at`: ISO timestamp
   - `updated_at`: ISO timestamp

2. **`MangaSource`**:
   - `id`: string (UUID)
   - `manga_id`: string (FK -> Manga.id)
   - `site_name`: string (e.g. 'Up-Manga', 'Slow-Manga')
   - `base_url`: string (e.g. 'https://www.up-manga.com/manga/nano-machine')
   - `chapter_url_pattern`: string (e.g. 'https://www.up-manga.com/manga/nano-machine/{chapter}')
   - `is_primary`: boolean
   - `is_active`: boolean

---

## 4. Step-by-Step Execution Tasks

### Task 1: Project Scaffolding & Dependencies
- [x] Initialize Next.js app with TypeScript, Tailwind CSS, and Lucide React.
- [x] Configure `tailwind.config.js` and CSS variables for high-contrast dark theme (Obsidian & Neon Indigo/Purple).
- [x] Add PWA Web Manifest (`manifest.json`) and iOS meta tags (`apple-mobile-web-app-capable`).

### Task 2: Smart URL Scraper API (`/api/scrape`)
- [x] Build server-side route `/api/scrape` to fetch manga URL and parse HTML.
- [x] Extract `og:title`, `<title>`, `og:image`, `<meta name="twitter:image">`, and manga thumbnail elements.
- [x] Parse chapter numbers from URL slugs (e.g. `/chapter-118`, `/ep-118`, `/118`).
- [x] Handle error states gracefully (blocked sites, invalid URLs).

### Task 3: Dual-Layer Storage (Local-First + Supabase Sync)
- [x] Create `lib/storage.ts`: manages local storage / IndexedDB with reactive state.
- [x] Create `lib/supabase.ts`: manages optional Supabase client connection.
- [x] Write SQL schema setup script for Supabase (`supabase-schema.sql`).
- [x] Implement sync mechanism: pushes local changes to Supabase and pulls remote updates.

### Task 4: UI Components (Design System)
- [x] `Header` & `BottomNav`: Mobile bottom navigation + desktop top bar.
- [x] `MangaCard`: Visual book card with cover image, chapter badge, 1-tap "อ่านต่อ" button, and quick `+1` button.
- [x] `MangaModal`: Detail dialog showing multi-source URLs, chapter editor, status tags, and notes.
- [x] `AddMangaModal`: Quick URL rescue input with auto-scrape preview and 1-tap save.
- [x] `SettingsModal`: Supabase credentials input, connection test, data export/import (JSON/Backup).

### Task 5: Verification & End-to-End Testing
- [x] Test scraping against popular manga site URL patterns.
- [x] Test chapter incrementing and multi-source URL switching.
- [x] Test PWA display and responsiveness for iPhone viewport (390px, 430px) and Desktop.
- [x] Run production build (`npm run build`) and verify 0 errors.
