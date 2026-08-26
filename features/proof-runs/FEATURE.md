# Proof Runs (admin surface)

**Route:** `/administration/compute/proof-runs` (super-admin) · **Server:** aidream
`aidream/services/proof_runs/FEATURE.md` — the system of record for everything this page shows.

**Status:** LIVE (2026-08-26). Verified in the browser against the production server: the check
tile, a streamed replay run, the attestation readout and the run history all render from real
data, and the first click surfaced a real server-side defect (see § What the first click found).

## What it is

The platform's expensive checks — the ones that call real providers so their result means
something — with the receipts that prove each run actually happened. This page is the surface for
someone who does not want to live in a terminal: see every check and its KPIs, run one, watch each
proof land, and read the history.

## What this page owns — and what it deliberately does not

| Owns | Does not own |
|---|---|
| The check list, the run controls (auto / live / replay), the live console, the run-history table | How a `proof_check_status` tile or a `proof_attestation` readout **looks** |

`proof_check_status` and `proof_attestation` are **registered kinds with active kind components**,
so they render through `KindInstanceRender` here exactly as they would in a chat, a live-run
window, or any future surface (THE CANONICAL COMPONENT LAW — `features/content-ir/FEATURE.md`).
Their components are DB-authored (`content_ir.kind_component`, `source='db'`):

- `proof_attestation_readout` — verdict header with the strength chip (live receipts vs replay),
  the proven/failed/not-checked distribution bar, expandable proof rows carrying the observed
  numbers each claim was computed from, and the receipts anchor.
- `proof_check_status_tile` — live verdict kept separate from any verdict, cadence + next due,
  30-day runs / pass rate / spend, and whether a recording exists to replay.

`proof_result` and `proof_recording` stay **inactive by design** — nested-only children rendered
by their parent, the same precedent as `faq_item` and `media_chapter`.

## Files

| File | Role |
|---|---|
| `api.ts` | The `/proof-runs` client. `getJson` for reads; `postNdjson` for the run stream. |
| `types.ts` | Request/response shapes. Kind payloads are **imported from the generated artifact**, never re-declared. |
| `components/ProofRunsClient.tsx` | The page: checks, controls, history, run orchestration. |
| `components/ProofRunConsole.tsx` | The live console; hands the finished attestation to the kind component. |

## Reading the page

- **Run mode** is the money decision. `auto` (default) lets the server's gate decide — live when
  the cadence is due and there is budget, otherwise a replay. `live` forces real providers
  (bypasses the cadence, never the monthly ceiling). `replay` never reaches the external boundary.
- **A replay is cheap, not free** (~$0.016): the step actually under test still runs for real, or
  a replay would be a playback that can never fail. The header's month-to-date meter counts both.
- **A skipped proof is never a pass.** In replay the five boundary proofs read "Not checked", and
  the attestation says `replay_only` rather than `live_receipts`.
- **The gate declining to run is not a failure** — it renders as an amber notice with the reason.

## What the first click found

The very first run from this page failed with `NodeRegistryError: node type 'control.branch' is
already registered`. The check re-registered its node packs on every run, which is harmless in a
CLI or pytest process (each is fresh) and fatal in the **long-lived server** this page talks to.
No terminal path could have caught it. Fixed server-side (idempotent registration + a test that
calls it three times) — and the proof system behaved correctly throughout: the run was recorded
FAIL, `check_completed` named the exact error, and the boundary proofs stayed SKIPPED rather than
quietly reading as passes.

## Change Log

- **2026-08-26 — Claude: built.** Page, feature client, live console, and the two DB kind
  components (`proof_attestation_readout`, `proof_check_status_tile`) that activated both kinds.
  Registered in the admin nav under Compute → Verification. Verified in-browser against the
  production server; `pnpm type-check` green.
