# Design research (Mobbin MCP)

Research was done through the **Mobbin MCP** (`search_flows`, `search_screens`) on 2026-10-26 before any UI was written.
Every reference below is a screen or flow I actually retrieved *and looked at*; each links to Mobbin so it can be opened there.
Mobbin screens are proprietary. They were used **only as inspiration for patterns**. No screenshots, illustrations, icons,
mascots, colors-by-hex or copy were copied into this repository. Cloudy, the palette and all components are original.

## What was (and was not) researched

| Requested topic | Result |
|---|---|
| Onboarding | ✅ Duolingo (flow, 20 screens), Notion (first-run tips) |
| Authentication | ⚠️ Only seen as the first steps of the Duolingo onboarding flow; no dedicated sign-in screens were examined |
| Home dashboard | ✅ Quizlet, SchoolAI (web) |
| Course navigation / educational progression | ✅ Khan Academy (subject list, lesson with "Up next"), Magnific (web course tree) |
| Document management | ⚠️ Not covered by a dedicated education example; derived from Notion "save files" tip + Quizlet "Recents" |
| AI chat | ✅ WHOOP, Bevel (health apps — closest AI-coach chat patterns Mobbin returned) |
| Account / settings | ⚠️ Only a profile screen (Duolingo); no settings list examined |
| Learning statistics | ✅ Duolingo profile, Uxcel (web) |
| Empty states | ✅ Uxcel ("Complete courses to build up your certificates") |
| Loading states | ❌ Not researched; implemented from standard skeleton patterns |
| Responsive navigation | ✅ SchoolAI, Uxcel, Magnific (sidebar on large screens) |
| **Photomath, Brilliant, Headspace** | ❌ The query "Photomath step-by-step solution" returned unrelated apps (WHOOP, Neo Financial, Bevel, Jomo). Brilliant and Headspace were not retrieved. No claims are made about them. |

## References and what we took from them

### Onboarding
- **Duolingo – Onboarding, screen 6 of 20** — [flow](https://mobbin.com/flows/b0b4f93f-5637-46ec-9d77-49ecda6b991d).
  Thin progress bar with a back arrow on top, mascot with a speech bubble asking one question, a list of large single-select
  cards, one full-width primary button pinned to the bottom.
  → **StudyCloud:** one question per screen (grade → state/school type → subjects → goals → language), a progress bar, large selectable
  cards (≥ 48 px), one primary action pinned to the bottom, Cloudy speaking the question. *Different:* no gamified streak/XP pressure; we
  also show a short, honest privacy note on the consent step.
- **Notion – "Some essential tips"** — [screen](https://mobbin.com/screens/f999e32c-f6d8-4251-846b-2da3a4d3df2d).
  Quiet, light first-run tip with one sentence and one button ("Finish").
  → **StudyCloud:** the last onboarding step is a single sentence explaining the Upload tab ("Save your first worksheet").

### Home dashboard
- **Quizlet – Home** — [screen](https://mobbin.com/screens/ffedd239-b534-4702-b0cd-cf9e3b21a7bd).
  Search on top, a single "Jump back in" card with a Continue button, then "Recents", then recommendations; floating pill tab bar (Home / Create / Library).
  → **StudyCloud:** the dashboard leads with **Continue learning** (one card, one button), then Today's plan, Upcoming exams, Recent
  documents. We do not copy the "N studiers today" social proof — we never show numbers we did not measure.
- **SchoolAI (web) – Discover** — [screen](https://mobbin.com/screens/875c7dee-41c0-499c-8c76-f6dbb969ba47).
  Welcome banner with three numbered "first steps" cards ("1 min"), left sidebar.
  → **StudyCloud empty state:** a new student sees Cloudy's welcome plus three actionable first steps (pick subjects → upload a document → create a plan)
  instead of empty charts.

### Course navigation & progression
- **Khan Academy – Economics subject list** — [screen](https://mobbin.com/screens/fabfbaa6-53ab-4ba2-b9c2-36469c84f73e).
  Plain list: round colored icon, title, chevron. Fast to scan for children and adults alike.
  → **StudyCloud Subjects tab:** list rows with a colored subject icon, name, counts ("3 documents · 1 program") and chevron — subject colors come from configuration.
- **Khan Academy – lesson with "Up next"** — [screen](https://mobbin.com/screens/fe687e15-7db8-4d0f-a039-8240546afde2).
  Title + short description + Bookmark/Share/Transcript actions, then an **Up next** list with the current item highlighted.
  → **StudyCloud lesson viewer:** previous/next lesson plus an ordered lesson list on the program page with the current lesson highlighted.
- **Khan Academy – article page** — [screen](https://mobbin.com/screens/fd893b10-1906-48bc-8903-958ab29b8751).
  Large readable serif-free body text, generous line height, bold section headings.
  → **StudyCloud lesson content:** ≥ 17 px body, 1.55 line height, max line length ≈ 70 characters on large screens, respects OS text scaling.
- **Magnific (web) – course tree** — [screen](https://mobbin.com/screens/4b0d7119-a2fc-4ddc-8291-b3cacf949237).
  Collapsible left tree with check-marks for completed lessons.
  → **StudyCloud (web ≥ 900 px):** program page shows the lesson list with completion check-marks next to the lesson.

### AI chat
- **WHOOP – AI chat** — [screen](https://mobbin.com/screens/ebd02f7f-dd31-4972-8902-2327feb39c09).
  Bubble-less assistant text, user messages as dark rounded bubbles, input bar with a "+" attach button.
- **Bevel – AI chat with "thought" steps** — [screen](https://mobbin.com/screens/190268cc-f8d8-4ad6-aa2f-af64e5fd7177).
  Collapsible "Thought for 8 seconds" steps and a rich result card inside the thread.
  → **Ask Cloudy:** user bubbles on the right, assistant on the left with Cloudy's avatar (state: thinking → explaining), an attach/scope chip row
  (*This lesson / This document / All my materials*), and — our addition — a **sources row under every answer** (own document chips or external source badges, or the label
  "KI-Wissen ohne Quelle"). The collapsible-steps idea is reused for "Quellen prüfen".

### Statistics & empty states
- **Duolingo – Profile "Overview"** — [screen](https://mobbin.com/screens/c85d1118-8d07-4346-ae1f-04a35a6405dc).
  Big, friendly numeric stats (streak, XP) in a compact row.
  → **StudyCloud progress:** compact stat tiles (lessons completed, programs, study time). *Not copied:* streaks, XP, leagues, "collect all suits" promotions —
  Phase 1 shows only genuinely recorded activity.
- **Uxcel (web) – Profile** — [screen](https://mobbin.com/screens/b035ca98-fdb7-4998-8074-7894028569a6).
  Empty-state card with a dashed/soft background and one sentence: "Complete courses to build up your certificates."
  → **StudyCloud empty states:** soft lavender card, one sentence, one action; Cloudy (`encouraging`) illustrates it.

### Responsive navigation
- **SchoolAI / Uxcel / Magnific (web)** — left sidebar with icon + label for primary sections, content column to the right.
  → **StudyCloud:** bottom tab bar on phones (< 900 px); persistent left sidebar with the same five sections on tablets/desktop. State is preserved because tabs are kept mounted.

## Decisions derived from the research

1. **One question per screen** in onboarding; progress bar; single bottom CTA.
2. **Continue Learning first** on the dashboard — fastest path back into work.
3. **Honest empty states** instead of decorative fake data (a deliberate departure from streak/XP-heavy examples).
4. **Sources under every AI answer and next to claims**, small and unobtrusive (badge + bottom sheet) — none of the examined products had this; it is StudyCloud's differentiator.
5. **Palette:** the suggested violet (`#7A61E8`) is kept. Research showed that education apps with saturated primaries (Duolingo green, Khan blue) rely on a
   single accent; StudyCloud uses violet as the single accent and *subject colors only on subject icons*. Contrast was checked (see `app/src/theme/tokens.ts`).
6. **Age range 7–19+:** friendly rounded shapes and a mascot (Duolingo/Quizlet) for younger students, but calm neutral surfaces and compact typography (Khan/Notion) so older students are not patronized.

## Open items
- Dedicated sign-in, settings, loading-state and document-library references should be re-checked with Mobbin once those screens are visually reviewed with real users.
- Photomath, Brilliant and Headspace are still unresearched.
