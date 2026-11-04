# StudyCloud

StudyCloud is a study companion for students in grades 1–13, with English and German interfaces. Bring your own worksheets and notes, learn through lessons and interactive games, and ask **Cloudy**, the AI tutor, when you need an explanation. Source information stays visible, and general-knowledge answers are labelled separately from material-backed answers.

> **Status: playable local hackathon demo, under active development.** The feature overview describes the current local demo. Some recent application changes have not yet been published to this repository; this README update does not publish those source changes. Legal review, a full penetration test and physical-device testing are still pending. See [Known limitations](#known-limitations).

## Features

### Learn from your own materials

- **Upload worksheets and notes:** text, PDFs with a text layer, and images with processing/OCR status. Image recognition requires a supported OCR configuration.
- **My materials:** one place to find uploads, check processing status, open documents, and start or review their lessons.
- **Structured study programs:** organise material into lessons and track completion. AI generation requires a configured provider and consent.
- **Games from your uploads:** play **Memory** and a **Term quiz** built from recognised term/definition pairs or lesson blocks. These two material-based games do not need an AI call and appear when enough suitable content is available. Not every upload can produce every game type.

**Where to play:** Home → **My materials** → find your upload → **Games** → **Memory** or **Term quiz**. The Upload tab also links to My materials beside the library heading.

### Cloudy, your AI study companion

- Ask questions and follow up in saved conversations.
- Scope questions to your materials, a document, a study program or a lesson.
- Inspect source/provenance information and distinguish verified material-backed answers from general knowledge.
- Listen to answers with read-aloud controls.
- Start a fresh chat or reopen an earlier conversation; reset clears transient errors and ignores late replies from a previous chat.
- The current Windows demo uses a **private local OpenCode endpoint with Gemini 4 Argon**. Provider credentials stay in the backend, and the adapter does not silently fall back to Muse. The selected cloud model still receives submitted AI context; a local endpoint does not mean offline inference.

### 15 subject-based learning games

| Game | What you practise |
| --- | --- |
| Memory | Match related terms, definitions or vocabulary. |
| Connection Web | Connect related concepts. |
| Error Hunter | Spot mistakes in statements or worked steps. |
| Timeline Builder | Put events in the correct order. |
| Equation Workshop | Transform equations step by step. |
| Conveyor Sorter | Sort items into categories, including calculated results. |
| Pattern Machine | Work out a number pattern and type the missing value. |
| Diagram Explorer | Label the parts of a diagram. |
| Language Studio | Build sentences and complete word-choice exercises. |
| Mini Simulations | Calculate predictions, then explore model controls. |
| Code Robot | Build a sequence of commands to reach a goal. |
| Number Fortress | Identify divisors, multiples and matching numbers in a defence game. |
| Projectile Cannon | Calculate a launch speed and aim for a target. |
| BioDome | Build and maintain a stable ecosystem. |
| Teach-Back with Cloudy | Correct Cloudy's mistakes through language exercises. |

The game platform includes rounds, difficulty settings, subject-appropriate content, combo streaks, Cloudy reactions and server-side score ceilings. An AI practice-level flow is also implemented for supported exercises; it requires provider access and consent. The 15 templates are not all automatically generated from arbitrary uploads.

### Learning paths and revision

- **Biology, mathematics and English paths** with progressive unlocks, stars and boss challenges.
- **Mistake review (Fehlerbox):** revisit errors through a rescheduled review queue.
- **Spaced repetition:** a due-review queue and progress based on recorded practice.
- **Weekly practice mix:** combine different practice activities.
- **Study-method finder:** a questionnaire to explore study approaches and track activity by method.

### Exams, challenges and motivation

- **Exam-date planner** with study plans and upcoming tasks.
- **Timed exam simulator** with results and German 1–6 grading.
- **1v1 duels** through a friend code or against the Blitz bot.
- **Boss rematches, stickers and seasonal path styling** for additional practice goals.

### Reference tools and accessibility

- **Formula library** and a **subject lexicon** covering mathematics, physics, chemistry, biology, primary-school studies, German, English, history, geography, informatics, music and art.
- **Global search** across learning resources.
- **English/German interface and built-in content**, with an instant language switch in Settings. Your uploaded documents and vocabulary being learned are not automatically translated.
- **Light and dark themes**, reduced-motion support and labelled controls.
- **Guest mode** for exploring the app before registration.
- **Windows desktop shell** with a freely resizable window and a maximise button; the interface also runs as an Expo web app.

## Principles (enforced in code, not only in prompts)

- **Every external fact must be verifiable.** The LLM can only point at run-scoped evidence ids created by the backend. URLs, titles, licences and the retrieval timestamp come from stored source records; the quote must be found in the retrieved text, and numbers must match. Unverifiable blocks are dropped and the student is told.
- **Internet access ≠ permission.** A deterministic `ContentRightsService` (deny by default, per operation) decides what may be done with a source. An LLM's statement about a licence is never an input.
- **Uploads are private.** Owner-only access, random storage keys, no public URLs; content goes to the AI provider only with explicit consent.
- **No invented numbers.** Dashboards show stored activity only. Unknown publication dates show "Not available".

## Repository layout

| Path | What |
|---|---|
| `server/` | Fastify + TypeScript API, PostgreSQL (embedded PGlite for dev, `DATABASE_URL` for production), rights engine, research + verification, AI pipeline, tutor, planner |
| `app/` | Expo (React Native + web) app, Expo Router, TanStack Query, German/English UI, light/dark theme |
| `docs/` | Architecture, AI pipeline, source attribution, rights policy, privacy/security, database, deployment, design research |
| `site/` | Static marketing website (`python site/build.py`, APP_URL env var decides where the CTA points) |

## Quick start

Requires Node 20+.

```bash
# 1. API (embedded database, no external services needed)
cd server
npm install
npm run dev            # http://127.0.0.1:8787

# 2. App (web)
cd ../app
npm install
npm run web            # http://localhost:8081
```

Without a configured AI provider, non-AI features remain available; generation, tutoring and OCR report configuration errors rather than faking results. For the OpenAI-compatible server adapter, set:

```bash
export LLM_API_KEY=...                      # or FIREWORKS_API_KEY
export LLM_BASE_URL=https://api.fireworks.ai/inference/v1   # any OpenAI-compatible endpoint
export LLM_MODEL=<model id>
export OCR_MODEL=<vision model id>          # optional; needed to read photos
```

The app finds the API through `EXPO_PUBLIC_API_URL` (default `http://localhost:8787`).

## Tests and checks

```bash
cd server && npm test && npm run typecheck
cd app    && npm test && npm run typecheck
cd app    && npm run export:web                # production web bundle
```

Server tests cover auth and isolation between users, uploads and file validation, extraction, the rights matrix (CC BY / BY-SA / BY-NC / BY-ND, public domain, paywalled, private uploads, unknown and conflicting terms), SSRF protection, source provenance and timestamps, citation verification, prompt-injection handling, the tutor and the planner. App tests cover WCAG contrast of the design tokens, DE/EN dictionary parity, math rendering and timestamp localisation. The LLM is **scripted** in tests; no test calls a real model.

`server/scripts/mock-llm.mjs` is a **development-only** stand-in for an OpenAI-compatible endpoint so the whole UI can be exercised offline. It is not an integration with a real model and its answers are canned.

### Demo data

```bash
cd server && npm run seed:demo   # STOP the API first: the embedded database allows one process
```

Creates documents, three learning programs, a tutor conversation, exams and a study plan for the local demo account (`demo@studycloud.local`). Everything runs through the real pipeline (uploads, extraction, validation, **live Wikipedia retrieval**, the planner); only the LLM is replaced by hand-written lesson fixtures (`scripts/seed-demo.ts`, labelled as "StudyCloud Demo-Autor" in the app). Completed-lesson progress and study minutes in the demo account are chosen values, not measured ones.

## Known limitations

- **Real-model verification is limited.** Cloudy tutoring and follow-up conversations were tested through the current local demo with real Gemini 4 Argon responses. Lesson generation, document AI processing and AI-generated games were not end-to-end retested with that provider in the latest repair. Automated model tests use scripted responses, not live inference.
- **Legal review pending.** The rights engine implements a conservative policy, but the policy itself (e.g. § 60a UrhG applicability, TDM reservations, minors' consent age) needs review by a lawyer. See `docs/content-rights-policy.md`.
- **Research provider: Wikipedia only** (CC BY-SA 4.0, ShareAlike condition recorded). Official ministry/KMK/OER providers are designed for but not implemented.
- **OCR is provider-dependent.** The OpenAI-compatible adapter needs a suitable `OCR_MODEL`; the current OpenCode adapter does not implement OCR. HEIC cannot be read server-side; JPEG conversion through the picker is untested on real iOS devices.
- **Desktop packaging:** the current local `win-unpacked` app includes the latest fixes; the standalone portable EXE has not been rebuilt with all of them. OpenCode also requires a local installation and valid provider credentials.
- **Scanned PDFs** (no text layer) are rejected with a clear message; upload them as photos.
- **Math** is rendered as Unicode text from a LaTeX subset, not typeset.
- **Not tested on physical iOS/Android devices**, no screen-reader pass beyond semantics/labels and measured contrast.
- Storage is local filesystem (`LocalFsStorage`); an S3-compatible adapter is the intended production path.

## Licence

See `LICENSE`.
