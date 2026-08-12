# Pattern Patrol P1 — No dead ends

**Run:** 2026-08-12 (America/Los_Angeles)  
**Authority:** Tier M only for exact `EntityRef` swaps on registered tokens; Tier R for every missing route, missing peek, ambiguous identity, comparison, count, or behavior decision  
**Baseline:** first run (no prior `no-dead-ends.md`)  
**Certification:** **REJECTED**; the attempted four-file product batch was fully reverted and no product fix shipped

## Outcome

- **126 detector findings** remain: 77 high and 49 medium across 74 files.
- **0 fixed.** A four-file / six-finding Tier-M attempt was rejected and fully reverted.
- Rules: 71 bare ids, 40 unlinked names, 4 unlinked counts, 11 files with no recognized door primitive.
- Full scan: 6,973 `.tsx` files under `app/`, `components/`, `features/`, and `lib/`.
- The committed scoreboard snapshot was refreshed with `pnpm check:dead-ends:write`.

The 126 count is the detector's durable raw baseline. It intentionally stays
raw so the scoreboard cannot hide detector noise. The verified false-positive
classes below are excluded from the mutation queue but are not allowlisted or
suppressed; human-owned exception rules were not invoked.

## Scope scanned

First/full pass, required because no prior report or automation memory existed:

- all four detector rules over the complete supported tree;
- all 1,060 route leaves and 122 top-level feature directories for the first structural baseline;
- every open P1 sighting and the two free-form dead-end notes in `.matrx/PATROL_SIGHTINGS.md`;
- live route, peek, action, overlay, and window inventory for registered-token candidates;
- the standing P1 sweep worklist, rechecked against current source rather than trusted as current fact;
- all available P1 reports from the preceding month (none).

Raw git churn was not used for scope.

## Detection baseline

| Rule | Findings |
| --- | ---: |
| Bare id rendered as text | 71 |
| Entity name rendered with no door | 40 |
| Count of records with no navigation | 4 |
| Surface with no recognized door primitive | 11 |

Largest entity groups: agent 20, conversation 11, scope 10, file 9, task 7,
organization 6, note 5, agent shortcut 2, skill 2, folder/project/transcript/
quiz session 1 each. Eleven file-level findings have no entity token.

Largest feature groups: `app/(dev)` 20, `features/agents` 17,
`components/admin` 15, `app/(transitional)` 6,
`features/agent-comparison` 5, `features/surfaces` 5,
`components/debug` 5, and `features/window-panels` 4.

## False-positive triage

The detector snapshot remains raw; these verified rows are not safe mutation
targets and require detector work or no change:

1. `features/agents/components/usages/NotifyOwnerDialog.tsx` — already renders canonical `EntityDoorControls` beside the shortened agent id; the file-level and id rows are sibling-door false positives.
2. `features/agents/route/AgentViewContent.tsx` — the current agent's own detail page; the id is a copy control for the page subject, not a foreign reference.
3. `features/agents/components/inputs/smart-input/RunSkillPicker.tsx` — selection/injection surface; `skill` has no `hrefFor` and configured rows are not record references.
4. `features/scopes/components/entity-context/EntityScopeTagger.tsx` — selection/tagging chips whose click performs the primary action; `scope` has no canonical detail route.
5. `features/code/views/library/LibraryTreeNode.tsx` — tree node name expands/collapses the folder and owns the v3 context menu; `code_folder` has no detail route.
6. `features/agents/ui-first-tools/ui/lists/TaskPanel.tsx` — rows are `chat.agent_task`, not the canonical `task` entity; linking them to `/tasks/{id}` would fabricate identity.
7. `features/agent-shortcuts/components/ShortcutList.tsx:482` — the card already renders always-visible canonical `EntityDoorControls` for the same shortcut beside its label.
8. `features/transcripts/components/TranscriptsSidebar.tsx:296`, `features/notes/actions/NotesTreeView.tsx:242`, `features/files/components/preview/FileResourceChip.tsx:116`, and the Quick Save success banners are existing open/select/detail flows whose door sits on an ancestor or sibling that this per-expression detector cannot see.

No allowlist entry, suppression, or proposed exception was added. The detector's
known limits remain authoritative; these observations are evidence for later
precision work, not permission to hide findings.

## Ranked report-only worklist

### Rank 1 — registered-token references

The high-severity set has a live `hrefFor`; these are the only possible Tier-M
class, but each batch still needs context review and visual certification.

1. `features/agents` — 12 high findings after raw detector ranking. Start with `ContextSlotDetailSheet`'s `summary_agent_id`; keep picker, detail-subject, and debug cases out of a mechanical batch.
2. `components/admin` — 9 high findings, concentrated in the two agent-definition slice viewers. Consolidation is judgment-heavy and stays Tier R/C; do not mass-edit both copies.
3. `app/(dev)` — 9 high findings. Demos remain in scope, but selections and diagnostic clients need per-surface triage.
4. `features/agent-comparison` — 5 high findings. `MasterInputWindow` can preserve state with new-tab doors; `RunsComparisonTable` must preserve blind-test anonymity and therefore needs reveal-state design.
5. `features/surfaces` — 4 high findings. `SurfaceAgentBindPanel` and bound-agent rows have stable agent ids, but their picker/run/settings behavior requires per-surface verification.
6. `app/(admin)` — 4 high findings across AI tasks and agent-app analytics/executions.
7. `features/window-panels` — 4 high debug/tray findings; raw ids need full wrapping and accessibility preservation.

### Rank 2 — missing or unresolved identity

The 49 medium findings are report-only. The largest resolved token without a
route is `scope` (10). The remaining tail includes `skill`, `folder`,
`quiz_session`, and expression roots the detector cannot map (`mapping`,
`record`, `entry`, `broker`, `bookmark`, `tool`, and similar). Do not mint a
route from a guessed token. Register the entity and its canonical destination
first, then repair call sites.

### Rank 3 — Door Law corollaries

The four count findings and comparison/relationship surfaces require judgment:
counts must reach their filtered records; comparisons must state verdicts;
agent lineage must render every resolvable parent/child/twin; detected problems
must include their one-click fix. These are Tier R/C even where the raw detector
ranks the name or id high.

## Inventory pass

Searches run exactly as required by the `no-dead-ends` skill:

- route/icon registry: `hrefFor` in `features/scopes/registry/entityRegistry.ts`;
- peeks: `features/organizations/peek/kinds-list.ts` (20 canonical peek kinds);
- actions: `features/agents/browse/agentActionRegistry.tsx` and `components/official/item/`;
- overlays/windows: entity-named files under `features/overlays/openers/` and `features/window-panels/windows/`.

Found and reused during the rejected attempt: the existing `EntityRef`
primitive, current task/app/organization routes, the shared peek host, and the
existing agent action/window inventory. No new function, component, hook,
slice, service, table, route, peek, overlay, window, or chunk boundary was
created. Current structural adoption baseline: 88 files import `EntityRef`.

## Rejected Tier-M batch

Attempted files (4; within the 15-file cap):

- `app/(admin)/administration/ai/ai-tasks/page.tsx`
- `app/(admin)/administration/agents/agent-apps/analytics/page.tsx`
- `app/(admin)/administration/agents/agent-apps/executions/page.tsx`
- `app/(core)/organizations/page.tsx`

Attempted result: six scoped findings cleared. Main-agent type-check, doctrine,
tsconfig, and scoped detector checks passed; changed-file lint exposed only
pre-existing errors/warnings outside the changed lines.

**Certifier verdict: REJECTED.** The executions table stopped preserving the
full task id in the accessible label because `EntityRef` received no `name`.
The required desktop/mobile and light/dark matrix also could not run: no
approved `preview_start` capability was available and no shared server listened
on the mandated port 3001. The certifier therefore rejected the batch exactly
as instructed. All four product files were restored byte-for-byte; the final
full scan returned to 126 findings.

## Ledger verification

- No open checkbox-form P1 sighting existed, so no P1 checkbox changed.
- The 2026-08-09 keyword-performance fake-empty-state note is resolved in current source: failed reads render a distinct error state and Retry path instead of “No search queries stored yet.”
- The 2026-08-11 `assertFound` note is resolved in current source: zero-row reads no longer claim deletion and canonical-token callers route through the Access Gate.

## Structural baseline for the next run

Repository commit at scan: `24a25f61878d6e60310eb4a907df3928afc7eaf6`.

- Route leaves: **1,060**; sorted-list SHA-256 `8cc71c1039308bd4656be93d2ee0231c4e1b525805f2610a2044a29f8b669dc1`.
- Feature directories: **122**; sorted-list SHA-256 `8dc2c6b8e012199b6c675be94529636b378de258c5d9902b53d2f7b728899948`.
- Route groups: `(admin)` 177, `(auth-pages)` 6, `(core)` 513, `(dev)` 236, `(oauth-review)` 1, `(popup)` 1, `(public)` 37, `(transitional)` 82, non-grouped 7.
- `EntityRef` importer files: **88**; sorted-list SHA-256 `d60d53bc8aa34574dd57a0d37d210709d822a828e0bcf8f5bee8305d94be8b91`.
- Finding-file list SHA-256: `8d856ff5e3487f4181d8b092f9f0e1b82a2fb089dcf8e501c72924825db754c6`.

Feature-directory baseline:

```text
access-gate, action-catalog, admin, administration, agent-apps,
agent-comparison, agent-connections, agent-context, agent-settings,
agent-shortcuts, agents, ai-models, ai-runs, ai-work, api-integrations, applet,
artifacts, assists, audio, auth, canvas, cms, code, code-editor, code-files,
comments, content-ir, content-manager, context-menu-v3, conversation, crm,
cx-chat, cx-conversation, cx-dashboard, dashboard, data-tables, dictionary,
dynamic-react, education, email, entitlements, expertise, feature-docs,
feedback, file-analysis, files, flashcards, gallery, google-workspace,
growth-loop, html-pages, image-manager, image-studio, industries, invitations,
item-presentation, kg-graph, kg-suggestions, knowledge, landing, legal,
marketing, math, matrx-envelope, media-capture, media-devices, memory,
message-templates, messaging, news, notes, organizations, overlays,
page-extraction, pdf, pdf-demo, pdf-extractor, podcasts, pricing, projects,
public-chat, quick-actions, rag, recipes, registered-results, reports,
request-recovery, research, resizable-panels, resource-manager, rich-document,
rich-text-editor, scheduling, scope-system, scopes, scraper, secrets,
server-logs, settings, sharing, shell, skills, sms, ssr-trials,
structured-lists, surfaces, tasks, text-counter, text-diff,
tool-call-visualization, tool-registry, transcript-studio,
transcription-cleanup, transcripts, tts, user-lists, user-profile, voice-agent,
war-room, whatsapp-clone, window-panels, workflow-emit
```

Next run: diff route leaves, top-level feature directories, and `EntityRef`
importers against this commit/list; add the ledger; run a full pass only on
every fourth run unless structural novelty demands more.

## Loop health and candidates

- No preceding-month P1 report exists. A longer cadence cannot be proposed from one run; keep the weekly cadence.
- This is the first rejected P1 batch, not a repeated-rejection pattern. Future mutation is not globally paused, but no mutation from this run survived.
- No recurring unregistered class was discovered. The sibling-door and selection noise belongs to the existing P1 detector precision backlog, not a new patrol candidate.
- No human exception was proposed.

## Verification

- `pnpm check:dead-ends:write` — completed; 126 raw findings and scoreboard snapshot refreshed.
- `pnpm type-check` — passed before rejection.
- `pnpm check:doctrine` — passed before rejection.
- `pnpm check:tsconfig` — passed with notes about existing stale `.next*` directories.
- `pnpm check:migrations` — exited 0 but reported pre-existing checksum drift in `web_audit_rollup_gone_pages.sql`; this report-only patrol did not alter or reapply an unrelated live migration.
- Changed-file ESLint — three pre-existing React effect errors and one pre-existing banned-icon warning; no suppression added.
- Product-file diff after revert — clean for all four attempted files.
- Certifier — **REJECTED**; full accessible id was not preserved and the required visual matrix was unavailable.
