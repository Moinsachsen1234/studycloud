# AI pipeline

Implemented in `server/src/ai/pipeline.ts` (`generateProgram`) and `tutor.ts`.

| Stage | What happens | Where verification happens |
|---|---|---|
| 1 Extract | Text and structure from TXT, DOCX, text-layer PDF (page numbers kept) or photo (OCR via configured vision model) → `document_segments` | magic-byte sniffing, size limits |
| 2 Analyze | Subject guess, grade range, concepts, misconceptions, objectives → `concepts`, `learning_objectives` | zod schema |
| 3 Gaps | Objectives + (research mode only) knowledge gaps with short search keywords | consent + rights check before anything leaves the server |
| 4 Retrieve | `ResearchService` queries trusted providers, rights-checks each source, stores metadata, gives the pipeline *evidence* with ids `E1…` | `ContentRightsService`, `safeFetch` |
| 5 Generate | LLM writes lessons referencing only `S#` (student segments) and `E#` (evidence) | — |
| 6 Validate | Each block: schema ✔, no URLs in model text, groundings resolved, external claims verified, arithmetic in worked examples checked by a safe evaluator | `SourceVerificationService`, `math.ts` |
| 7 Publish | Persist program, lessons, claims and claim↔source links; rejected blocks are counted and shown as notices | — |

## Rules the code enforces

- **The model cannot create sources.** Only `S#`/`E#` ids from the current run resolve; anything else rejects the block.
- **Source mode is binding.** `materials_only` never reaches the research service; an `external` block in that mode is rejected. If the material is insufficient the program says so instead of browsing.
- **Prompt-injection hygiene.** Student documents and retrieved pages are wrapped in `<untrusted_*>` fences (closing tags are neutralised) and the system prompt says instructions inside them are data. This is defence in depth only: the real protection is that the model has no tools, cannot name URLs, and every output is validated by code.
- **Data minimisation.** Only the segments needed go to the provider; research queries are short keywords without personal data.
- **Consent and quota.** `assertMaySendToAi` requires the student's `ai_processing` consent and a rights decision for `send_to_external_ai`; `consumeAiQuota` enforces a daily call limit.
- **Failure is explicit.** No key → `AI_NOT_CONFIGURED`. Invalid model JSON → `INVALID_MODEL_OUTPUT`. Nothing is silently replaced by canned text.

## Tutor

`askTutor` retrieves relevant segments from the student's own documents (scope: all / document / program / lesson), optionally runs research, and returns an answer plus provenance. Provenance is resolved by the backend (`resolveProvenance` → `publicSource`), so tutor citations carry the same real metadata as lesson citations. Private documents are referenced by in-app preview only.

## Honest status

The pipeline has been exercised against a scripted LLM (tests) and a canned dev mock plus **live Wikipedia retrieval**. It has not been run against a real model.
