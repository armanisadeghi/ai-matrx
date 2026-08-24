# Masterwork — Rulebooks, rules, Masterworks (Masterwork Studio's UI home)

> **Vocabulary is settled** ([`common-docs/systems/platform/vocabulary/FEATURE.md`](/Users/armanisadeghi/code/common-docs/systems/platform/vocabulary/FEATURE.md)
> § Settled — Masterwork; work order: [`common-docs/systems/masterwork/HANDOFF.md`](/Users/armanisadeghi/code/common-docs/systems/masterwork/HANDOFF.md)):
> **Rulebook** (was pack) · **a Masterwork** (was desk) · **Build** (was compile) ·
> **Audition** (was backtest) · **Scout** (was Expertise Interviewer) · **Approach**
> (was lane/mode). This feature directory was renamed from `features/expertise/`
> on 2026-08-17 and the code now speaks the canonical words.

> **The one-line law:** an Expert's knowledge lives in a RULEBOOK (data, versioned,
> citable), never in prose inside an agent prompt. Masterworks are BUILT from
> Rulebooks; auditors consume the rules verbatim; every audit verdict cites a rule
> id. This feature is the UI where a non-technical Expert sees, edits, and grows
> their Rulebook — Arman's ruling: _nothing is real until a normal user can see it
> and do it in the UI._

## Status

- 🚨 **THE ONE CANONICAL MASTERWORK SYSTEM — the Conductor (2026-08-18).** Arman: _"This
  rulebook thing is one of many methods to extract an expert's knowledge… **We need one
  system to build all of this.** … **the only thing that ever makes a Masterwork is our one
  single canonical Masterwork system.** And all we do is we go to that system and we attach
  what we already have."_ The Rulebook page's primary action is now **Make a Masterwork**,
  and it opens a real STREAMING CONVERSATION with the **Conductor** — Mandate
  `masterwork.conductor` (agent `c7126299-…`, Claude Opus 5, tools `rulebook` ·
  `workflow_catalog` · `workflow_author` · `workflow_plan`), on the same agent-execution +
  conversation machinery as `/chat` and the Scout. Never a form, never a modal, never a
  progress box: _"Everything should just stream anyway. I'm sick of you hiding everything
  and not letting me just talk to the agent."_

  **The five properties that make it the system rather than a chat window:**
  1. **ATTACHMENTS, not a hardcoded input.** A Rulebook is ONE attachable kind among many —
     the Conductor receives `attachments` (`[{entity_token, id, name}]`) as a NAMED
     variable, and adding an attachable kind changes that list, not the component. The
     session itself is a canonical association: `conversation --(role 'conducting')-->
     rulebook`, on the same registered pair the Scout's `interview` edge uses. **Every
     reader must filter on the role** — an interview is the Expert's own words and feeds the
     Record; a Conductor session is a build conversation ABOUT the rules and must never be
     mistaken for something the Expert said (`record/service.ts` was fixed to filter, in the
     same change).
  2. **It learns what the platform can actually do** from `workflow_catalog
     action=list_node_types` — the LIVE registry, so the capability list is never a
     hardcoded lie in a prompt.
  3. **It POKES HOLES — the heart.** For every input the method needs it says out loud where
     that input comes from, in exactly one of three buckets: **(a)** I can supply it — naming
     the real step; **(b)** I must ask you — one concrete question with options and a
     recommendation; **(c)** this belongs to a specialist agent.
  4. **An unresolved input becomes a real `plan.step` Plan** (worked with `workflow_plan`),
     **never an invented text box.** This is the mechanism that stops "two text boxes and a
     rubric" from ever being called a Masterwork again.
  5. **It is allowed to REFUSE**, naming what is missing, what would fix it, and what it
     could honestly build today.

- 🚨 **THE RULES ARE HANDED TO THE AGENT — never fetched (2026-08-19, disease D4).** Arman,
  on a live Conductor conversation that opened with a `rulebook` tool call and later admitted
  it had only skimmed the rules: _"why did he have to call a tool to get the rules in the
  first place? … the rules should just be variables that are directly fed into him… this
  agent should never have even started without getting the rules in place."_

  Both conversational Masterwork agents — the **Scout** and the **Conductor** — now RECEIVE
  the complete Rulebook as the named variable **`rulebook_document`**, substituted into the
  prompt before turn 1. It is a `required_variable` on both Mandates, so a rebind to an agent
  that cannot receive it is refused at bind time, AND the launch refuses at run time when the
  caller does not supply it.

  - **ONE renderer:** `agent-context/rulebookDocument.ts` → `renderRulebookDocument` —
    identity, intake answers, sections, every rule with its review state and connections, and
    the Expert's open review feedback broken out. The Rulebook surface's `content` value uses
    the same function, so the page's agents and the panels' agents can never see two
    different Rulebooks.
  - **ALWAYS PRESENT, EVEN WHEN BLANK.** A Rulebook with no rules renders words saying so.
    An empty string is indistinguishable from a wiring failure and is REFUSED
    (`missingRequiredVariables` treats blank as missing).
  - **Loaded before the conversation is minted:** `agent-context/useRulebookDocument.ts`.
    Its `error` is a refusal, not a warning — the panel says so to the Expert and offers
    Retry rather than starting blind.
  - **The `rulebook` tool is DEMOTED, not retired.** Variables substitute once, at
    conversation start, so the Scout — which WRITES rules mid-conversation — still re-reads
    after its own writes. What is forbidden is the FIRST read being a tool call.
  - Law: `common-docs/systems/agents/agent-variable-binding/FEATURE.md` § THE DOCUMENT-VARIABLE
    COROLLARY · register: `common-docs/operations/agent-failure-diseases.md` § D4 · live
    proof: `aidream/scripts/_verify_d4_document_variable.py`.

  **Files:** `conduct/ConductorPanel.tsx` (THE ONE implementation — panel + full-page route
  both render `ConductorContent`) · `conduct/service.ts` (the attachment shape, the
  `conducting` edge, the session list) · route `app/(core)/masterwork/[id]/conduct/page.tsx`
  (`?conversation=` · `?new=1`; the page opener is `?conduct=1`). Declared as agent role
  `conductor` on the existing `matrx-user/masterwork-rulebook` surface — the Conductor is
  another agent on the Rulebook surface, not a second surface to keep in sync.

  **Live-proved END TO END on Arman's real SEO Rulebook (`8d1d4f08-…`, 28 approved rules),
  signed in as admin against the production backend.** It read the Rulebook, made 12
  `workflow_catalog` calls, and returned a rule-by-rule verdict naming the rules each answer
  covered; its sharpest finding is one no rubric would ever reach — _"All 28 of your rules
  describe how to judge, categorize, and validate a keyword. Not one of them says where the
  candidates originate."_ On the answers it said _"three things become open steps rather than
  fake ones"_ and **authored a real workflow**: `Primary Keyword Decision for a Page`
  (`e07fbf06-1cf6-4d62-a3a4-e1a6111a110b`, 24 nodes / 37 edges), stamping its own provenance
  (`metadata.origin = "conductor"` + `built_from_rulebook` + `rulebook_version`). It contains
  real steps (page scrape · site crawl · live Google → read every top result · a branch on
  whether Search Console is connected · the GSC sync · the taxonomy and FAQ judgment steps)
  and **five real `plan.step` Plans** — competitor authority, People Also Ask, local results,
  the GSC keyword footprint, and the long-tail restart — each with a `workflow.plan` row
  (`origin='agent'`) whose output contract it set through the `workflow_plan` tool, a blank
  stand-in, and `allow_stand_in_in_production=false`. It also declined scope deliberately
  (three content-production rules belong to a downstream system) and stated its own limit
  plainly: _"They don't yet appear as separately editable cards… I'm not going to dress that
  up as more than it is."_ Two real PLATFORM defects surfaced on the way and are filed: the
  Google search step's output schema drops the People-Also-Ask box (which a `critical` rule
  calls a mandatory source), and the Search Console step returns a load receipt rather than
  the keyword rows — which is precisely why two of the five Plans exist.

  **The older TEMPLATE Build is not deleted and is not the primary action.** `build/` +
  aidream `services/masterworks/build.py` fill one of two fixed shapes with no questions
  asked; since 2026-08-21 this is the header's **Quick build** button (it left the **More**
  menu, which no longer exists on this page), named for
  what they are, until the Conductor supersedes them outright.

- 🚨 **THE RULEBOOK PAGE HAS FOUR THINGS ON IT — the page IA is now LAW (2026-08-18).**
  Five lanes had each added their own card/button to `/masterwork/[id]` and nobody ever
  looked at the whole page. Arman: _"every time we add a new piece of UI, some bullshit is
  added, but no one is paying attention to what the fuck is happening… we add things in one
  place, remove them from another, and look at it."_ and _"all of the things I'm putting in
  to get a result should be together, not put all across the fucking code."_ The render
  order is now, top to bottom, and **a new top-level section needs Arman**:

  | # | Section | Owns | Never holds |
  | --- | --- | --- | --- |
  | 1 | **Header card** (`RulebookDetailPage`) | Identity (name, description, citation, version + status badges); the MAKE class top-right — share (icon only) · **Quick build** (template) · **Build it with me** (the Conductor); the KPI tiles + progress bar + **ONE** line; the CHECK & FINISH class under the KPIs — **What you've built** · **Check for what's missing** · **Mark as ready**; and the review actions when drafts are waiting | Any way to feed the Rulebook; any second sentence under the bar; a `More` menu (2026-08-21: actions are classed by WHEN THEY HAPPEN and every one carries a tooltip naming its agent — see `common-docs/systems/masterwork/USABILITY-VERDICT-2026-08-21.md`) |
  | 2 | **Sources** (`RulebookInputsSection`) | EVERY input: interviews (list), attached documents/files/links/workspace things, **Your words** (the record — its ONE entry point on this page), **Add ▾** (a document · published work · AI chats), **New interview**, and **Turn this into rules** | — |
  | 3 | **Understudy** (`UnderstudyCard`) | The system that already runs, and trying it | — |
  | 4 | **Rules** | Search · **Add rule** · the grouped rule list (+ per-group "Add here") | Any source/import/interview button |

  Below the rules, ambient only: the page `AssistStrip`. **Rules of this IA:** one entry
  point per capability (a second "Your words" or "Interview me" anywhere on this page is a
  defect); every control carries a tooltip; a dropdown row is an icon plus **one to three
  words**, every row the same shape (Arman, same session: _"look at how horrible and ugly
  the text and icon combination is that you're putting in the dropdown"_) — explanations go
  on the destination, never as paragraph subtext inside a menu item; and the header implies
  no order it cannot keep. `ConversationsSection` renders NO chrome of its own (it is a
  list, not a card — _"It's a session. The title is enough, and it needs to render a LIST."_)
  and `RulebookSourcesPanel` gains `variant="bare"` for exactly this host (the standalone
  `/masterwork/[id]/sources` route keeps `variant="card"`). **Status is a LABEL, not a
  gate:** nothing reads `active` except the badge and the browse list, and Build works in
  either state — the "Mark as ready" copy says so instead of implying the Rulebook is
  switched off.

- **THE UNDERSTUDY — the system that runs from minute one (2026-08-17, vision doc 13;
  vocabulary ruled).** Every Rulebook has ONE Understudy: a crude one-agent Masterwork
  (mandate `masterwork.understudy`, Gemini 3.7 Flash on the DB agent row) that does the
  WHOLE job from the moment the Rulebook exists — zero rules included — and is rebuilt
  FREE and in place on every rules save, so the Expert watches it get better instead of
  filling a form and waiting for value. FE half: `understudy/refresh.ts` (fire-and-forget
  pokes wired into `saveRules` and `createDraftRulebook` — ONE funnel covers the editor,
  wizard, approve-all, and checkup apply; the Scout's server-side writes poke aidream's
  own funnel) + `understudy/UnderstudyCard.tsx` on `/masterwork/[id]` ("Your system is
  already running — try it", live pulse, reuses `TryMasterworkBox` verbatim, self-heals a
  pre-Understudy Rulebook with one free refresh) + a `live` hook on `RulebookKpiStrip`.
  The Understudy row carries `metadata.understudy=true`: it is filtered OUT of the built
  Masterworks list (`MasterworksPage`) and is never releasable to Encore. Server half:
  aidream `aidream/services/masterworks/FEATURE.md` § The Understudy.
- **Live:** `/masterwork` (the module landing — guests get the marketing page,
  signed-in Experts get the Masterwork HOME; see § The landing below),
  `/masterwork/all` (Masterwork Studio — entity-list shell over platform.rulebook),
  `/masterwork/[id]` (rule editor + Conversations section + "Build a Masterwork"
  dialog + "From a source" ingest dialog + "Interview me" dynamic side panel),
  `/masterwork/[id]/interview` (the Scout interview as a full page — see § The
  Record), `/masterwork/[id]/sources` (the dump lane — the same
  `RulebookSourcesPanel` the detail page renders inline),
  `/masterwork/[id]/body-of-work` (the body_of_work lane — `BodyOfWorkDialog`
  `variant="page"`), `/masterwork/[id]/import` (the chat-import lane —
  `ChatImportDialog` `variant="page"`), `/masterwork/[id]/record` ("Your
  words"), `/masterwork/[id]/masterworks`
  (built Masterworks + version-drift flags), `/masterwork/admin` (feature map),
  `/masterwork/encore` + `/masterwork/encore/[id]` (the Operator surface — see the
  Encore bullet below). **Every creation/working mode gets a real URL under
  `/masterwork/[id]/` (Arman's ruling, 2026-08-17) — satisfied.** Each lane has
  ONE shared component rendered by both its route and its detail-page
  dialog/panel entry (`RulebookLaneRoute` is the shared page scaffold), and
  the deep-linkable query params (`?dump=1`, `?body_of_work=1`, `?chatImport=1`,
  `?interview=1`) keep working as openers on the detail page.
- **The guided start (2026-08-15; rebuilt as a full page 2026-08-17):** "New Rulebook" is
  `/masterwork/new` (`features/masterwork/intake/NewRulebookFlow.tsx`) — the four-question intake
  from the Distillation vision (goal · who runs it · where the knowledge lives · stakes ·
  benchmark → stored on `metadata.intake`) rendered in the house guided-intake pattern (big
  default-filled option tiles, § Guided intake below), then the registry-driven Approach picker;
  the chosen row's `intake_query` routes into that Approach's surface (interview →
  `/masterwork/[id]?interview=1`, Scout auto-opens).
- **THE RECORD — "Your words" (2026-08-17).** `/masterwork/[id]/record` shows everything the Expert
  has contributed to one Rulebook — every interview turn, every uploaded source, every recording —
  oldest first, with a door on every item and copy-everything (`CopyButtons`: human / for-AI / JSON).
  The Rulebook page opens that same `ExpertRecordPage` in a large, non-blocking
  `masterworkYourWordsWindow`; the adjacent up-right-arrow is the explicit new-tab door to the
  full route, so reading the Record never silently discards the Rulebook workspace. Files: `record/service.ts`,
  `record/ExpertRecordPage.tsx`, `record/InterviewChooser.tsx`, `record/copy.ts`. See § The Record
  below for the association and the corpus contract.
- **The Scout interview Approach:** `ScoutInterviewPanel` (AskTutor pattern — useAgentLauncher +
  AgentConversationColumn in the canonical `MatrxDynamicPanelHost`) talks to the **Scout** agent
  (`4a0b2f8e-18d0-4ade-8b88-7f5610f1d0c8`, Sonnet 5, variable `rulebook_id`), which holds the
  server-side `rulebook` tool and lands draft rules on the Rulebook AS the Expert talks; the
  panel watches the Rulebook row's `version` while open and refreshes the page beside it.
- **The file Approach (2026-08-16):** "From a source" offers _Paste the text_ or _Upload a file_.
  An upload goes through the canonical file handler (`useFileUpload` — never a hand-rolled
  upload) and then `POST /masterworks/ingest-file`: a document is read page by page
  (content_processing + a page-extraction job running the distiller Mandates), so each rule
  comes back anchored to real pages; a recording is transcribed first and takes the text lane.
  `RuleProvenance` renders those anchors as DOORS — the page numbers, a link to the source file,
  and a link to the extraction that read it — and flags a quote that failed verbatim
  verification.
- **Encore (2026-08-17) — the Operator door.** `/masterwork/encore` (released Masterworks the
  viewer can reach, shelved mine / my-orgs / public) and `/masterwork/encore/[id]` (the run
  experience; moved from the short-lived `/encore` namespace 2026-08-17, pre-launch, no
  redirects). A Masterwork
  is **draft** until the Expert presses **Release** on the Studio's Masterworks page
  (`metadata.released_at` stamp on workflow.definition, guarded CAS on `version` via
  `setMasterworkReleased`); **only released Masterworks appear on Encore**, and the Encore run
  page refuses a draft (doors the Rulebook owner to the Studio instead). Operator copy is
  jargon-free (THE MISMATCH RULE): "Run", "What it does", "By <expert>" — never "workflow" /
  "compile" / version numbers. Doors both ways: card/name → `/encore/{id}`; "By <expert>" →
  `/masterwork/{rulebookId}` (rendered only when the viewer can read the Rulebook); Rulebook
  owner gets a quiet "Open in Studio"; Studio gets "View in Encore" once released; every run
  row opens in the workflows app. Run machinery is the canonical `TryMasterworkBox` (typed run
  start + adoptForeignStream + followWorkflowRunStream + refresh rejoin) — never a second
  renderer. Files: `encore/service.ts` (VIEW-LAW scoped reads + per-Operator run history),
  `encore/EncoreHomePage.tsx`, `encore/EncoreRunPage.tsx`; nav child "Encore" under
  Masterwork Studio. Deliberately deferred: a "shared with me" shelf (no generic
  shared-with-me list filter exists yet — lib/list-scope Brief 3A; add the shelf when it lands).
- **Server half:** aidream Masterwork services (Build + ingest Approaches + the `rulebook`
  tool, one shared rule builder and one shared CAS write path).
- **Next (work order: common-docs/systems/masterwork/HANDOFF.md):** the Arman-SEO honest test
  (Rulebook `arman-seo-method` scaffolded, draft, owned by Arman — the interview Approach
  unblocks it).

## The review-verb matrix (Arman's rulings, 2026-08-17 — settled)

> 🚨 **SAVING AN EDIT IS NOT APPROVING.** Arman, live-testing: _"save rule is
> actually approving even though it shouldn't approve. You're updating the
> data, not approving it."_ An earlier session wrote the OPPOSITE doctrine
> into `saveRule` ("correcting and saving IS approval") — that comment and
> behavior are WRONG and are replaced by this matrix. **Approve is ONLY the
> Approve button.** The core verbs are **Approve / Reject / Improve**.

What each action does to a rule's review state (`draft` / `rejected` /
`feedback`; the ONE merge for edit-save is `applyManualRuleEdit` in
`types.ts`):

| Action | `draft` | `rejected` | `feedback` |
|---|---|---|---|
| **Approve** (button — row, wizard, Improve review) | cleared | cleared | cleared |
| **Reject** (with written reason) | `true` | `true` | set to the reason |
| **Request changes** | unchanged | unchanged | set to the note |
| **Improve** (rewrite lands) | **`true` — always a draft, never auto-approved** | cleared (the feedback was consumed by the rewrite) | cleared |
| **Edit + Save, content changed** | **preserved** (a draft stays a draft, approved stays approved) | cleared — the Expert's own hand supersedes the note they wrote for the Scout; the rule returns to THEIR draft queue | cleared |
| **Edit + Save, nothing changed** | preserved | preserved | preserved |
| **Reconsider** (rejected → my queue) | `true` | cleared | cleared |
| **Retire / Restore** | preserved | preserved | preserved |
| **Manual Add** (window, Manually tab) | absent — the Expert typing it IS the human-first act | — | — |
| **Add With AI / Improve rewrite** | `true` — every AI-authored rule awaits the explicit Approve | — | — |

**The Improve verb** (`agent-context/ruleImprove.ts` +
`components/detail/ImproveRuleDialog.tsx`): the Expert speaks feedback
(ProTextarea), Mandate **`masterwork.rule_improver`** rewrites that ONE rule
with the full Rulebook as context (structured output `{name, statement,
rationale, detection, severity, section}`), and the rewrite lands through the
canonical `upsertRuleWithRetry` → `saveRules` CAS as a **draft revision
keeping its id** — `quote`/`source_ref` are mechanically untouchable, section
is validated against the Rulebook's own codes. The dialog stays mounted at
page level so the wizard's "request changes and keep going" flow works:
submit, press **Keep reviewing**, and the rewrite returns to the queue when
the agent responds (`requeue` prop on `RuleReviewWizard`). The same Mandate
covers all three shapes of the job, selected by which variable is empty:
`rule` empty = draft a brand-new rule from a plain-language description
(the Add-rule window's default tab); `expert_input` empty = TIDY, the
editor's "Clean up with AI" (`applyRuleTidy` freezes quote/severity/section —
see Invariant 6). The editor offers the feedback path from within edit
("Have the AI apply my notes instead"). It is THE ONE rule-rewrite Mandate —
the duplicate `masterwork.rule_cleanup` was retired into it 2026-08-17.

### 🚨 THE FOUR VERBS ARE ONE PRIMITIVE — `features/masterwork/review/`

Arman, 2026-08-18: *"whenever a change is made or an enhancement is made, that enhancement or
change needs to be made **every single place that that code or logic exists**."* He found the
Final Checkup missing the Improve/Edit verbs the rule-review loop already had. The fix is
structural, not a sweep:

- **`review/RuleDecisionActions.tsx`** — the ONE verb row (Approve · Improve · Reject · Edit, in
  that order, with those icons). **All four handlers are REQUIRED props**, so a new surface
  physically cannot render a partial verb set. Labels are overridable per surface (the Add-rule
  panel says "Add as a draft" / "Start over" / "Edit before adding"); the VERBS are not.
- **`review/useRuleImproveRun.ts`** — the ONE runner of the `masterwork.rule_improver` Mandate.
  It owns the Mandate key, the variable names, `expect: "json"`, the timeout, the context anchor
  and the section validation; callers pass only their context and an `apply` that merges the
  validated result onto whatever they hold. The three shapes are still selected by which input is
  empty (improve / draft-new / tidy). **Never construct a second improve run.**

Consumers: the rule rows on `RulebookDetailPage`, `RuleReviewWizard`, `ImproveRuleDialog`'s own
before/after (its Improve verb keeps pushing on the *rewrite*), `AddRulePanel`'s "With AI" tab
(Improve reveals a feedback box and re-runs the same Mandate on the unsaved draft),
`RuleEditorDialog`'s "Clean up with AI", and the Final Checkup. A surface that genuinely cannot
offer one of the four must say why in a code comment beside the component.

🚨 **A structured-output Mandate must never be offered the page's write tool.** The Improve run
from the Add-rule window paused forever because the Rulebook page's `rule_draft` write target put
`apply_surface_write` in the injection, and the improver called it instead of returning JSON
(conversation `14786e08-…`, 2026-08-18). Fixed on the agent: `Masterwork Rule Improver`
(`c09465cb-…`) now carries `tool_config.auto_tools_disabled = true`. Any new structured-output
Mandate launched from a page with write targets needs the same flag.

**"Add rule" is a WindowPanel, never a blocking modal** (Arman: the
project-new window panel is "how everything in our system should run"):
overlay `masterworkAddRuleWindow` → `features/window-panels/windows/
masterwork/AddRuleWindow.tsx` (chrome) → `components/add-rule/AddRulePanel.tsx`
(body): **With AI** (default — describe in your own words, mic-first) +
**Manually** (the canonical `RuleFields` form, shared with the editor — never
re-declare the fields). Opened only through `useOpenAddRuleWindow()`; every
human entry point on the Rulebook page routes there. `RuleEditorDialog`'s
"new" mode survives ONLY for the `rule_draft` surface write target
(agent-staged drafts); no human path opens it for adds.

🚨 **The BUILD is a WindowPanel too — and it is the one that mattered most.**
Arman, 2026-08-18, on finding the Build still in a `sm:max-w-lg` dialog a day
after the Add-rule conversion: *"the beautiful, incredible, highly dynamic …
world-changing user interface I envision for the day I build this incredible
system — you're telling me all of it's gonna render inside of that shitty
little fucking model that blocks the page."* Overlay `masterworkBuildWindow` →
`features/masterwork/build/BuildWindow.tsx`, opened only through
`useOpenBuildWindow()`; `BuildMasterworkDialog` is **deleted**. Three rules it
encodes:

- **The page stays usable.** `78dvh` tall, not a fixed pixel wall: the Rulebook
  is visible and editable behind the Build while the Build runs, and the panel
  never overflows on first paint on a laptop. Minimise it and the Build carries
  on in the tray.
- **Progress renders through the canonical NON-TOKEN renderer.**
  `POST /masterworks/build` emits no tokens at all — every emit in aidream's
  `services/masterworks/build.py` is a typed data event (`rulebook_loaded`,
  `agent_created`, `workflow_validated`, then the terminal complete). THE
  FLOATING LAW's answer for that is `LiveRunProgress`: stable rows updating in
  place, event narration banned. `features/masterwork/build/useBuildRun.ts`
  translates the typed steps into `LiveRunProgressState` and nothing else —
  no text parsed, no chunks bucketed, no kinds routed. `MarkdownStream` would
  be the wrong half of the law here and would render an empty box. The old
  dialog appended each `message` as a fresh `<p>` in a `max-h-48` scroller,
  which is exactly the banned narration.
- **The finished Masterwork gets doors and a run box, not a success line.**
  Open it in the studio · All Masterworks from this Rulebook · See what it was
  built from — and the canonical `TryMasterworkBox` right inside the panel, so
  the Expert runs the thing they just built without leaving the moment.
- **The deliverable description follows the API contract.** `BuildWindow`
  exposes the server's 500-character boundary with a live count and prevents
  an oversized request from reaching `POST /masterworks/build`.

The Build is a durable run (`platform.masterwork_run`, surface `build`), so
opening the window after a reload restores the finished Masterwork off the
durable row, and an HMR/route remount mid-Build rejoins the live run — both
verified live on Strunk (`e492a07f-…`) 2026-08-18.

**Button icons rely on the Button's own `gap-2` — never add `mr-*` to a
button icon** (icon + gap + margin was the "giant gap" defect Arman flagged
on Approve/Reject).

## The landing — `/masterwork` (2026-08-17)

One URL, two audiences (module-landing-pages doctrine, branch-in-page):

- **Guests** get the public marketing landing — `MasterworkLanding`
  (`features/auth/components/module-landing/landings/MasterworkLanding.tsx`, the
  shared `ModuleLanding` shell inside `MarketingPageShell`), registered in
  `MODULE_LANDING_DIRECTORY` so it appears on `/features`. The spine, in Expert
  language: you talk → rules you approve → a system that works exactly your way →
  proof against plain AI. Never a login wall.
- **Signed-in Experts** get the Masterwork HOME (`features/masterwork/home/`):
  your Rulebooks with review-progress KPIs (`computeKpis`), your built Masterworks
  with release state + quality trend (latest vs. previous
  `platform.masterwork_run.quality_score`), recent runs in Expert words, the
  Approach registry as "Start here" tiles (each links to `/masterwork/new?approach=<key>`,
  pre-selecting that Approach), and
  the "How it's improving" panel. Every named entity is a door; every count links
  to the list behind it. The Rulebook LIST lives at `/masterwork/all`
  (the established `/x/all` pattern).

**"How it's improving" — the HONESTY CONTRACT.** The five Masterwork agents
(mandates `masterwork.scout` / `source_distiller` / `exemplar_distiller` /
`rulebook_auditor` / `audition_judge`) are enrolled in Hindsight, but `hindsight.*`
is NOT browser-readable (the schema is not PostgREST-exposed, and RLS scopes rows
to the platform operators' own accounts). The panel therefore renders ONLY what a
signed-in user can truly read: the public mandate registry (`fetchMandatePins`)
plus each bound agent's `agent.definition` revision count + last-changed date. It
NEVER fabricates review activity. Closing the gap (review summaries/findings for
Experts) needs a deliberate server-side read path — tracked in
`common-docs/systems/masterwork/HANDOFF.md`.

## Data

- **Runs — `platform.masterwork_run` (2026-08-17; renamed from `expertise_run`).** Every long
  pipeline (build · ingest · ingest-file · audition) claims a row here BEFORE its first AI call,
  heartbeats every 60s, and persists its terminal status + error + result. It is a **COMPONENT
  of its Rulebook** — access IS the Rulebook's access, so `created_by` is an audit stamp and
  appears in no policy (THE COMPONENT OWNERSHIP LAW), and `is_versioned` is false so a heartbeat
  never writes a history row. The browser stores only the run id and rejoins by it; **never**
  re-derive a run's state client-side. Server: aidream durable-run services ·
  `POST /masterworks/runs/{run_id}/rejoin`.
- **Table:** `platform.rulebook` (Matrx Main; renamed from `expertise_pack`, JSONB column
  `rules` renamed from `principles`). JSONB columns get their app shapes in ONE place:
  [`types.ts`](./types.ts) (`RulebookRule`, `RulebookSections`, `RulebookSource`). Never
  re-declare beside a consumer.
- **Rules (`rules` JSONB array):** `{id, name, section, statement, rationale?, quote?, detection?,
severity, retired?, draft?, source_ref?}`. `id` is the citable handle — audits cite it; never rewrite
  an existing rule's id. `retired` keeps history; `draft` marks agent-suggested rules awaiting the
  Expert's line-by-line approval (human-first invariant — ingestion NEVER auto-activates).
- **Versioning:** every save through `saveRules` bumps `version` with an optimistic lock on the
  loaded version (concurrent edit → readable conflict error, no silent overwrite).
- **Masterworks:** `workflow.definition` rows whose `metadata` carries `built_from_rulebook` +
  `rulebook_version` + `masterwork_kind` (the Build stamp) + `released_at` (the Expert's
  release stamp; absent = draft, Studio-only — an Operator can never run a draft). Drift = `rulebook_version <
rulebook.version` → the Masterworks page flags "rebuild" AND opens the rule-level diff (below)
  — a drift badge without it states a timestamp, not a verdict.
- **Version history — NO Rulebook-specific table.** `platform.rulebook` was enrolled in the
  platform-wide version capture on 2026-08-16 (`platform._version_capture` → `history.row_versions`,
  the same store 138 tables already use). The browser cannot read the `history` schema, so two
  SECURITY DEFINER RPCs expose ONE Rulebook's history — `rulebook_versions` / `rulebook_snapshot`
  (args `p_rulebook_id`) — behind a gate that mirrors the table's own `std_select` RLS predicate
  exactly.
- **The diff is a pure module:** [`rulebookDiff.ts`](./rulebookDiff.ts). It counts only the
  ENFORCED set (the aidream Build drops `draft` and `retired` rules), so an unapproved draft is
  never reported as drift — it is listed separately as "waiting on you". A version older than
  capture has NO snapshot: the dialog says so and never invents a diff.

## Files

- `service.ts` — detail reads/writes (getRulebook, saveRules, createDraftRulebook,
  updateRulebookMeta, softDeleteRulebook, listMasterworksForRulebook). Direct supabase-js,
  RLS live, THE VIEW LAW respected.
- `browse/` — entity-list shell wiring: `service.ts` (mine/orgs/public scoped reads, plain
  PostgREST — no per-feature RPC yet at this population), `columns.tsx`, `listConfig.tsx`,
  `useRulebookRowActions.tsx`, `components/MasterworkStudioPage.tsx`, plus the Approach registry
  read `approaches.ts`.
- `intake/NewRulebookFlow.tsx` — the guided start at `/masterwork/new` (§ Guided intake below).
  The old `NewRulebookDialog` was DELETED 2026-08-17 — a cramped dialog with chip-bubble pickers
  is exactly what the house pattern forbids.
- `durable-run/useMasterworkRun.ts` — the ONE way a dialog here runs something long. A face over
  `lib/durable-run/useDurableRun.ts` (shared with SEO): remembers the run id, rejoins on load,
  settles from server truth, keeps a finished answer across a refresh. Both ingest lanes share one
  run (one dialog, one answer, one pointer). Never fork it — add a `DurableRunWire` instead.
- `components/detail/RulebookDetailPage.tsx` + `RuleEditorDialog.tsx` — the Expert surface. Plain
  language only: "rules", "how to spot a violation", "how bad is breaking it". Zero jargon is a
  requirement, not a style choice (THE MISMATCH RULE). Rule textareas open at six rows. **Clean
  up with AI** runs Mandate `masterwork.rule_improver` in its TIDY shape (empty `expert_input`;
  `masterwork.rule_cleanup` was retired into it 2026-08-18 — both DB rows are soft-deleted, never
  re-bind them) through the ONE runner `review/useRuleImproveRun.ts`, streams through
  `LiveRunDisplay`, and stages the validated result for review; only Save writes. The source quote, severity, and section are mechanically
  protected from AI changes. The generic `wizardDraftSlice` preserves a paid cleanup until Save,
  explicit Cancel, or Undo.
- `build/BuildWindow.tsx` — "Build a Masterwork" as a WindowPanel (streams
  `POST /masterworks/build` as a durable run; progress through
  `LiveRunProgress`; result carries doors + `TryMasterworkBox`). Openers:
  `features/overlays/openers/masterworkBuildWindow.tsx`; run + progress
  translation: `build/useBuildRun.ts`; page callbacks: `build/callbacks.ts`.
- `components/detail/IngestSourceDialog.tsx` — "From a source" (paste →
  `POST /masterworks/ingest`; upload → `POST /masterworks/ingest-file`).
- `components/detail/ScoutInterviewPanel.tsx` — the Scout interview Approach (side sheet).
- `components/masterworks/MasterworksPage.tsx` — Masterworks list, run links into
  workflows.aimatrx.com, recent-run history, and the owner-only Audition + feedback doors.
- `components/masterworks/TryMasterworkBox.tsx` — "Try your Masterwork" in place: starts the run
  (adoptForeignStream + followWorkflowRunStream), narrates real node stages, renders the verdict
  through RichDocument. **A refresh rejoins the run** — the run id is kept per Masterwork in
  sessionStorage (`matrx.masterwork.run.<masterworkId>`), and on mount the run row decides:
  still going → `attachWorkflowRun` (the execution system's rejoin primitive; the SSE feed
  replays the node lifecycle so the stage list rebuilds), finished → the verdict shows directly.
  Its live-event choreography consumes the execution system's canonical `TERMINAL_RUN_EVENTS`
  set; it must never maintain a narrower local list that misses `run_errored` and waits for the
  row-poll recovery backstop.
- `components/masterworks/AuditionDialog.tsx` — "Compare to the original" (the Audition). Opens
  prefilled with a finished run's own output when launched from the verdict, empty from the card.
  Streams `POST /masterworks/audition`; verdict event `masterwork_audition_verdict`.
- `components/masterworks/MasterworkDriftDialog.tsx` — the rule-level drift answer over
  `public.rulebook_snapshot` + `rulebookDiff.ts`.

## The Record — the Expert's own words (2026-08-17)

> Arman, after dictating ~37,455 characters of his SEO method into ONE interview and finding no way
> back to it: _"There should be a record of it… so I could choose to pick up the one I was having or
> have a new one. Clearly we're not properly associating these things together. That's critical."_
> and _"All of the things that I have said… need to be readily available somewhere in the UI."_

**The relationship — a canonical association, never a column.** A Scout interview is an edge in
`platform.associations`: `conversation --(role 'interview')--> rulebook`, registered in
`platform.association_types` (`container_side='none'` — the pair conveys nothing; whether a Rulebook
should convey access to its interviews is a separate human decision at `/administration/relationships`).
Direction follows the canonical rule — little points to big; many conversations make a Rulebook.
Written ONLY through `associationsService`. **There is no `rulebook_id` on `chat.conversation` and
no junction table, and adding one is the defect this replaced.**

**When the edge is written.** NOT at mint time: `assoc_add` requires real access to both endpoints,
and the server writes `chat.conversation` atomically at stream end, so an early write fails 42501
(verified live). A client-minted id the Expert never sends into is an untouched draft, not a failed
conversation. The first execution-system request starts `associateInterviewWhenPersisted()` as a
MODULE-LEVEL job — deliberately not tied to the panel's React lifetime, because the Expert closing
the sheet mid-turn is exactly the case where losing the link hurts most. It waits on the canonical
`waitForConversationPersisted`, writes the edge, then replaces the auto-generated title
("Auto: expertise_interviewer") with `"<Rulebook name> — interview, <date>"`.

**Loud recovery.** `listRulebookInterviews` cross-checks the edges against rule provenance
(`source_ref.conversation_id`). A conversation named by a rule but missing its edge is HEALED on
read and screamed about — a recovery firing means the proactive write failed. Historical links were
backfilled once from rule provenance **and** `chat.tool_trace.args->>'rulebook_id'` (the only way
Arman's own interview could be found before this existed).

**Conversations are FIRST-CLASS on the Rulebook page (2026-08-17, round 2).** Arman, testing live:
_"we are not tracking the conversations for a particular masterwork being produced. I can't see it.
So if it's in the UI, it's hidden… I want to be able to see all of those conversations, click one,
pick up right where I left off, and be able to then create a new one."_ The machinery above was all
built — but the ONLY place it surfaced was inside the "Interview me" sheet, so he never saw it (the
data half was verified intact for his account: edge, RPC read, and conversation row all correct —
this was pure discoverability). Two fixes, both consuming `listRulebookInterviews` (never a second
query path):

- **`ConversationsSection`** (`record/ConversationsSection.tsx`) renders on `/masterwork/[id]`
  — since 2026-08-18 as a chrome-free LIST inside the one **Sources** section (see § Status,
  the page IA): one row per interview (title, when, one tiny meta line) with **Continue**
  (resumes in the panel via the shared content), a new-tab door to `/chat/{id}`, a full-screen
  door to the interview route, an honest hidden-count line, and a one-line empty state. The
  section header above it owns **New interview** and **Your words**; this component renders no
  card, no header, and no buttons of its own.
- **`/masterwork/[id]/interview`** — the interview as a REAL URL. `ScoutInterviewContent`
  (exported from `ScoutInterviewPanel.tsx`) is THE ONE implementation: the sheet and the route
  render exactly it, chooser included. Deep links: `?conversation=<id>` resumes that conversation,
  `?new=1` starts fresh. The sheet header carries a "Full page" door to the route. Interview
  formatting helpers (`relativeWhen`, `wordCount`) live once in `record/format.ts`.

**Resume or start new.** Opening "Interview me" on a Rulebook that already has interviews shows
`InterviewChooser` — when it happened, how many turns, how much was said, how many rules it
produced, the first line the Expert wrote — with **Continue** on each and **Start a new interview**
beside them, plus a new-tab door to the full conversation. Continuing rehydrates the real
conversation through `useConversationResume`. **Never silently mint a new conversation when prior
ones exist.** A fresh interview uses `preferFresh` + a bumped `freshSessionKey` so "start new" can
never revive the surface's last conversation.

**THE CORPUS CONTRACT — `getExpertCorpus(rulebookId)`** (`record/service.ts`) is the ONE way any
consumer here gets everything the Expert ever contributed to a Rulebook. 🚨 **It assembles
nothing.** It calls `GET /masterworks/{rulebook_id}/corpus`, which runs aidream
`services/masterwork_corpus/corpus.py::load_expert_corpus` — **the exact function the Final
Checkup judges rules against**. Contract, the nine lanes, the limits and the access model:
[`aidream/aidream/services/masterwork_corpus/FEATURE.md`](/Users/armanisadeghi/code/aidream/aidream/services/masterwork_corpus/FEATURE.md).

Why: the 2026-08-19 integration audit found **two** assemblies of this corpus — this file and the
Checkup's — that disagreed on **four of the nine Distillation Approaches** (`body_of_work`, `dump`,
`chat_import`, `matrx_conversations` were invisible to one side or the other). The page and the
audit were reading different records of the same Expert. **A second assembly, in any repo, is a
defect.**

Why the SERVER and not here: assembling it is **work**, not a DB read — it captures pages through
the scraper, reads processed-document pages, and re-parses an uploaded chat export. "Clients go
direct to Supabase" governs CRUD; none of this is CRUD.

It returns `{ rulebookId, interviews, contributions, totalChars, laneCounts, limits,
hiddenInterviewCount, canReadMaterial }`. Each contribution is `{ id, kind, lane, laneLabel, title?,
text, when, truncated?, cleaned?, conversationId?, messageId?, fileId?, url?, entityToken?,
entityId?, corpusItemId?, dictations? }`, ordered oldest first. `kind` is the server's segment kind
(`message` · `chat_turn` · `web_page` · `document` · `recording`, or a dump row's entity token) and
is **open-ended on purpose** — display uses `laneLabel`, never a hand-rolled union. Assistant turns
are excluded at the source: this is the Expert's record, not a chat log.

🚨 **RENDER `limits`.** `ExpertCorpusLimit[]` is what the corpus could NOT read — above all
`lane: "source"`, text the Expert PASTED straight into the distiller, which was never stored and is
gone for good (122 such rules on Strunk). Hiding it makes a partial record look complete, which is
precisely the failure the audit found. The Record shows every one under "What isn't in here", and
`corpusHuman` carries them into every copy payload.

`canReadMaterial: false` means the viewer may see the Rulebook but not the raw material — a
Rulebook shared for viewing shares its **RULES**, never the unedited hours of dictation. Say so;
never render an empty page.

**The interview LIST is a different question** and keeps its own client-direct read:
`listRulebookInterviewsWithAccess` (`ConversationsSection`, `InterviewChooser`) answers "which
conversation do I resume", not "what did the Expert say". It is not a corpus assembly.

**Audio — the Expert's actual voice, in the Record (2026-08-17).** Arman: _"If any of it was
audio — because I transcribed it using the smart agent input — we should even have the audio…
The bottom line is we need that full tracking."_ Dictation was always PERSISTED (the shared
recorder uploads the recording through the canonical file handler and writes a
`transcripts.transcripts` row with `audio_file_path`); what was missing was ATTRIBUTION — the row
knew nothing about the conversation or Rulebook it was dictated into, so it landed nameless in the
general Recordings folder.

- **The stamp is generic, not Masterwork's.** `RecordingOrigin`
  (`features/audio/recordingOrigin.ts`) — `{surface, conversationId?, entityToken?, entityId?,
label?, href?}` — persisted at `transcripts.transcripts.metadata.origin` (an existing jsonb
  column; **no schema change was needed**). A surface declares it ONCE by wrapping its subtree in
  `RecordingOriginProvider`; `useVoiceCapture` reads it from context, so **nothing was threaded
  through the shared mic chain** and every ProTextarea that declares no origin writes exactly the
  row it always wrote. `ScoutInterviewPanel`'s interview column declares
  `{surface:"masterwork.interview", entityToken:"rulebook", entityId, conversationId, label}`.
- **In the Record.** The audio is the ONE thing the client adds to the server's corpus, and it is
  an **enrichment, never a tenth lane** — it puts a player on text the server already supplied.
  `ExpertContribution.dictations[]`, each `{transcriptId, fileId, title, when, durationSec,
charOffset}`, rendered via `InlineMediaRef` (`as="audio"` and an explicit container height — a
  bare file id has no mime to infer and `size="fill"` is `h-full`) with an `EntityRef` door to the
  recording. **The match is evidence, not inference:** a dictation attaches to a message only when
  the transcript's first 120 characters appear VERBATIM in it, and `charOffset` is where. A
  dictation that matches nothing becomes its own `recording` contribution rather than being
  guessed onto the nearest message — a wrong attribution is worse than none, and it is the one
  contribution the server assembly cannot see because no text row exists for it.
- **The door back.** `RecordingOriginRef` (`features/transcripts/components/`) renders the origin
  on the transcript itself — "You dictated this into &lt;Rulebook&gt; · the conversation".
- **Arman's own interview is backfilled.** All 7 recordings behind conversation `4706f9c0…`,
  matched by verbatim substring at contiguous offsets (0 → 11080 in one message; 0, 5415, 7998,
  14742, 15519 in the 20,007-character one), stamped with the same origin plus
  `metadata.origin_backfill_evidence`. Two other recordings he made the same day matched nothing
  and were correctly left alone.
- **Still open, honestly:** a dictation made before this stamp existed cannot be attributed
  without guessing, so older recordings stay unattached. And the microphone cannot be driven in a
  headless browser, so the write path is proved by
  `features/audio/__tests__/recordingOrigin.test.tsx` (origin → `provider.start()`; origin → the
  persisted row) rather than by a live recording.

## The Final Checkup — `checkup/` (rebuilt 2026-08-18)

**The finish line.** Arman: _"the expert kinda feels like here she is done, and we
could have a button that they click that's kind of like — maybe call it a final
checkup… it's probably a window panel… the point is to have it where we can
suggest rules that need to be added, rules that could be modified, rules that
should be removed, and the user is just going through very quickly and sort of
approving or disapproving."_

🚨 **It shipped 2026-08-17 breaking four of our own laws, and Arman found all
four on his first run. What follows is the rebuilt surface; the five fixes are
named in `CheckupWindow.tsx`'s header so nobody re-introduces one.**

- **Opening it RUNS it.** The window auto-starts the checkup on open. There is no
  second "Start the checkup" button — clicking "Final checkup" and then being
  asked to click "Final checkup" is false advertising. The only re-run is a
  subtle **Run again** in the window header, and auto-start stands down the
  instant the durable hook claims a run id, so a rejoin never pays for a second
  run.
- **IT STREAMS, through the ONE pipeline.** _"All of our content streams in real
  fucking time."_ The old surface blocked on `run_mandate` and painted a blank
  panel for ~90 seconds. aidream now scans each producer agent's own token stream
  and releases every finding the moment it is written **and has passed the
  evidence gate** (`aidream/services/masterwork_checkup/streaming_producer.py`);
  each one rides its `masterwork_checkup_finding` event as a canonical
  Content-IR value. `useCheckupRun` adopts the stream
  (`useMasterworkRun` → `useDurableRun` `live.surfaceOwnsDisplay`) and the body is
  `<MarkdownStream requestId />`. **This feature parses, buckets, routes and
  renders NOTHING itself.** A checkup rejoined after a refresh has no stream left
  to adopt, so its findings render through `KindInstanceRender` — the same
  complete-envelope assembler and the same `applyIrKindRoute`, never a second
  renderer. Measured on a real paid run: first finding at 56s of a 115s run.
- **THE ORDER IS THE SPEC.** Arman: _"The order needs to be: You said this → They
  created this → Here is what is missing or wrong → Here is the version
  recommended. Notice how that actually flows."_ That order IS the registered
  kind's shape (`features/content-ir/kinds/masterwork-checkup-finding.ts`) and its
  ONE component (`components/mardown-display/blocks/masterwork-checkup/`). An
  `add` says out loud, at step 2, that **nothing was created for this** — hiding
  the step would be dishonest about what the system did. The panel states in ONE
  line what the Final Checkup is and what it will do.
- **All four verbs, on every finding.** Approve · Improve · Reject · Edit, from
  the ONE `review/RuleDecisionActions` primitive — the same row the rule-review
  queue uses. **Improve** runs the SAME `masterwork.rule_improver` Mandate through
  the SAME `useRuleImproveRun`, and **Edit** uses the SAME `RuleFields` form (with
  `omitFields={["quote"]}`: the source quote is mechanically-verified evidence, and
  a box whose edits are discarded is worse than no box). Both land as the
  Expert's own wording on the disposition, and step 4 then re-titles to **Your
  version** — what a person approves must be what Apply writes.
- **The card acts through the surface, never a callback.** It reads
  `useCurrentSurfaceUiState("masterwork_checkup_decisions")` and writes through
  `runAction("apply_surface_write", { target: "checkup_decision" })`
  (`matrx-user/masterwork-rulebook`, `applyPolicy: "manual"` — deciding which of
  the Expert's own rules to change is the one judgement an agent may never make).
  Absent that UI state — a chat transcript, a share page — the same card renders
  read-only, which is right: the finding is still worth reading.
- **ONE footer row.** _"The footer of this window panel breaks every fucking UI
  rule in the world."_ The footer is progress + the AI pass + Apply, and nothing
  else. The AI-pass notice is a toast; the apply receipt (with its door to the
  Rulebook and **Undo**) is in the BODY, where content belongs.
- **Confidence is honest.** A finding below 55% is badged "We're not sure — check
  this one" and is never touched by the AI pass, which accepts only findings at
  ≥80% that the Expert has not ruled on and that carry no alternatives (a choice
  between wordings is theirs alone).
- **Nothing is written until Apply**, and Apply is ONE compare-and-swap through
  the Rulebook's existing `saveRules` (never a second write path, never a
  per-finding save storm). `add` appends a live rule (the Expert approving HERE is
  the human-first act — it is not queued as another draft), `modify` rewrites the
  target **keeping its id** (audits cite it), `remove` **RETIRES** it. A
  concurrent save surfaces as the Rulebook's own conflict message and the fresh
  Rulebook is pulled so the next Apply works.
- **Memory, so we stop asking.** Approved findings need none (they changed the
  Rulebook). A DISMISSAL is recorded on `metadata.checkup.dismissed`, fingerprinted
  by kind + target rule id + proposed name (finding ids are run-scoped and never
  repeat), with the Expert's optional reason — captured by the Reject dialog,
  because the reason is what teaches the next checkup. This surface is its only
  writer; aidream's checkup service reads it to suppress what the Expert refused.
- **Decisions survive a refresh** — kept per run id in localStorage, restored on
  rejoin, cleared on Apply.
- **Deleted with the rebuild:** the split panes (`CheckupPanes.tsx`), the finding
  sidebar (`CheckupFindingList.tsx`), the filter tabs, the focused-finding cursor
  and its keyboard model. They existed to drive a single-focus split view; the
  findings now render as themselves, each carrying its own verbs, and keeping a
  parallel focus model beside that would be a second answer to "which finding are
  we on". The panel got smaller, not bigger.

## The Approach Registry — `platform.approach` (2026-08-17)

**"Intake is a registry of Approaches, never a hardcoded flow."** The
"how do you want to do this?" step of `/masterwork/new` (`intake/NewRulebookFlow.tsx`) renders the ENABLED
rows of `platform.approach` (canonical system-variant catalog table; family
`'distillation'`; seeded: `interview` · `source` · `exemplar` · `file`) as
Expert-language cards — label, blurb, "You bring", time shape — read directly
via supabase-js in [`browse/approaches.ts`](./browse/approaches.ts). The
knowledge-lives answer marks one card "Suggested for you" (soft hint, never a
route); the chosen row's `intake_query` is appended to `/masterwork/{id}`
(interview carries `{"interview":"1"}` so the Scout opens on arrival), and the
chosen key lands on `metadata.intake.approach` for the Scout to read.

**Every rule says which Approach produced it:** the server lanes stamp
`source_ref.approach = <key>` through the one shared rule builder (aidream
`services/distillation/` — see its FEATURE.md § The Approach Registry);
`RuleProvenance` shows it subtly ("via the … Approach"). Additive — old rules
keep their shape.

**Adding Approach #5 = a ROW** when its `mandate_key` exists and its
`intake_query` points at an existing lane surface — it shows in the picker
with zero code. A genuinely new lane implementation (new surface, new server
pipeline) is what still takes code. Never hardcode an Approach list again.

### The whole catalog, three surfaces, ONE card (2026-08-20)

> Arman, looking at a Rulebook: *"there were about twenty of these that I had
> named. Where are those ones? I wanna see all of them here. I wanna see cards
> for them. And if they're not available yet, then it needs to say coming
> soon."* He was right twice over: the registry rendered only inside the
> CREATION funnel, and six Approaches he personally approved on 2026-08-17 had
> no row at all — so the picker he was looking at showed the nine weakest of
> the fifteen. The catalog with its provenance is
> `common-docs/systems/masterwork/STATE.md` Part II § 3b.

**Two orthogonal flags, and they must never be conflated:**

| field | question it answers |
|---|---|
| `enabled` | May this Approach **START** a new Rulebook? Only `/masterwork/new` and the module home filter on it (`startableApproaches()`). |
| `metadata.availability` | Does this lane **exist in the product at all**? `available` · `partial` · `coming_soon`. |
| `metadata.launch_href` | For a lane that is not a `/masterwork/[id]` query param, the page that IS its door (`/vision-interview/new`, `/chat`). |
| `metadata.catalog_number` | The number Arman approved it under in § 3b. |

`fetchDistillationApproaches()` returns the **whole** catalog — a filtered
query is exactly how six approved Approaches went invisible. Consumers filter.

**ONE card component, three consumers** — [`browse/ApproachCard.tsx`](./browse/ApproachCard.tsx):

1. `intake/NewRulebookFlow.tsx` step 2 — startable cards selectable, every
   other named Approach rendered below as `inert` (clicking away would throw
   the Expert's unsaved answers on the floor).
2. `home/MasterworkHomePage.tsx` "Start here" — startable, as links.
3. **`browse/ApproachPickerDialog.tsx` on `/masterwork/[id]`** — the surface
   that did not exist. Every row: available ones launch their lane, coming-soon
   ones render under "On the way" as named cards that **cannot be clicked**
   (THE DOOR LAW, inverted — no door, no click).

**The hardcoded `Add ▾` three-item menu is DELETED.** It named three of the
nine lanes and hid the rest, standing exactly where the picker belongs.

**Launching in-page:** `RulebookDetailPage.launchApproach` is the ONE map from
a row to a lane, keyed on the same `intake_query` shape the deep links use, so
the picker and a pasted URL can never drift. Two dialogs (`IngestSourceDialog`,
`ChatImportDialog`) read their lane into state at MOUNT, so the page **keys**
them on the requested lane — without that, picking "From examples of your best
work" landed on the instructional default, and `matrx_conversations` silently
opened `chat_import`'s tab.

**`matrx_conversations` was enabled here** — its lane (the `matrx` tab, posting
to `/masterworks/ingest-conversations`) was finished; only the flag was left.

**The assist launch contract** (`assists.ts`) carries `checkup` / `coherence` / `conduct` for
the journey moves (2026-08-19), and gained `open: "approaches"` and
`open: "approach:<key>"`. It supported only `interview | ingest`, so
`masterwork.approach_selector` — the Mandate whose entire job is to name the
next Approach — could not have opened a picker even if it had ever run.

## The Oracle tap — `oracle/` (2026-08-17, Approach #10's in-app half)

Colleagues (and the Expert themself) already ask the AI questions all day; an answer worth keeping
becomes Rulebook material. Two entry points, ONE implementation:

- **"Add to Rulebook" in the message ⋯ menu** — `messageActionRegistry.ts` (`add-to-rulebook`,
  beside Create Task), assistant + user menus' Actions group.
- **The thumbs follow-up nudge** — [`oracle/RulebookNudge.tsx`](./oracle/RulebookNudge.tsx),
  rendered by `AssistantActionBar`: after the user actively SETS a verdict (positive OR negative —
  "a thumbs up is awesome feedback regardless of whether a Masterwork was involved", Arman), a tiny
  inline pill offers "Add to a Rulebook". Auto-fades ~8s, X + click-away dismiss, never blocks the
  chat, never renders for a user with zero Rulebooks (`hasAnyRulebook()`, cached one head-count per
  session), never fires on hydration or a retraction.

Both open the **`addToRulebookDialog` overlay** ([`oracle/AddToRulebookDialog.tsx`](./oracle/AddToRulebookDialog.tsx),
opener `features/overlays/openers/addToRulebookDialog.tsx`): pick one of YOUR Rulebooks
(`listMyRulebooks()` — explicit mine predicate per THE VIEW LAW; zero Rulebooks → a door to
`/masterwork`), see the derived rule name, save. The write is
[`oracle/service.ts`](./oracle/service.ts) `appendDraftRuleFromMessage`: name = first meaningful
line, word-boundary-truncated at 60 chars; statement = the turn content capped at 4,000 chars;
`draft: true` (invariant 1 — the Expert approves it in review); `severity: "major"`;
`source_ref = { approach: "oracle_tap", conversation_id, note: "Saved from a conversation" }`. It
consumes the canonical `saveRules` CAS from `service.ts` (never a second write path) with a bounded
re-read retry, since appending is commutative. Rule ids minted via the shared `nextRuleId`.
`oracle_tap` **is** a `platform.approach` row as of 2026-08-20 (`availability: "partial"`,
`launch_href: "/chat"`) — it appears on every Approach surface as "The Oracle tap", badged
*Partly here*, because the in-app half is real and the email-in and SMS halves are not.

The interview-variant Approaches ride the same session: `ScoutInterviewPanel`'s
`ELICITATION_CHIPS` now include **"Walk me through a hard case"** (#11 Hardest-Case Debrief — the
chip only stages the story invitation; the multi-pass Critical Decision Method probing lives in the
Scout's DB instructions, agent v7) and **"If I left for two weeks…"** (#15 Vacation Trigger,
succession framing — also a Scout instruction section). Agent prose is NEVER in code.

## Guided intake follows the house pattern (Arman, 2026-08-17)

> Born from a defect: the first "New Rulebook" intake was a cramped dialog whose questions were
> answered with tiny chip bubbles. Arman: "those stupid little small bubbles are horrible" — it
> ignored the guided-intake pattern the platform had already perfected elsewhere.

Any guided creation/intake flow in this feature (and any new one you build) follows the **house
pattern**, whose exemplars are:

- **`/research/topics/new`** (`features/research/components/init/ResearchInitForm.tsx`) — a full
  PAGE, not a dialog; big color-coded option cards; URL-driven steps; wizard-draft persistence.
- **The podcast builder** (`features/podcasts/generator/components/GeneratorForm.tsx`) — big
  option tiles with icon + label + helper, and **a sensible default pre-selected on every
  question** so the user never has to click anything they don't want to.
- **The app builder** (`features/agent-apps/`) — same family.

The rules: a dedicated full page (never a cramped dialog), big tappable option tiles (min 44px,
icon in a tinted square, label + one-line helper, color-coded per question) — **never small chip
"bubbles"** — every question defaulted so the Expert can click straight through, zero jargon,
mobile-first, dark-mode-safe semantic tokens only. `/masterwork/new` is this feature's
implementation.

## The improvement brain — assist chips + the `?assist=` launch contract (2026-08-17)

The Rulebook detail page mounts `<AssistStrip surfaceName="matrx-user/masterwork-rulebook">`
(entity-filtered to the open Rulebook) under the KPI strip. The producer is
`aidream/services/masterwork_assists/` (its FEATURE.md is the system of record): a mostly
deterministic hourly pass that offers ONE concrete elicitation move per chip — a section-scoped
interview for a thin/one-sided section, critique-a-bad-draft (the weak draft is generated
server-side via the `masterwork.bad_draft` Mandate and rides the seed), the audition failure
lever, or an exemplar request — with the `masterwork.approach_selector` Mandate firing only when
the deterministic layer found nothing (once/day cap). Every chip's action is `navigate` back to
`/masterwork/[id]?assist=<dedupe_key>`; the page resolves the row through
`features/masterwork/assists.ts::fetchAssistLaunch` and its `metadata.launch` contract opens the
Scout panel with the composer SEEDED (never auto-sent — the Expert always presses send) or the
ingest dialog. The move ledger lives on `rulebook.metadata.elicitation` (server-owned; this
surface never writes it). A chip repeating what the page renders (the draft-review backlog) is
deliberately never produced.

### THE JOURNEY — one computation, two readers (2026-08-19)

`features/masterwork/journey.ts` is the **mirror** of aidream
`services/masterwork_assists/journey.py`, which is the system of record. It answers *where is
this Rulebook in its life* — intake → distill → review → build → audition → release → encore →
improve — and *what is the ONE next move*, deterministically, from facts anyone can read. The
same computation feeds both halves of the page:

- **`RulebookKpiStrip`'s next-step line IS `journey.headline`.** Before this it stopped at
  "All caught up — Ready to Build", which it said to a Rulebook holding a finished Checkup
  nobody had looked at, three unanswered questions, three built Masterworks and zero
  Auditions. It also no longer promises that rejected rules are "with the interviewer" for a
  Rulebook that never used one — they are rewritten by the Scout on its NEXT turn, so nothing
  is happening to them while nobody is talking to it.
- **The chips below come from `journey.moves`**, in the same order. Page and chips can no
  longer disagree about what to do next.
- **The page builds its facts from what it already holds** (`journeyFactsFromRulebook`): the
  Rulebook row + the Masterworks it was built into. No extra read, no endpoint. It cannot see
  `platform.masterwork_run`, so it declares `hasRunFacts: false` and the run-dependent moves
  stay silent here rather than guessing — the server, which does read runs, raises those as
  chips.
- **Mirror discipline:** the precedence, the thresholds and the headline sentences must match
  the Python byte for byte; every scenario has a named twin in `journey.test.ts` ↔
  `tests/test_journey.py`. Change one, change both, same commit.
- **The new lanes are real doors** (assists law 9): `checkup` opens the Final Checkup window,
  `coherence` scrolls to and rings `OpenQuestionsCard` (`OPEN_QUESTIONS_ANCHOR` — the card is
  already on the page; the chip only says "these ones, here"), `conduct` opens the Conductor
  with this Rulebook attached, and the audition/release moves navigate to
  `/masterwork/[id]/masterworks` where both are one button.
- **`MasterworkHomePage` mounts the same strip UNFILTERED**, so the one thing worth doing next
  across all your Rulebooks is on the module landing page instead of behind a guess about
  which Rulebook the brain had something to say about.

## Registration

- Entity token `rulebook` (platform.entity_types; renamed from `expertise_pack`) + FE overlay in
  `features/scopes/registry/entityRegistry.ts` (`hrefFor` → `/masterwork/{id}`; peek falls back to
  RegistryPeek automatically).
- `platform.shareable_resource_registry.url_path_template` = `/masterwork/{id}`.
- Sidebar: `features/shell/constants/nav-data.ts` ("Masterwork Studio").

## Invariants

1. **Human-first:** anything machine-generated lands as `draft: true` rules or a `status='draft'`
   Rulebook; the Expert approves in this UI. No auto-activation, ever.
2. **Version honesty:** Masterworks display the Rulebook version they were built from; a stale
   Masterwork is flagged, never silently drifting — and the flag opens the rule-level diff of what
   actually moved. Absent history is stated, never papered over with a diff against the current
   rules.
3. **Copy is for a brilliant NON-technical Expert** — a doctor must be able to correct their
   Rulebook here.
4. **Review states are transient, and the Scout must clear them.** A rule can be `draft`,
   approved, `rejected` (+ the Expert's written reason in `feedback`), or `retired`
   (`ruleState()` in `types.ts` is the ONE precedence). `feedback` on any rule is a
   request-changes note. The Scout resolves all open feedback every turn through the `rulebook`
   tool: a rejected rule is rewritten per the feedback (re-queued as a fresh draft) or
   withdrawn; a change request is applied in place (an APPROVED rule stays approved). Applying
   feedback consumes it; the Expert approving clears it. A rejected rule always keeps
   `draft: true` so a Build can never include it. Approve-all never touches rejected rules.
5. **Every textarea in this module is `ProTextarea`** (mic + transcription) — the Expert talks,
   never types, unless they want to.
6. **AI tidy is a proposal, never a write.** The editor's "Clean up with AI" is the TIDY shape
   of `masterwork.rule_improver` (empty `expert_input`); `applyRuleTidy` mechanically freezes the
   verbatim quote, severity, and section (no feedback authorized changing the Expert's
   classifications), the Expert reviews the staged values (with Undo), and the existing
   `saveRules` funnel remains the only write. The sibling `masterwork.rule_cleanup` Mandate was
   retired into the improver 2026-08-17 — never re-split them.
7. **The Expert corpus is assembled ONCE, on the server, and it names its own holes.** This
   module reads it through `getExpertCorpus` → `GET /masterworks/{rulebook_id}/corpus` and never
   re-derives it. A surface that shows the corpus **renders `limits`** — a partial record
   presented as complete is the defect that contract exists to kill.

## Change log

- 2026-08-23 — Quick Build exposes and enforces the build API's 500-character
  deliverable boundary before launch, with a shared contract helper and regression test.

- **2026-08-19 — ONE expert corpus, nine lanes, both readers.** `getExpertCorpus` stopped
  assembling: it calls `GET /masterworks/{rulebook_id}/corpus` (aidream
  `services/masterwork_corpus/`), the exact function the Final Checkup judges rules against. The
  2026-08-19 audit found two assemblies that disagreed on FOUR of the nine Approaches
  (`body_of_work`, `dump`, `chat_import`, `matrx_conversations`), so the Record and the audit were
  reading different records of the same Expert. The Record now shows every lane, labels each
  contribution with where it came from, renders `limits` ("What isn't in here" — above all the
  pasted `source` text that was never stored and is gone for good), and says so when the material
  belongs to another Expert rather than rendering empty. The audio enrichment stayed here; it is a
  player over text the server supplied, never a lane. Invariant 7 below.

- **2026-08-19 — Every lane route carries the Rulebook surface and the canonical gate.**
  `SurfaceRuntimeProvider` was mounted ONLY on `RulebookDetailPage`, so the same Conductor and
  Scout launched from `/masterwork/[id]/conduct` and `/interview` passed
  `MASTERWORK_RULEBOOK_SURFACE_NAME` with **nobody publishing values** — one implementation,
  two doors, full scope through one and an empty scope through the other. The provider, the
  `buildRulebookSurfaceScope` emitter (workspace args now optional; publishes `context.lane`),
  and the `masterwork_refresh_rulebook` client tool moved into the ONE lane scaffold,
  `components/RulebookLaneRoute.tsx`, which every `/masterwork/[id]/*` route now uses — a new
  lane gets all three for free and must not hand-roll any of them. Denial handling was four
  different patterns (a swallowed `.catch`, two copies of hand-written "doesn't exist or you
  don't have access", and two lanes with no gate at all); all four are now
  `<AccessGate token="rulebook" id/>`, and `MasterworksPage` takes the Rulebook the lane
  already loaded and gated instead of re-reading it. Body layout is a scaffold prop
  (`scroll` · `fill` for live conversations · `bare` for a component that draws its own
  container).

- **2026-08-19 — Open coherence questions no longer crush their own content column.** The
  tension-kind badge now sits above the question instead of as a fixed-width flex sibling, so
  every question, explanation, rule door, and answer control uses the full card width. The
  freeform answer now uses the canonical voice-enabled `ProTextarea`, restoring the module's
  talk-or-type invariant; save failures now use the captured platform toast path.

- **2026-08-19 — The Rulebook is BOUND, not fetched (disease D4).** `rulebook_document` is
  now a declared, required variable on `masterwork.scout` and `masterwork.conductor`,
  rendered once by `agent-context/rulebookDocument.ts` and loaded before any conversation is
  minted by `agent-context/useRulebookDocument.ts`. Both panels refuse to launch when the
  Rulebook will not load or a required variable is unsupplied; both agents' prompts lost
  their fetch-first instructions and gained the `{{rulebook_document}}` placeholder. The
  surface scope's `content` value now uses the same renderer. Live proof 15/15 on the
  30-rule SEO Rulebook: `aidream/scripts/_verify_d4_document_variable.py`.

- 2026-08-18 — **The four review verbs became ONE primitive** (Arman's standing law: an
  enhancement lands in every place the logic exists). New `features/masterwork/review/`:
  `RuleDecisionActions` (Approve · Improve · Reject · Edit, all four handlers REQUIRED) and
  `useRuleImproveRun` (the single `masterwork.rule_improver` runner — the three improve/draft/tidy
  call sites no longer build their own run). Consumed by the rule rows (which gained **Edit**),
  `RuleReviewWizard`, `ImproveRuleDialog` (which gained **Improve again** on the rewrite), and
  `AddRulePanel`'s "With AI" tab (which gained **Improve** — a feedback box that re-runs the same
  Mandate on the unsaved draft); `RuleEditorDialog`'s tidy moved onto the shared runner. Also
  fixed: the improver was being offered the page's `apply_surface_write` tool and would sometimes
  call it instead of returning JSON, pausing the run forever — agent `c09465cb-…` now carries
  `tool_config.auto_tools_disabled = true`. Browser-verified on Strunk (v25→v27): 71 draft rows ×
  4 verbs, Edit opens the editor, two live Improve runs landed as drafts keeping their id.
- 2026-08-18 — Interview association waiting now begins with the first real request, not when the
  launcher mints an untouched client-only draft; unused “New interview” openings no longer report
  false persistence failures, while the module-level waiter still survives closing the panel.
- 2026-08-17 — **Duplicate rule-rewrite Mandate retired: `masterwork.rule_cleanup` →
  `masterwork.rule_improver`.** Two concurrent sessions had built siblings; the ruled verb set
  (Approve / Reject / IMPROVE) keeps the improver. The editor's "Clean up with AI" now runs the
  improver's TIDY shape (empty `expert_input`; agent v3 gained the tidy case in its DB
  definition, `expert_input` no longer required) with `applyRuleTidy` freezing
  quote/severity/section client-side — cleanup's capability folded in, nothing lost.
  `ruleCleanup.ts` + test deleted (`readRuleEditorDraft` + the tests moved into
  `ruleImprove.ts` / `ruleImprove.test.ts`; persisted editor drafts renamed
  `beforeCleanup`→`beforeTidy`); aidream declaration removed; the `masterwork.rule_cleanup`
  mandate row and its agent `f0d59c1a-…` soft-deleted/disabled live. No shim, no fallback.
- 2026-08-17 — **The three remaining dialog lanes got real URLs** (Arman's ruling closed):
  `/masterwork/[id]/sources` (dump), `/masterwork/[id]/body-of-work`, `/masterwork/[id]/import`
  — each rendering the lane's ONE shared component (`RulebookSourcesPanel`;
  `BodyOfWorkDialog` / `ChatImportDialog` with `variant="page"`) inside the shared
  `RulebookLaneRoute` scaffold (the interview-route precedent). Dialog headers and the Sources
  panel header carry "Full page" doors; query params stay live as openers, and the detail page
  gained the chat-import entry it was missing (`?chatImport=1` + the "Your AI chats" toolbar
  button — `ChatImportDialog` had been built but never mounted). The interview route accepts
  `?seed=` so the import lane's "Interview me about the gaps" follow-up survives on the full
  page. Admin map updated.
- 2026-08-17 — **The review verbs settled: Approve / Reject / Improve, and
  SAVE ≠ APPROVE** (§ The review-verb matrix). `saveRule` no longer approves
  on save (`applyManualRuleEdit` in types.ts is the one merge); the Improve
  verb shipped end-to-end (Mandate `masterwork.rule_improver`, agent
  `c09465cb-…` on Gemini Flash; `ImproveRuleDialog` with live run +
  before/after + explicit Approve/Keep editing/Discard; wizard requeue);
  "Add rule" rebuilt as the `masterworkAddRuleWindow` WindowPanel (With AI
  default + Manually; `AddRulePanel` + shared `RuleFields`, human entry
  points rewired, `upsertRuleWithRetry` added to service.ts); the editor
  gained "Have the AI apply my notes instead"; redundant `mr-*` on button
  icons removed (the "giant gap" defect). Browser-verified on Strunk
  (v16→v20: edit-save kept draft, improve landed as draft keeping its id,
  explicit approve, AI-drafted add landed as draft).

- 2026-08-17 — **Conversations made first-class + the interview got its URL** (Arman could not
  find his own interviews — pure discoverability; the data half was verified intact for his
  account). `ConversationsSection` on `/masterwork/[id]` (Continue / open in /chat / full-screen
  door / New interview / empty state), new route `/masterwork/[id]/interview`
  (`?conversation=` resume · `?new=1` fresh) sharing the ONE `ScoutInterviewContent` with the
  sheet, "Full page" door in the sheet header, shared `record/format.ts`, admin map gained the
  interview + record routes. Lesson recorded in the handoff: every creation mode gets a URL
  route; conversations tied to an entity are first-class visible on the entity page, never
  buried in a sheet.
- 2026-08-17 — **The surface's system agents are now roles behind Mandates, visible in the header
  Agents menu.** `masterwork-rulebook.manifest.ts` declares four mandate-backed agent roles —
  `scout` (Interviewer, `masterwork.scout`), `rule_improver` (`masterwork.rule_improver`),
  `checkup_auditor` (`masterwork.checkup_auditor`), `corpus_cleaner` (`masterwork.corpus_cleaner`) —
  using the new `SurfaceAgentRole.mandateKey` primitive (built for this task in
  `features/surfaces/`: manifest field → `ui.ui_surface_agent_role.mandate_key` mirror →
  `surface-config.service.ts` resolves the Holder live from `agent.mandate` via
  `fetchMandatePins`, sourceTier `"mandate"`). No agent UUID entered code; a not-yet-seeded
  mandate renders the role unfilled with a loud console error and binds automatically the moment
  the `agent.mandate` row lands (observed live: `masterwork.rule_improver` was created by a
  parallel session mid-task and appeared in the menu with zero further work). The header
  top-right Agents menu (`SurfaceAgentsHeaderButton` — the pre-existing shell primitive; nothing
  bespoke was built) lists them under "Surface roles" on `/masterwork/[id]` and launches each
  through `launchAgentExecution` with the live `buildRulebookSurfaceScope` payload. Verified in
  the browser: all four roles render with their mandate-resolved agents; running Checkup auditor
  opened the flexible panel with `rulebook_id` / `rulebook_name` / `content` staged from the live
  page scope.
- 2026-08-17 — **The Rule Editor now offers reviewable AI cleanup.** Its four
  `ProTextarea` fields default to six rows in a wider dialog. `Clean up with AI`
  sends the current rule and complete Rulebook surface scope through the new
  `masterwork.rule_cleanup` Mandate, renders the live run, restores the validated
  fields into the form, and offers Undo; source evidence and Expert
  classifications are mechanically immutable. Paid results use the shared
  persisted draft store and nothing reaches `saveRules` until the Expert clicks Save.
  *(Superseded the same day: the Mandate was a duplicate and was retired into
  `masterwork.rule_improver`'s tidy shape — see the retirement entry above. The
  behavior described here is unchanged for the Expert.)*
- 2026-08-17 — **The Rulebook detail page is now a complete declared surface.**
  `matrx-user/masterwork-rulebook` has a verified code manifest, exact dynamic-route
  recognition, a live `SurfaceRuntimeProvider`, canonical v3 context menus on the page and
  rule editor, value anchors, a human-reviewed composite `rule_draft` write target, an
  automatic search target, and `masterwork_refresh_rulebook`, which refetches the page's
  client-owned Rulebook + Masterwork state through their canonical loaders. Two empty agent
  roles (`rulebook_advisor`, `rule_editor`) declare the useful positions without hardcoding an
  agent; live binding remains a separate decision.

- 2026-08-17 — **The Understudy shipped** (running-from-minute-one, § Status top bullet):
  `understudy/refresh.ts` + `understudy/UnderstudyCard.tsx`, pokes wired into `saveRules` +
  `createDraftRulebook`, `Masterwork.understudy` flag parsed in `parseMasterworkRow`,
  Understudy filtered out of `MasterworksPage` and the built-count button, KPI strip `live`
  hook, `stageLabel("understudy")`. Server half + live verification (real Gemini 3.7 Flash
  run on Strunk): aidream `services/masterworks/FEATURE.md`.

- 2026-08-17 — **The Oracle tap (in-app) + two interview-variant Approaches shipped.** New
  `oracle/` (service + AddToRulebookDialog + RulebookNudge, overlay `addToRulebookDialog`),
  "Add to Rulebook" in the message ⋯ menu, the thumbs follow-up nudge in `AssistantActionBar`,
  and the Hardest-Case Debrief + Vacation Trigger chips on `ScoutInterviewPanel` (CDM probing
  added to the Scout's DB instructions, agent v7). See § The Oracle tap.
- 2026-08-17 — **The guided start rebuilt in the house pattern.** `NewRulebookDialog` (chip-bubble
  intake in a dialog) DELETED; replaced by the full page `/masterwork/new`
  (`intake/NewRulebookFlow.tsx`): big default-filled option tiles for the four intake questions
  (every answer pre-selected), the Approach picker as large registry-driven cards with the
  "Suggested for you" soft hint pre-selected, URL-driven steps, wizard-draft persistence
  (`wizardId: masterwork-new`). Entry points rewired: home "New Rulebook" + empty state, the
  "Start here" Approach tiles (now links carrying `?approach=<key>`), and the Studio list button.
  See § Guided intake follows the house pattern.
- 2026-08-17 — **The landing shipped + routes settled.** `/masterwork` is the module landing
  (guest marketing page via `ModuleLanding` + directory registration; authed Masterwork HOME —
  `features/masterwork/home/`: Rulebook KPIs, Masterworks with quality trend, recent runs,
  Approach tiles, the honest "How it's improving" panel). The Rulebook list moved to
  `/masterwork/all`; Encore moved to `/masterwork/encore` + `/masterwork/encore/[id]` (old
  `/encore` deleted, pre-launch, no redirects); nav children + FeatureAdminMap + every internal
  link updated. `computeKpis` widened to `Pick<Rulebook,"rules">` so overview surfaces can reuse it.

- 2026-08-18 — Claude: **The Final Checkup was rebuilt after Arman found it breaking four of our own laws on his first run** (section above). (1) **It did not stream** — `await run_mandate(...)` in each producer meant a blank panel for ~90s, so aidream gained a shared streaming path (`streaming_producer.py` + the `StreamingJsonArrayItems` / `capture_agent_chunks` primitives) that releases each finding the moment it parses AND passes the unchanged evidence gate; a forcing-function test asserts emits land BEFORE the mandate returns, so nobody can quietly restore the blocking version. (2) **The order was confusing** — the finding is now the registered `masterwork_checkup_finding` kind whose shape IS Arman's sentence (You said this → They created this → What's missing or wrong → The recommended version), rendered by ONE component through the canonical pipeline. (3) **Improve and Edit were missing** — every finding now carries the shared four-verb `RuleDecisionActions` row, with Improve on the ONE `masterwork.rule_improver` runner and Edit on the ONE `RuleFields` form; the card reaches the panel through the `checkup_decision` surface write target, never a callback. (4) **The footer hosted three stacked banners** — it is one row now; the receipt moved into the body and the AI-pass notice became a toast. Plus (5) opening the window RUNS the checkup instead of offering a second identical button. `CheckupPanes.tsx` and `CheckupFindingList.tsx` are deleted. Verified on a real paid run against the live Rulebook: findings appeared progressively (badge 1 → 2 → 4 with the run still going), Improve round-tripped a real agent rewrite into "Your version", Edit saved a hand-written name, Reject captured a reason, and Apply landed the Expert's own wording on the real rule at Rulebook v29.
- 2026-08-17 — **The Final Checkup shipped** (`features/masterwork/checkup/`, section above): the
  split-down-the-middle `masterworkCheckupWindow`, findings streamed one at a time off the durable
  `checkup` run, keyboard disposition, a reviewable-and-undoable "Approve with AI", one CAS apply
  through `saveRules` (add appends · modify keeps the id · remove RETIRES), a receipt with Undo, and
  dismissal memory on `metadata.checkup`. `saveRules` gained an optional whole-column `metadata`
  argument so a rule change and the memory that explains it land in ONE compare-and-swap;
  `useDurableRun` gained `onDomainEvent` for runs that answer in pieces; rule-id minting moved to the
  one shared `ruleIds.ts` (the rule editor and the checkup mint them identically).
- 2026-08-17 — **THE RECORD shipped, and interviews are properly associated.** A Rulebook and its
  Scout conversations now share a canonical `platform.associations` edge (registered pair, backfilled
  from rule provenance + `chat.tool_trace`); "Interview me" offers every prior interview with
  Continue / Start a new one instead of silently minting a new conversation; `/masterwork/[id]/record`
  ("Your words") shows every user message, upload, and recording for one Rulebook with doors and copy
  affordances; `getExpertCorpus()` is the one corpus contract other agents consume. Also extracted
  `useConversationResume` (`features/agents/hooks/`) — the canonical resume sequence, previously
  inline in `ChatRoomClient`, now shared by every surface that continues a conversation.

- 2026-08-17 — The one-by-one rule review is now a wide, calm wizard instead of a narrow wall
  of text: the rule name and statement lead in a dedicated reading column, rationale and
  violation guidance have clearly separated labeled panels, the intrusive severity chip is
  gone, and the progress count has its own space away from the close control.
- 2026-08-17 — The one-by-one rule review footer now has explicit Back and Next navigation
  with disabled first/last boundaries instead of the one-way Skip action. Revisiting an
  already handled rule does not inflate the sitting's reviewed count.
- 2026-08-17 — Added permanent compatibility redirects for every shipped Expertise URL:
  `/expertise` → `/masterwork`, `/expertise/[id]` → `/masterwork/[id]`,
  `/expertise/[id]/desks` → `/masterwork/[id]/masterworks`, and `/expertise/admin` →
  `/masterwork/admin`. The canonical namespace remains Masterwork-only; old bookmarks never
  dead-end.
- 2026-08-17 — **Encore shipped** (the Operator door): `/encore` + `/encore/[id]`, the
  draft→released lifecycle (`metadata.released_at`, Release/Un-release in the Studio with a
  guarded version CAS), Studio↔Encore doors both ways, per-Operator run history, nav entry.
  Also fixed: `TERMINAL_STATUSES` missed `errored`/`abandoned`, so a run that errored mid-run
  left TryMasterworkBox "Working…" forever; live Masterwork descriptions cleaned of retired
  vocabulary ("Compiled from Expertise Pack") and raw UUIDs (build.py no longer embeds the id).
- 2026-08-17 — **The review loop closes both ways** (Arman's feedback): Reject-with-feedback and
  Request-changes on every rule (`RuleFeedbackDialog`), rejected/change-requested badges + the
  feedback shown on the rule row, the Scout receives `open_feedback` from the `rulebook` tool
  read and its instructions require clearing it every turn (aidream
  `services/distillation/tools.py` + the `masterwork_scout` DB agent). Plus the focus review
  wizard (`RuleReviewWizard` — one rule at a time, approve/reject/edit/skip, auto-advance) and
  the gamified KPI strip (`RulebookKpiStrip` — approved/waiting/rejected counts, review-progress
  bar, next-step encouragement). All module textareas moved to `ProTextarea`.
- 2026-08-17 — **The Masterwork rename executed** (lexicon ruled 2026-08-16). Feature dir
  `features/expertise/` → `features/masterwork/`; canonical routes `/expertise*` →
  `/masterwork*` (the old namespace has permanent compatibility redirects only); components renamed (NewRulebookDialog,
  RulebookDetailPage, MasterworksPage, MasterworkDriftDialog, ScoutInterviewPanel,
  BuildMasterworkDialog, TryMasterworkBox, AuditionDialog, MasterworkStudioPage); types renamed
  (Rulebook/RulebookRule/Masterwork/…); DB contract moved to `platform.rulebook` (`rules`
  column), `platform.masterwork_run`, RPCs `rulebook_versions`/`rulebook_snapshot`; API prefix
  `/masterworks/*`; stream events `masterwork_*`; workflow metadata `built_from_rulebook` /
  `rulebook_slug` / `rulebook_version` / `masterwork_kind`; entity token `rulebook`; all ~90
  user-visible strings speak Rulebook / Masterwork / Build / Audition / Scout. Also fixed the
  intake name derivation to truncate on a word boundary (handoff defect #3).
- 2026-08-17 — Guided-start authoring fields now use the canonical `ProTextarea` / `ProInput`
  primitives.
- 2026-08-17 — **Refresh-fragility CLOSED (THE FLOATING LAW's durable half).** Both dialogs
  survive a reload via the durable run row (`platform.masterwork_run`), announced as the first
  stream event, heartbeated, rejoined with `POST /masterworks/runs/{run_id}/rejoin`. A dialog
  whose run is still going REOPENS ITSELF after a reload; a finished run's answer is restored
  from the row.
- 2026-08-16 — File/PDF/audio ingest Approach; RuleProvenance page anchors + doors; per-Masterwork
  recent-run history; TryMasterworkBox refresh rejoin; version snapshots + rule-level drift dialog.
- 2026-08-15 — The Distillation start: intake-first dialog (four questions → metadata.intake →
  Approach routing), Scout interview panel, empty state offers the interview first.
- 2026-08-10 — Feature created: list, detail rule editor, Masterworks page with drift flags,
  admin map, sidebar + entity registry wiring; Build + ingest dialogs.
