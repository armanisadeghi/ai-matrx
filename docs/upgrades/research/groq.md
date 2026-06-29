# Groq SDK Upgrade Research — `groq-sdk` 0.37.0 → 1.3.0

> **Phase D research handoff** (per `docs/upgrades/README.md` §7, rules R4/R5/R6/R8/R9).
> Produced by the Groq research agent · 2026-06-29.
> **Verdict up front:** Yes — `groq-sdk` **is** used in TypeScript in this repo, in **8 server-side files** (Next.js API routes + server actions). It is the only LLM SDK on a live path. The 1.0 major is a *plumbing* breaking release (zero-dependency, Web-fetch-based), **not** an API-surface change to chat/audio methods. Our specific call sites (`new Groq`, `chat.completions.create`, `audio.transcriptions.create`, `audio.speech.create`) are **runtime-compatible**; the only realistic risks are (a) `APIError.headers` shape, (b) the Node-20-LTS / `@types/node >= 20` minimum, and (c) a possible `message.content` nullable-type tightening. All are low effort.

---

## Sources (cited inline below)

| Ref | Source | URL |
|----|--------|-----|
| **[MIG]** | Official Migration guide (`groq-typescript` `MIGRATION.md`, `main`) | https://github.com/groq/groq-typescript/blob/main/MIGRATION.md |
| **[CHG]** | Official `CHANGELOG.md` (`main`) | https://github.com/groq/groq-typescript/blob/main/CHANGELOG.md |
| **[NPM]** | npm package page + version history | https://www.npmjs.com/package/groq-sdk |
| **[REL]** | GitHub Releases | https://github.com/groq/groq-typescript/releases |

> Note on dates: the `CHANGELOG` records `1.0.0 (2025-12-15)` (codegen/tag date) [CHG]; npm's version-history table lists the public publish of `1.0.0` as **Mar 11 2026** and `1.3.0` as **Jun 21 2026** [NPM]. Either way `0.37.0` (Nov 26 2025) is the last pre-major and `1.3.0` is the current target.

---

## 1. Our usage inventory

Every TypeScript file in this repo that imports/uses `groq-sdk`. **All are server-side** (Next.js API routes under `app/api/**` or `"use server"` actions under `actions/**`) — consistent with our architecture rule that secrets (`GROQ_API_KEY`) never reach the client. There is **no client-side `groq-sdk` usage**.

| # | File | Import | Client init | Groq APIs used | Models | Notes |
|---|------|--------|-------------|----------------|--------|-------|
| 1 | `app/api/audio/transcribe/route.ts` | `import Groq from "groq-sdk"` | `new Groq({ apiKey })` (module scope) | `groq.audio.transcriptions.create({ file, model, response_format: "verbose_json", temperature, language?, prompt? })` | `whisper-large-v3-turbo` | Reads `transcription.text`, `.segments`, `.language`, `.duration`. Custom retry loop reads `err.status` + `err.headers.get("retry-after")`. |
| 2 | `app/api/audio/transcribe-url/route.ts` | `import Groq from "groq-sdk"` | `new Groq({ apiKey })` | `groq.audio.transcriptions.create({ url, model, response_format, temperature, language?, prompt? })` | `whisper-large-v3-turbo` | URL-based transcription (files > 4.5 MB). Same `err.status` / `err.headers.get(...)` error handling. |
| 3 | `app/api/audio/text-to-speech/route.ts` | `import Groq from "groq-sdk"` | `new Groq({ apiKey })` | `groq.audio.speech.create({ model, voice, input, response_format: "wav" })` then `response.arrayBuffer()` | `playai-tts` | Reads `error.status` (401/429). TTS endpoint added in SDK 0.17.0 [CHG]. |
| 4 | `app/api/voice/route.ts` | `import Groq from "groq-sdk"` | `new Groq({ apiKey })` | `chat.completions.create({ model, messages })` + `audio.transcriptions.create({ file, model })` | `llama3-8b-8192`, `whisper-large-v3` | Reads `completion.choices[0].message.content`. STT→LLM→Cartesia TTS pipeline. |
| 5 | `app/api/voice-assistant/route.ts` | `import Groq from 'groq-sdk'` | `new Groq({ apiKey })` | `chat.completions.create({ model, messages })` + `audio.transcriptions.create({ file, model })` | `llama3-8b-8192`, `whisper-large-v3` | Same pattern as #4. `"use server"`. |
| 6 | `actions/ai-actions/assistant-modular.ts` | `import Groq from "groq-sdk"` (alongside `openai`, `@anthropic-ai/sdk`) | `new Groq({ apiKey })` | `chat.completions.create({ model, messages, ...restParams })` + `audio.transcriptions.create({ file, model, language })` | `llama3-8b-8192`, `whisper-large-v3-turbo` | Multi-provider router. Reads `completion.choices[0].message.content`. |
| 7 | `actions/ai-actions/voice-assistant.ts` | `import Groq from 'groq-sdk'` | `new Groq({ apiKey })` | `chat.completions.create({ model, messages })` + `audio.transcriptions.create({ file, model })` | `llama3-8b-8192`, `whisper-large-v3` | `"use server"`. Reads `.choices[0].message.content`. |
| 8 | `actions/ai-actions/groq-debate.ts` | `import Groq from 'groq-sdk'` | `new Groq({ apiKey })` | `chat.completions.create({ model, messages })` + `audio.transcriptions.create({ file, model })` | `openai/gpt-oss-20b`, `distil-whisper-large-v3-en` | `"use server"`. Reads `.choices[0].message.content`. |

### APIs we touch (the complete surface)

| Surface | Used? | Where |
|---------|-------|-------|
| `new Groq({ apiKey })` client init | ✅ | all 8 files |
| `chat.completions.create` (non-streaming) | ✅ | #4, #5, #6, #7, #8 |
| `chat.completions.create` **streaming** (`stream: true`) | ❌ | — *we never stream from TS Groq* |
| `audio.transcriptions.create` (file) | ✅ | #1, #4, #5, #6, #7, #8 |
| `audio.transcriptions.create` (url) | ✅ | #2 |
| `audio.speech.create` (TTS) | ✅ | #3 |
| Tool calling / function calling | ❌ | — |
| Structured outputs (`response_format` json_schema) | ❌ | — (only a commented-out OpenAI example in #6) |
| `models.list` / `embeddings` / `batches` | ❌ | — |
| Error class imports (`Groq.APIError`, etc.) | ❌ | — we read `err.status` / `err.headers` via duck-typing, never `instanceof Groq.APIError` |
| `withResponse` / `asResponse` | ❌ | — |
| `httpAgent` / proxy config | ❌ | — |
| `fileFromPath` / `groq-sdk/shims` / `groq-sdk/src` / `groq-sdk/core` imports | ❌ | — |

> **Architecture note (confirms the question):** Most LLM work *is* routed to the Python backend (`server.app.matrxserver.com`). The TS `groq-sdk` usage that remains is a small set of **legacy/voice/transcription** server routes and the multi-provider `assistant-modular` action — real, shippable code, but not the main agent execution path.

### Who calls these routes/actions (for §6)

| Route / action | Called from |
|----------------|-------------|
| `/api/audio/transcribe` + `/api/audio/transcribe-url` | `features/audio/hooks/useAudioTranscription.ts` → `features/transcripts/components/CreateTranscriptModal.tsx`, `features/transcript-studio/components/columns/AudioImportDialog.tsx`, `app/(core)/transcripts/admin/page.tsx` |
| `/api/audio/text-to-speech` | `features/audio/playback/adapters/groqAdapter.ts`, `features/tts/hooks/useTextToSpeech.ts` → `features/tts/components/AudioPlayerButton.tsx` (block-print "read aloud", settings TTS tab) |
| `/api/voice` + `processMessage` (`voice-assistant.ts`) | `components/voice/voice-assistant-ui/Assistant.tsx`, `hooks/tts/useVoiceChat*.ts`, demo pages under `app/(dev)/demos/general/voice/voice-assistant*` |
| `processDebate` (`groq-debate.ts`) | `app/(dev)/demos/general/voice/debate-assistant/page.dev.tsx` |
| `processAiRequest` (`assistant-modular.ts`) | `hooks/ai/useDynamicVoiceAiProcessing.tsx` |

---

## 2. Version delta — 0.37.0 → 1.3.0

The 1.0 major is a **codegen/runtime modernization**, not a chat/audio API redesign. The headline of the migration guide: *"the SDK now relies on the builtin Web fetch API instead of `node-fetch` and has zero dependencies."* [MIG]

| Version | Date | What landed (relevant to us) | Ref |
|---------|------|------------------------------|-----|
| **1.0.0** | 2025-12-15 (tag) / 2026-03-11 (npm) | TS migration begins; **zero dependencies**, **Web fetch** replaces `node-fetch`; export refactor (`core`/`internal`); `httpAgent`→`fetchOptions`; shims/`src` removed; `fileFromPath` removed; "Fix streaming support" bug fix. | [CHG][MIG][NPM] |
| **1.1.0** | 2025-12-18 | API update (spec/models refresh). | [CHG] |
| **1.1.1** | 2026-03-11 | Client fixes: **abort-signal memory leak fix**, preserve URL params embedded in path, **restore streaming support in `defaultParseResponse`**. | [CHG] |
| **1.1.2** | 2026-03-25 | CI/deps only (incl. `flatted`, `minimatch` CVE pin). | [CHG] |
| **1.2.0** | 2026-05-08 | **Set headers via env**; redact api-key headers in debug logs; multipart array serialization fix. | [CHG] |
| **1.2.1** | 2026-05-28 | `tsc-multi` upgrade (Node 26 compat). | [CHG] |
| **1.3.0** | 2026-06-17 (tag) / 2026-06-21 (npm) | **API update ×2** (spec/model refresh); fix: send `content-type` header for requests with an omitted optional body. | [CHG][NPM] |

**Net:** the *only* breaking surface is in 1.0.0. Everything 1.1→1.3 is additive/bugfix and safe for us.

---

## 3. Breaking changes (1.0.0) mapped to our call sites

From the official migration guide [MIG]. Each row notes whether it touches the inventory in §1.

| # | Breaking change (1.0.0) | Detail | Affects us? | Action |
|---|-------------------------|--------|-------------|--------|
| B1 | **Web fetch replaces `node-fetch`** | Response bodies are Web `ReadableStream`; SDK is now zero-dependency. | ⚠️ **Indirect.** We don't use `withResponse`/`asResponse`. `audio.speech.create(...).arrayBuffer()` (#3) is standard on the Web `Response` and **still works**. | Verify #3's `.arrayBuffer()` at runtime (it's a `Response` method — fine). No code change expected. |
| B2 | **`APIError.headers` is now a Web `Headers`** | Was `Record<string, string \| null \| undefined>`; now `Headers` (`.get(...)`). | ✅ **Yes — #1, #2.** We already call `err.headers?.get?.("retry-after")` via optional chaining. A real `Headers` instance *has* `.get()`, so this **keeps working** (and is now type-correct). #3/#4/#5 only read `err.status`. | None required — our duck-typed `.get?.()` is forward-compatible. Optionally drop the `?.` once on 1.x. |
| B3 | **Path params auto-URI-encoded** | SDK now encodes path params; manual `encodeURIComponent` would double-encode. | ❌ No. We pass no path params (only body params to `create()`); the `url` in #2 is a **request body field**, not a path param. | None. |
| B4 | **`httpAgent` removed → `fetchOptions`** | Proxy config moved to platform `fetchOptions.dispatcher`. | ❌ No. We never set `httpAgent`. | None. |
| B5 | **Export refactor** (`groq-sdk/core`, `error`, `pagination`, `resource`, `uploads` → `groq-sdk/core/*`; `APIClient` removed) | Subpath imports relocated. | ❌ No. We only `import Groq from "groq-sdk"` (default). | None. |
| B6 | **Resource classes** no longer importable from root | e.g. `const { Completions } = require('groq-sdk')` removed. | ❌ No. We never destructure resource classes. | None. |
| B7 | **`uploads` exports cleaned up** | `fileFromPath`, `isFileLike`, `createForm`, etc. removed; `toFile` + `Uploadable` remain at `groq-sdk/core/uploads`. | ❌ No. We pass a Web `File` directly to `transcriptions.create({ file })` (#1,#4–#8) — no `toFile`/`fileFromPath`. | None. |
| B8 | **`fileFromPath` removed** (use `fs.createReadStream`) | Node-only helper dropped. | ❌ No. We never read from disk; `file` is the uploaded `File`/`Blob`. | None. |
| B9 | **`groq-sdk/shims` removed** | `import 'groq-sdk/shims/web'` gone; rely on correctly-configured global types. | ❌ No (we don't import shims). ⚠️ but see B11 (types). | None directly. |
| B10 | **`groq-sdk/src` directory removed** | `groq-sdk/src/*` imports → `groq-sdk/*`. | ❌ No. | None. |
| B11 | **Env/tooling minimums:** Node **20 LTS**, TypeScript **4.9+**, `@types/node >= 20` | Web-fetch types require modern `@types/node` + `lib`/`target` ≥ ES2018 (ES2020+ recommended). | ✅ **Yes — environment.** We're already on Node **24.x** (`engines.node`, Phase 0) and `@types/node` 25/26 → satisfied. TS 5.9 (→6 in Phase B) ≥ 4.9 → satisfied. | Confirm `tsconfig` `lib`/`target` are ES2020+; confirm no `groq-sdk/shims` references (there are none). |
| B12 | **Possible `message.content` type tightening** | OpenAI-aligned codegen often types `choices[0].message.content` as `string \| null`. (Not called out explicitly in MIGRATION but is the usual codegen consequence of the TS migration.) | ⚠️ **Potential — #4,#5,#6,#7,#8** return `.message.content` as `string`. | **Verify after bump.** If TS now reports `string \| null`, add a `?? ""` / null guard at those 5 return sites. Harmless under our current non-strict tsconfig, but fix cleanly for Phase B (TS 6 + strict). |

**Bottom line:** of 12 breaking surfaces, **9 do not touch us at all**, **B2** is already forward-compatible by luck of our optional-chaining, **B11** is already satisfied by our Node 24 baseline, and **B12** is the one thing to actually eyeball after the bump.

---

## 4. New features to ADOPT (per R4 — "update ≠ done")

Given our **actual** usage (no streaming, no tools, no structured outputs from TS today), the high-value adoptions are modest and infrastructure-leaning:

| Feature (version) | What it gives us | Recommend? | Where |
|-------------------|------------------|------------|-------|
| **Zero dependencies + native fetch (1.0)** [MIG] | Smaller install, no `node-fetch`/transitive CVE surface, identical behavior on Vercel's Node-24 runtime. This is the *reason* to do the bump. | ✅ **Adopt (free).** | All 8 files — no code change, pure win. |
| **Abort-signal memory-leak fix (1.1.1)** [CHG] | Cleaner long-running serverless invocations (our transcribe routes set `maxDuration` 120–300s). | ✅ **Adopt (free, comes with version).** | #1, #2 |
| **`content-type` on omitted-body requests (1.3.0)** [CHG] | Correctness fix for edge requests. | ✅ Free. | — |
| **Set headers via env (1.2.0)** [CHG] | Inject default headers without code (e.g. routing/observability). | ⚪ Optional. Not needed now. | — |
| **Built-in retries** (existing SDK feature, `maxRetries` client option) | We hand-rolled retry/backoff loops in #1 and #2. The SDK already retries `429/5xx` with `retry-after` honoring. | 🟡 **Consider consolidating** — pass `new Groq({ apiKey, maxRetries: 3 })` and simplify our custom loops *only if* we still want the structured `logTranscriptionError` per-attempt logging (which the SDK won't give us). **Lean: keep our loop** for the logging, but we *could* drop it. Decide with Arman. | #1, #2 |
| **Streaming chat completions** (`stream: true`, async-iterable) — fixed/hardened in 1.0/1.1.1 [CHG] | Token streaming for the voice/assistant LLM calls. | 🟡 **Optional, not required.** Our voice pipeline currently waits for the full completion before Cartesia TTS, and the heavy agent path is Python. Adopt only if we want faster TTS-time-to-first-audio in the voice demos. | #4–#8 |
| **Tool calling / structured outputs** | Function calling, JSON-schema responses. | ❌ **Skip.** Not used in TS; the agent/tool path lives in Python. | — |
| **Newer models** (1.1.0 / 1.3.0 "api update") [CHG] | `llama3-8b-8192` (used in #4–#7) is an older model id. Groq has since shipped newer Llama / GPT-OSS / Whisper variants (#8 already uses `openai/gpt-oss-20b` and `distil-whisper-large-v3-en`). | 🟡 **Worth a refresh, but model choice is a product decision, not an SDK constraint.** Flag `llama3-8b-8192` for review separately. | #4, #5, #6, #7 |

**Recommended adoption set for Phase D:** the bump itself (zero-dep + fetch + abort fix) is the win; **no mandatory code changes**. Optionally tidy the hand-rolled retry loops and/or refresh stale model ids as a *separate, product-reviewed* follow-up — do not bundle into the bump (R1/R2).

---

## 5. Migration steps (ordered)

> Per R6, Arman + lead agent perform this core upgrade. R1: this is one isolated commit. R10: must pass `pnpm install --frozen-lockfile`, `pnpm type-check`, and a (targeted) build before handoff.

1. **Bump the dependency.**
   - `package.json` currently has `"groq-sdk": "latest"`. Pin it explicitly for a reviewable diff: set `"groq-sdk": "1.3.0"` (matches the tracker target; avoids `"latest"` silently floating).
   - `pnpm install` → confirm `pnpm-lock.yaml` resolves `groq-sdk@1.3.0` and that its **transitive deps drop to zero** [MIG] (lockfile should shrink — sanity signal the major actually landed).
2. **Run the codemod (dry first).** The SDK ships a migration CLI [MIG]:
   - `./node_modules/.bin/groq-sdk migrate --dry ./app/api ./actions/ai-actions`
   - Expected: **no changes** for us (we use only the default import + `create()` calls). If it proposes anything, review — it should be a no-op given §3.
3. **Type-check.** `pnpm type-check`. Watch specifically for:
   - **B12:** `choices[0].message.content` typed `string | null` at the 5 return sites (#4–#8). If so, change `return completion.choices[0].message.content;` → `return completion.choices[0].message.content ?? "";` (or a null guard) in:
     - `app/api/voice/route.ts`
     - `app/api/voice-assistant/route.ts`
     - `actions/ai-actions/assistant-modular.ts` (`callGroqAPI`)
     - `actions/ai-actions/voice-assistant.ts`
     - `actions/ai-actions/groq-debate.ts`
   - **B2:** `err.headers` typing — we already use `err.headers?.get?.(...)`, so no error expected. (Optional cleanup: it's now a real `Headers`.)
4. **Confirm environment (B11).** No action expected — Node 24 baseline + `@types/node` 25/26 already exceed the Node-20 / `@types/node >= 20` minimum. Just confirm `tsconfig.json` `target`/`lib` are ES2020+ (they should be for Next 16).
5. **Spot-check the non-fetch usage (B1):** in `app/api/audio/text-to-speech/route.ts`, confirm `await response.arrayBuffer()` still returns the audio bytes (it's a standard Web `Response` method — expected fine).
6. **Verify there are no relocated-subpath imports** (B5/B7/B9/B10): grep confirms we only `import Groq from "groq-sdk"` — nothing under `groq-sdk/core|shims|src|uploads|error`. ✅ already clean.
7. **(Optional, separate commit — do NOT bundle):** consolidate retry loops onto `new Groq({ maxRetries })` and/or refresh `llama3-8b-8192`. Gate behind Arman per R1/R8.
8. **Verify + hand off (R10):** `pnpm install --frozen-lockfile`, `pnpm type-check` (0 errors), targeted build of the audio/voice routes. Update `docs/upgrades/README.md` Phase D row to ✅-ready and append a Change-log line.

**Estimated effort:** ~15–30 min. Most likely a **dependency bump + zero or five one-line null-guards**.

---

## 6. Routes to review (R8) — before/after test plan

Concrete user-facing surfaces that exercise Groq through the 8 files. Arman reviews each **before and after** the bump.

| R8 surface | Route / entry | Exercises | Groq file(s) | How to test |
|------------|---------------|-----------|--------------|-------------|
| **Audio transcription (primary)** | `/transcripts/new` (`CreateTranscriptModal`) and Transcript Studio `AudioImportDialog` | Upload audio → transcript text + segments | #1 `/api/audio/transcribe` (≤4.5 MB), #2 `/api/audio/transcribe-url` (>4.5 MB) | Transcribe a short clip **and** a >4.5 MB clip; confirm text, segments, language, duration, and that the retry path still logs. |
| **Transcription admin** | `/transcripts/admin` | Admin transcription tooling | #1, #2 | Smoke transcribe. |
| **Text-to-speech / "read aloud"** | TTS playback via `AudioPlayerButton` / block-print read-aloud / settings → voice TTS tab | Text → WAV audio playback (`playai-tts`) | #3 `/api/audio/text-to-speech` | Click read-aloud on a block; confirm audio plays (validates `audio.speech.create(...).arrayBuffer()` under Web fetch — B1). |
| **Voice assistant (demo)** | `/demos/general/voice/voice-assistant` (+ `-two`, `-cdn`) | Mic → STT → Groq LLM → Cartesia TTS | #4 `/api/voice` and/or #5/#7 `processMessage` (voice-assistant action) | Speak; confirm transcript + spoken reply. Validates `chat.completions.create` + `audio.transcriptions.create` (`llama3-8b-8192`). |
| **Debate assistant (demo)** | `/demos/general/voice/debate-assistant` | Voice debate coach | #8 `processDebate` (`groq-debate.ts`) | Speak; confirm reply. Uses `openai/gpt-oss-20b` + `distil-whisper-large-v3-en`. |
| **Modular multi-provider assistant** | via `hooks/ai/useDynamicVoiceAiProcessing` (`processAiRequest`) | text/audio in → Groq/OpenAI/Anthropic out | #6 `assistant-modular.ts` | Trigger a Groq-routed request; confirm completion text returns (validates B12 null-guard). |

> The `(dev)/demos/general/voice/*` routes only build under `MATRX_PROFILE=full` (default in dev) — test locally with `pnpm dev`. The `/transcripts/*` and TTS read-aloud surfaces are core/production and the **most important** to verify.

---

## 7. Risk summary

| Item | Risk | Confidence |
|------|------|-----------|
| Dependency bump itself | **Low** — plumbing change, our surface is the stable chat/audio methods | High [MIG][CHG] |
| `APIError.headers` (B2) | **None** — our `?.get?.()` is forward-compatible | High |
| `message.content` nullable (B12) | **Low** — at most five one-line `?? ""` guards | Medium (verify at type-check) |
| Env/tooling (B11) | **None** — Node 24 + `@types/node` 25/26 already exceed minimums | High |
| TTS `arrayBuffer()` (B1) | **None expected** — standard Web `Response` method | High |
| Streaming regressions | **N/A** — we don't stream from TS Groq | High |

---

## Change Log

| Date | Change | By |
|------|--------|-----|
| 2026-06-29 | Initial research doc: usage inventory (8 server files), 0.37→1.3 delta, 1.0 breaking-change mapping, adoption recs, migration steps, R8 routes. | Groq research agent |
