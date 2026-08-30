// lib/coming-soon/registry.ts
//
// THE registry of every "Coming Soon" the product shows a user.
//
// Policy (CLAUDE.md § Coming Soon is a promise, not a placeholder):
// we deliberately advertise actions we intend to build, so users see where
// the product is going and engineers feel the debt. That only works if every
// promise is DECLARED HERE — one row, with a named stage and a real blocker —
// so it can be counted and reviewed like a found defect.
//
// Never render a bare "coming soon" string. Register it, then call
// `announceComingSoon(id)`.

import type { ComingSoonEntry } from "./types";

export const COMING_SOON: Record<string, ComingSoonEntry> = {
  "files.activity-feed": {
    id: "files.activity-feed",
    label: "File Activity Feed",
    owner: "files",
    promise:
      "See a live feed of uploads, shares, and edits across your files.",
    stage: "planned",
    surfaces: ["/files/activity"],
  },
  "files.file-requests": {
    id: "files.file-requests",
    label: "File Requests",
    owner: "files",
    promise:
      "Collect files from anyone through a shareable request link and track every incoming submission here.",
    stage: "planned",
    surfaces: ["/files/requests", "Files sidebar — File requests"],
  },
  "files.starred-items": {
    id: "files.starred-items",
    label: "Starred Files and Folders",
    owner: "files",
    promise: "Star files and folders to pin them here for quick access.",
    stage: "planned",
    surfaces: ["/files/starred"],
  },
  "presentations.google-slides-export": {
    id: "presentations.google-slides-export",
    label: "Create Google Slides",
    owner: "presentations",
    promise:
      "Turn a presentation into a real Google Slides deck in your own Drive.",
    stage: "blocked",
    // The export was BUILT and is dead: it requests
    // `auth/presentations`, which is not on the production OAuth client, so
    // Google blocks the consent step for every user. Verified 2026-08-18 —
    // FOUND_DEFECTS D214. It needs its own provider-access campaign, which is
    // Arman's to open; until then this is an honest promise instead of a
    // button that silently fails. PDF / HTML / PowerPoint are fully local and
    // unaffected, and a .pptx opens in Google Slides via upload.
    blockedBy:
      "Google has not approved the Slides scope for our app — it needs its own approval campaign (FOUND_DEFECTS D214).",
    surfaces: ["Presentation export menu"],
  },
  "database-admin.edit-function": {
    id: "database-admin.edit-function",
    label: "Save function definition",
    owner: "administration",
    promise:
      "Edit a database function's body here and apply the change to the live database.",
    stage: "blocked",
    // Found 2026-08-24 during the dead-control sweep: Save was
    // `console.log("Save changes")`. An admin could edit a function body,
    // press Save, see no error, and believe it had been applied — a dead
    // click that reads as a successful write is the worse half of the class.
    // It stays blocked by design, not by neglect: CLAUDE.md § Migrations —
    // app code has NO DDL path; DDL is applied via migration + Supabase MCP
    // and recorded in the shared ledger. Building this button would mean
    // building the thing that rule exists to prevent.
    blockedBy:
      "App code has no DDL path by policy (CLAUDE.md § Migrations) — function bodies change through a migration, not a browser textarea.",
    surfaces: ["Database admin → function details → Definition tab"],
  },
  "chat.live-audio": {
    id: "chat.live-audio",
    label: "Live audio",
    owner: "agents",
    promise:
      "Talk to the agent out loud and hear it answer, in a continuous live session — not a recording you send and wait on.",
    stage: "planned",
    // Found 2026-08-24 during the dead-control sweep: the button was rendered
    // beside Send with `onClick={() => {}}`, so the one control on the input
    // bar that promises the most did the least. Dictation (hold to record) is
    // a DIFFERENT, working control — this is the continuous session.
    surfaces: ["Chat input action bar"],
  },
  "agents.create-app": {
    id: "agents.create-app",
    label: "Create App from Agent",
    owner: "agents",
    promise:
      "Turn this agent into a standalone no-code app with its own URL, inputs, and shareable runs.",
    stage: "planned",
    surfaces: ["/agents/all card actions", "/agents/browse row menu"],
  },
  "agents.save-as-template": {
    id: "agents.save-as-template",
    label: "Save as Template",
    owner: "agents",
    promise:
      "Publish this agent as a reusable template others can start new agents from.",
    stage: "blocked",
    blockedBy:
      "POST /api/agents/[id]/convert-to-template exists for agents, but the admin row action only toasts — the template surface that consumes the result is not built.",
    surfaces: ["/agents/all card actions", "/agents/browse row menu"],
  },
  "agents.make-global-builtin": {
    id: "agents.make-global-builtin",
    label: "Make Global Built-in",
    owner: "agents",
    promise:
      "Promote this agent to a platform built-in available to every user without sharing.",
    stage: "planned",
    surfaces: ["/agents/browse row menu (super-admin)"],
  },
  "agents.export": {
    id: "agents.export",
    label: "Export Agent",
    owner: "agents",
    promise:
      "Download this agent's full definition as portable JSON to move it between environments.",
    stage: "planned",
    surfaces: ["/agents/browse row menu"],
  },
  "agents.move-to-org": {
    id: "agents.move-to-org",
    label: "Move to Organization",
    owner: "agents",
    promise:
      "Reassign this agent's owning organization so it appears under a different team's My Orgs.",
    stage: "planned",
    surfaces: ["/agents/browse row menu"],
  },
  "agents.compare-versions": {
    id: "agents.compare-versions",
    label: "Compare Versions",
    owner: "agents",
    promise:
      "Diff two versions of this agent side by side — prompt, tools, model, and settings.",
    stage: "planned",
    surfaces: ["/agents/browse row menu"],
  },
  "research.multimodal-media": {
    id: "research.multimodal-media",
    label: "Send media to the model",
    owner: "research",
    promise:
      "Attach a topic's curated images and media to an agent run as real visual input — today the model reads only URLs, alt text and captions, never the pixels.",
    stage: "planned",
    surfaces: [
      "/research/topics/[id]/context picker (Media inventory, Page images)",
    ],
  },
  "marketing.generate-video": {
    id: "marketing.generate-video",
    label: "Generate promo clip",
    owner: "marketing",
    promise:
      "Order a short AI-generated promo clip (16:9 or 9:16, 4–8s) off the media menu, rendered by the platform's video models and saved to the brand library like generated images are today.",
    stage: "blocked",
    blockedBy:
      "aidream has five video providers (Veo/Sora/Kling/Wan/grok-imagine) reachable only via an agent pinned to a video model or the ai.generate_video workflow node — video runs take minutes and the marketing headless-agent shell (5-min client deadline, dies on navigation) needs a durable job path before the order UX is honest.",
    surfaces: ["/marketing/brands/[brandId]/sites/[siteId]/media?view=videos"],
  },
  "cms.site-images": {
    id: "cms.site-images",
    label: "Add pictures to a website",
    owner: "cms",
    promise:
      "Upload a logo, a hero picture, or a picture per service straight from the website, and have the site shape's picture requirements tick off on their own.",
    stage: "blocked",
    blockedBy:
      "The asset library exists end to end (client_assets + /api/cms/assets + CmsAssetService.createAsset), but its ONLY UI is AssetsPanel inside the super-admin surface /administration/knowledge/cms-agents — there is no per-site tab a normal owner can reach, so the content-plan setup checklist can measure the gap and not close it.",
    surfaces: [
      "/marketing/content-plan/[siteId]?view=setup — 'Your website has the pictures it needs'",
    ],
  },
  "marketing.calendar": {
    id: "marketing.calendar",
    label: "Marketing Calendar",
    owner: "marketing",
    promise:
      "See and drag every planned publish across content, social, email, and paid on one timeline, with per-brand and per-site filters.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/calendar route"],
  },
  "marketing.audience": {
    id: "marketing.audience",
    label: "Audience & Personas",
    owner: "marketing",
    promise:
      "Define segments, ICPs, and personas once so every brief, initiative, and agent writes for a named audience instead of a guess.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/audience route"],
  },
  "marketing.content-studio": {
    id: "marketing.content-studio",
    label: "Content Studio",
    owner: "marketing",
    promise:
      "Take a brief from Content Plan to draft, review, approval, and publish into the CMS without leaving the platform.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/content-studio route"],
  },
  "marketing.social": {
    id: "marketing.social",
    label: "Social",
    owner: "marketing",
    promise:
      "Connect social accounts, schedule and publish posts, and work one engagement inbox across every network.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/social route"],
  },
  // Lane B email — the mailbox, the templates, the sequences — SHIPPED, and
  // /marketing/email is now its front door. What remains is LANE A: opt-in
  // marketing we send on the customer's behalf, which is committed vision and
  // a genuinely different build (our reputation carries it, so consent becomes
  // a hard eligibility gate). docs/handoffs/outreach-system.md §5.1 + Lane A.
  "marketing.email.opt-in-campaigns": {
    id: "marketing.email.opt-in-campaigns",
    label: "Opt-in email campaigns",
    owner: "marketing",
    promise:
      "Build lists, send broadcasts, and run lifecycle automation on your behalf — with recorded per-recipient consent as a hard send gate, a preference center, and one-click unsubscribe honored across every lane.",
    stage: "planned",
    surfaces: ["/marketing/email route"],
  },
  "marketing.ads": {
    id: "marketing.ads",
    label: "Paid Ads",
    owner: "marketing",
    promise:
      "Pull Google, Meta, and LinkedIn spend into one place with creative, keyword, and ROAS rollups against each ad campaign.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/ads route"],
  },
  // Mentions and sentiment SHIPPED (coverage monitoring + the reputation
  // decision brief), and /marketing/monitoring is now their front door. The
  // untouched half of the original promise is what stays registered: review
  // sites, and being TOLD when something moves instead of having to look.
  "marketing.monitoring.alerts": {
    id: "marketing.monitoring.alerts",
    label: "Review monitoring and alerts",
    owner: "marketing",
    promise:
      "Watch review sites alongside press mentions, and get alerted the moment sentiment, coverage, or a citation moves — instead of having to open the page to find out.",
    stage: "planned",
    surfaces: ["/marketing/monitoring route"],
  },
  "marketing.analytics": {
    id: "marketing.analytics",
    label: "Marketing Analytics",
    owner: "marketing",
    promise:
      "One cross-channel view of traffic, conversion, and attribution assembled from the providers already bound in Data Connections.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/analytics route"],
  },
  // "marketing.automations" FULFILLED 2026-08-25: `/marketing/automations`
  // now mounts the run console (KI-049) at the organization tier — the same
  // component the system tier drives at
  // `/administration/marketing/run-console`. See
  // `features/marketing/seo/run-console/FEATURE.md`.
  // Planned PUBLIC analyzers advertised on the /seo tool index. Declared in
  // features/marketing/lib/marketing-nav.ts (MARKETING_PUBLIC_TOOL_CATEGORIES);
  // each ships at its already-advertised /seo/* URL.
  "marketing.tools.heading-structure": {
    id: "marketing.tools.heading-structure",
    label: "Heading Structure Analyzer",
    owner: "marketing",
    promise:
      "Visualize the H1–H6 hierarchy of any page and flag structural issues that hurt crawlability.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.content-score": {
    id: "marketing.tools.content-score",
    label: "Content Quality Scorer",
    owner: "marketing",
    promise:
      "AI reads your page and scores readability, depth, E-E-A-T signals, and topical coverage against the top 10 SERP results.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.content-brief": {
    id: "marketing.tools.content-brief",
    label: "Content Brief Generator",
    owner: "marketing",
    promise:
      "Provide a keyword and the AI builds a complete content brief — target audience, outline, FAQs, and internal link suggestions.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.meta-writer": {
    id: "marketing.tools.meta-writer",
    label: "AI Meta Tag Writer",
    owner: "marketing",
    promise:
      "Paste your page content or URL and the AI drafts optimized title and description variants ranked by predicted CTR.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.readability": {
    id: "marketing.tools.readability",
    label: "Readability Analyzer",
    owner: "marketing",
    promise:
      "Score content across Flesch-Kincaid, Gunning Fog, and SMOG indexes, with sentence-level suggestions from an LLM.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.keyword-clustering": {
    id: "marketing.tools.keyword-clustering",
    label: "AI Keyword Clusterer",
    owner: "marketing",
    promise:
      "Paste a list of keywords and the AI groups them by semantic intent, making it easy to plan pages and content hubs.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.serp-analysis": {
    id: "marketing.tools.serp-analysis",
    label: "SERP Intent Analyzer",
    owner: "marketing",
    promise:
      "Scrape the top 10 results for any keyword and use an LLM to identify the dominant search intent and content format.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.title-optimizer": {
    id: "marketing.tools.title-optimizer",
    label: "Title Tag Optimizer",
    owner: "marketing",
    promise:
      "A/B-test headline variants with predicted CTR scoring — the LLM rewrites titles for clarity, keyword placement, and length.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.redirect-tracer": {
    id: "marketing.tools.redirect-tracer",
    label: "Redirect Chain Tracer",
    owner: "marketing",
    promise:
      "Follow every redirect hop from a URL and surface chain loops, unnecessary hops, and mixed-protocol issues.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.page-speed": {
    id: "marketing.tools.page-speed",
    label: "Core Web Vitals Analyzer",
    owner: "marketing",
    promise:
      "Measure LCP, CLS, and INP with an AI summary of the biggest opportunities to improve Core Web Vitals.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "marketing.tools.hreflang": {
    id: "marketing.tools.hreflang",
    label: "Hreflang Validator",
    owner: "marketing",
    promise:
      "Validate all hreflang tags on a URL — missing reciprocals, incorrect locale codes, and self-referencing issues.",
    stage: "planned",
    surfaces: ["/seo public tools index"],
  },
  "content-blocks.math-save-to-database": {
    id: "content-blocks.math-save-to-database",
    label: "Save Math Problem",
    owner: "content-blocks",
    promise:
      "Save this math problem straight into your problem library instead of downloading and importing it by hand.",
    stage: "planned",
    surfaces: ["Math problem block action bar (chat content)"],
  },
  "rich-document.convert-to-broker": {
    id: "rich-document.convert-to-broker",
    label: "Convert to Broker",
    owner: "rich-document",
    promise:
      "Turn this response or document into a reusable broker that agents can reference as structured context.",
    stage: "planned",
    surfaces: [
      "Rich document action menu",
      "Authenticated chat message action menu",
      "Public chat message action menu",
    ],
  },
  "image-studio.smart-crop": {
    id: "image-studio.smart-crop",
    label: "Smart Crop",
    owner: "image-studio",
    promise:
      "Detect the important subject automatically and frame an avatar crop around it.",
    stage: "blocked",
    blockedBy:
      "The avatar control is built, but face detection is disabled in IMAGE_STUDIO_BACKEND_CAPABILITIES until the deployed endpoint is available.",
    surfaces: ["Image Studio avatar mode"],
  },
  "image-studio.suggest-annotations": {
    id: "image-studio.suggest-annotations",
    label: "Suggest Annotations",
    owner: "image-studio",
    promise:
      "Analyze the image and recommend useful callouts, arrows, and highlights.",
    stage: "blocked",
    blockedBy:
      "The annotate-mode control is built, but the annotation-suggestion agent is not deployed.",
    surfaces: ["Image Studio annotate mode"],
  },
  "image-studio.pii-redaction": {
    id: "image-studio.pii-redaction",
    label: "Redact Sensitive Information",
    owner: "image-studio",
    promise:
      "Find sensitive personal information in an image and prepare safe redactions.",
    stage: "blocked",
    blockedBy:
      "The annotate-mode control is built, but the PII-redaction agent is not deployed.",
    surfaces: ["Image Studio annotate mode"],
  },
  "agent-connections.hooks": {
    id: "agent-connections.hooks",
    label: "Agent Hooks",
    owner: "agent-connections",
    promise:
      "Run an automated action at a specific point in an agent's lifecycle — before it starts, after a tool runs, when it finishes.",
    stage: "planned",
    surfaces: ["/agent-connections/hooks empty state"],
  },
  "agent-connections.sub-agents": {
    id: "agent-connections.sub-agents",
    label: "Sub-agents",
    owner: "agent-connections",
    promise:
      "Hand a focused job to a specialist agent — a code reviewer, a performance optimizer, a migration helper — that another agent calls on demand.",
    stage: "blocked",
    blockedBy:
      "Sub-agents have no way to be distinguished from top-level agents until the agent_definition.kind column lands; until then they cannot be listed or filtered out of the Agents list.",
    surfaces: ["/agent-connections/sub-agents empty state"],
  },
  "education.convert-target-generators": {
    id: "education.convert-target-generators",
    label: "More convert targets",
    owner: "education",
    promise:
      "Convert this content into every study artifact — targets light up here as each owning project registers its generator with the canonical converter.",
    stage: "planned",
    surfaces: ["ConvertContentDialog unavailable-target rows"],
  },
  "education.premium-checkout": {
    id: "education.premium-checkout",
    label: "Education Premium Checkout",
    owner: "education",
    promise:
      "Start a secure checkout for the Education Premium plan and activate the subscription immediately.",
    stage: "blocked",
    blockedBy:
      "The live Stripe checkout endpoint returns 503 until Education Premium billing is configured.",
    surfaces: ["/pricing Premium plan action"],
  },
  "content-plan.design-vision-agent": {
    id: "content-plan.design-vision-agent",
    label: "Generate a design vision",
    owner: "content-plan",
    promise:
      "An agent studies your brand and research, then proposes the site's whole look — palette rationale, typography, section choices — instead of you typing a design direction by hand.",
    stage: "planned",
    surfaces: ["Content Plan Setup — Site shell rung"],
  },
  // ── HR / payroll export (lane L13) ────────────────────────────────────────
  // A payroll export names three identities the user must be able to open: the
  // employment behind an unmapped id, the workweek that is not final yet, and
  // the period's approval progress. None of those surfaces exists yet — so
  // each is a DECLARED promise instead of a dead span or a silent omission.
  "hr.employment-record": {
    id: "hr.employment-record",
    label: "Open this person's employment record",
    owner: "hr",
    promise:
      "Open the employment behind this line — their pay setup, the external payroll IDs an export needs, and the history behind every hour on the file.",
    stage: "planned",
    blockedBy:
      "The employment record surface is not built yet; the export lane names employments before anything can display one.",
    surfaces: [
      "/hr/time/periods/[periodId] — unmapped-identifier list",
      "/hr/time/periods/[periodId] — advisory-rule refusal, affected people",
      "/hr/time/periods/[periodId] — disputes carried into an export",
    ],
  },
  "hr.workweek-detail": {
    id: "hr.workweek-detail",
    label: "Open this workweek",
    owner: "hr",
    promise:
      "Open the workweek that is holding up this export and see exactly which intervals are still unfinalised.",
    stage: "planned",
    blockedBy:
      "The workweek surface is not built yet; the export lane names pending workweeks before anything can display one.",
    surfaces: [
      "/hr/time/periods/[periodId] — pending-workweek precondition",
    ],
  },
  // "hr.period-approval-progress" was retired 2026-08-26 by lane L3 (HRB-015): the pay-period
  // state machine and its approval progress SHIPPED as `/hr/time/periods/[periodId]`
  // (features/hr/time/periods/components/PeriodStatePanel.tsx). A Coming Soon entry for a surface
  // that exists is a promise the product is already keeping, and leaving it here would let a future
  // caller announce "coming soon" over a live screen. It had no call sites when it was removed.
  "hr.corrective-action-create": {
    id: "hr.corrective-action-create",
    label: "Start a corrective action",
    owner: "hr",
    promise:
      "Open a corrective action pre-filled with the objective facts — dates, hours, thresholds crossed, alerts delivered and read, and whether a request was denied. Offered, never automatic: no pattern, count or threshold ever creates one, because a human decides that a person is being written up.",
    stage: "blocked",
    blockedBy:
      "hr.corrective_action is CONF-tier and its authoring surface belongs to the employee-relations lane; the overtime lane owns only the door and its four guards (offered-never-automatic, absent-without-authority, one-way evidence, acknowledge-the-disagreement-first).",
    surfaces: ["/hr/time/overtime/[requestId] — corrective action"],
  },
  "hr.corrective-action-record": {
    id: "hr.corrective-action-record",
    label: "Open a corrective action",
    owner: "hr",
    promise:
      "Read the corrective action these hours are cited in. The link is one-way evidence: resolving the attendance exception never edits the write-up, and voiding the write-up never rewrites the attendance record.",
    stage: "blocked",
    blockedBy:
      "The employee-relations record surface is not built yet. hr.attendance_exception.corrective_action_id already carries the link.",
    surfaces: ["/hr/time/overtime/[requestId] — corrective action"],
  },
  "hr.time-adjustment-create": {
    id: "hr.time-adjustment-create",
    label: "Record a correction after lock",
    owner: "hr",
    promise:
      "File a correction against a locked pay period. It rides the next payroll export, tagged back to the period it belongs to — the locked period is never rewritten and the delivered export is never regenerated, because regenerating in place double-pays.",
    stage: "blocked",
    blockedBy:
      "The read side is built; hr.time_adjustment_create is a SQL RPC that does not exist yet (lane L3, HRB-015). The surface lists corrections and states the rule today.",
    surfaces: ["/hr/time/periods/[periodId] — corrections after lock"],
  },
  "hr.time-rule-detail": {
    id: "hr.time-rule-detail",
    label: "Time calculation rule details",
    owner: "hr",
    promise:
      "Open the exact versioned time rule behind this calculated figure, including its effective dates and configuration.",
    stage: "building",
    blockedBy:
      "The calculation already preserves the rule identifier, but the versioned HR rule detail surface is still being built.",
    surfaces: ["HR time calculation snapshot — auto-close rule"],
  },
  // ── HR / people (lane L1) ────────────────────────────────────────────────
  // The directory row action set and the org chart's NL query box are specified
  // in full (SPEC-EMPLOYEES §2.2, §5.2). Each of these is a real advertised verb
  // whose lane has not shipped its half yet — declared here so the promise is
  // countable and reviewable rather than a toast or a silently-missing action.
  "hr.people.message": {
    id: "hr.people.message",
    label: "Message this person",
    owner: "hr",
    promise:
      "Start a message to a colleague from their directory row or profile, without leaving HR to find their address.",
    stage: "planned",
    blockedBy:
      "There is no in-product person-to-person messaging surface to open. HR must not invent a second one; the row shows the work email it holds and waits for that surface.",
    surfaces: [
      "/hr/people — row menu",
      "/hr/people/[employeeId] — profile header menu",
    ],
  },
  "hr.people.assign-training": {
    id: "hr.people.assign-training",
    label: "Assign training",
    owner: "hr",
    promise:
      "Assign a course or a compliance mandate to one person, or to everyone selected in the directory, and track completion from the same list.",
    stage: "planned",
    blockedBy:
      "The Training pillar (routes 57–61) owns assignment; its surfaces and RPCs are not built. The directory offers the verb because bulk assignment is specified there.",
    surfaces: [
      "/hr/people — row menu",
      "/hr/people — bulk action bar",
    ],
  },
  "hr.people.send-acknowledgment": {
    id: "hr.people.send-acknowledgment",
    label: "Send an acknowledgment",
    owner: "hr",
    promise:
      "Send a document acknowledgment request to everyone selected, and watch the outstanding count come down from the campaign screen.",
    stage: "planned",
    blockedBy:
      "Acknowledgment campaigns live in Documents & Forms (route 54), which is not built.",
    surfaces: ["/hr/people — bulk action bar"],
  },
  "hr.people.directory-export": {
    id: "hr.people.directory-export",
    label: "Export this list",
    owner: "hr",
    promise:
      "Download exactly the people this filtered list is showing, with the columns the list is showing, as a file — and have the export recorded, because who exported the people list and when is itself a record.",
    stage: "blocked",
    blockedBy:
      "SPEC-EMPLOYEES §2.2 makes an export an AUDITED action (hr.access_audit action='export'). There is no hr_directory_export door, and a browser cannot write that audit row — so an unaudited CSV of everyone is deliberately NOT shipped. Copy / Copy for AI on the table remain available for the directory-tier columns already on screen.",
    surfaces: ["/hr/people — bulk action bar", "/hr/people — toolbar"],
  },
  // "hr.people.start-offboarding" was a stage:"blocked" stub while hr_separation_record was
  // already live. The separation FORM is now built (OffboardEmployeeDialog, wired from the
  // /hr/people row menu), so the coming-soon entry is deleted — no dead path left behind.
  // "hr.people.corrective-action" was a stage:"blocked" stub whose `blockedBy` had gone stale:
  // the Employee Relations lane HAD landed both the issuance form (NewCorrectiveActionDialog)
  // and the case surface, and the notes compose box was still announcing them as unbuilt. The
  // button now opens the real dialog (hr_l1_74), so the entry is deleted rather than reworded —
  // a coming-soon row pointing at shipped code is a dead path that teaches the next reader a
  // false thing about what exists.
  "hr.people.compensation-history": {
    id: "hr.people.compensation-history",
    label: "Pay components and their history",
    owner: "hr",
    promise:
      "Every pay component in force — base, differentials, allowances — each with its own effective window, its change reason, and who approved it. Never a single made-up rate that summed things that are not the same thing.",
    stage: "blocked",
    blockedBy:
      "There is no per-employee compensation read door. hr_confidential_list('hr_compensation') filters only by organization_id and returns up to 500 org-wide rows, so using it for one person's tab would record a whole-org audited list read for a single-person purpose. The L1 server lane owes a per-employment door.",
    surfaces: ["/hr/people/[employeeId]/compensation"],
  },
  "hr.people.emergency-contacts": {
    id: "hr.people.emergency-contacts",
    label: "Emergency contacts",
    owner: "hr",
    promise:
      "Who to call, in the order you would call them — editable by the person themselves, and reachable by HR when it matters.",
    stage: "blocked",
    blockedBy:
      "hr_emergency_contact_upsert and _remove are live, but there is no per-employee READ door (hr_confidential_list filters only by organization_id). An add form with no way to see what is already there would create duplicates.",
    surfaces: ["/hr/people/[employeeId]/emergency"],
  },
  "hr.people.documents": {
    id: "hr.people.documents",
    label: "This person's documents",
    owner: "hr",
    promise:
      "Their document file — offer letters, signed policies, certificates — through the platform's own file viewer, with retention clocks and legal holds shown on the row.",
    stage: "blocked",
    blockedBy:
      "Documents reuse features/files end to end; the association between an hr.employee and files.files rows is not wired, and HR must not build its own file storage. I-9s are deliberately NOT here — they live in the segregated register at /hr/documents/i9.",
    surfaces: ["/hr/people/[employeeId]/documents"],
  },
  "hr.people.notes": {
    id: "hr.people.notes",
    label: "Notes about this person",
    owner: "hr",
    promise:
      "Your own running notes on someone you manage — visible to you and to HR, never to them, and never mistaken for a disciplinary record.",
    stage: "blocked",
    blockedBy:
      "Notes are platform.comments on the employee with an author-scoped lane; the comments surface for an hr_employee target is not wired. The corrective-action door is shown regardless, because that is the flow a manager usually actually wants.",
    surfaces: ["/hr/people/[employeeId]/notes"],
  },
  "hr.people.tab-time-off": {
    id: "hr.people.tab-time-off",
    label: "Time off on the profile",
    owner: "hr",
    promise:
      "Their balances, requests and leave cases, in the profile, without leaving the person you are looking at.",
    stage: "planned",
    blockedBy:
      "Owned by the Leave & PTO lane. This profile hosts the panel and hands it employment_id and the viewer persona; it never re-resolves identity and never renders its own header.",
    surfaces: ["/hr/people/[employeeId]/time-off"],
  },
  "hr.people.tab-time": {
    id: "hr.people.tab-time",
    label: "Time & schedule on the profile",
    owner: "hr",
    promise:
      "Their current timesheet, punches and published shifts, in the profile.",
    stage: "building",
    blockedBy:
      "The Time lane's panel now MOUNTS on this tab and carries the HR arm of the kiosk PIN door — an HR writer can set or reset a PIN for someone with no login, which is the only way the kiosk's own population can ever receive one. Still owed on the same panel: this person's timesheet, punch history and published shifts.",
    surfaces: ["/hr/people/[employeeId]/time"],
  },
  "hr.people.tab-performance": {
    id: "hr.people.tab-performance",
    label: "Performance on the profile",
    owner: "hr",
    promise:
      "Their review cycles and outcomes, rendered by the Reviews feature itself — never a second reviews UI.",
    stage: "planned",
    blockedBy:
      "Owned by the Employee Performance Reviews feature. SPEC-UI-IA route 62 is explicit that this must not fork a second reviews UI, so the profile waits for that feature's own component.",
    surfaces: ["/hr/people/[employeeId]/performance"],
  },
  "hr.people.tab-training": {
    id: "hr.people.tab-training",
    label: "Training on the profile",
    owner: "hr",
    promise:
      "Their assignments, due dates, certifications and immutable transcript, in the profile.",
    stage: "planned",
    blockedBy:
      "Owned by the Training lane (routes 57–61).",
    surfaces: ["/hr/people/[employeeId]/training"],
  },
  "hr.people.org-chart-query": {
    id: "hr.people.org-chart-query",
    label: "Ask the org chart a question",
    owner: "hr",
    promise:
      "Ask in plain words — “who reports to Dana two levels down”, “which teams have no manager” — and the matching nodes light up on the chart you are already looking at. It is never a chat reply.",
    stage: "blocked",
    blockedBy:
      "The mandate hr.employees.org_chart_query is specified (SPEC-EMPLOYEES §8) but not registered, so there is nothing to launch. The box renders honestly disabled rather than pretending.",
    surfaces: ["/hr/people/org-chart — query box"],
  },
  "hr.people.chart-image-export": {
    id: "hr.people.chart-image-export",
    label: "Export the org chart as PDF or PNG",
    owner: "hr",
    promise:
      "Download the chart exactly as drawn — as of the date on the chip — as a PDF or a PNG that carries that date in its filename and its header.",
    stage: "building",
    blockedBy:
      "CSV export is live and carries the as-of date. Rendering the laid-out chart to an image needs a rasteriser decision that has not been made; CSV ships first rather than shipping three broken formats.",
    surfaces: ["/hr/people/org-chart — export menu"],
  },
  "hr.people.bulk-manager-assignment": {
    id: "hr.people.bulk-manager-assignment",
    label: "Assign managers in bulk",
    owner: "hr",
    promise:
      "Set the reporting line for many people at once, so an org with no manager data gets a chart instead of an empty canvas.",
    stage: "blocked",
    blockedBy:
      "Each assignment is an effective-dated position change through hr_position_change, which does not exist in the database yet. A bulk writer on top of a missing single writer would be the wrong thing built twice.",
    surfaces: [
      "/hr/people/org-chart — no-manager-data state",
      "/hr/people/org-chart — cycle badge",
    ],
  },
  "hr.people.custom-fields": {
    id: "hr.people.custom-fields",
    label: "Custom fields and custom tabs",
    owner: "hr",
    promise:
      "Fields your org defined render with the right editor for their type, in the order an admin set, with their own sensitivity tier — on the profile and as directory columns.",
    stage: "blocked",
    blockedBy:
      "The platform tier-1 custom-fields client kit (CustomFieldsSection / CustomFieldInput / customFieldColumns) belongs to lane L14 and does not exist. The profile shows the stored values read-only through a marked adapter rather than inventing a competing kit.",
    surfaces: [
      "/hr/people/[employeeId]/[tab] — More section",
      "/hr/people/[employeeId]/c/[tabKey]",
    ],
  },
  "hr.timecard-correction-request": {
    id: "hr.timecard-correction-request",
    label: "Ask for a correction",
    owner: "hr",
    promise:
      "Raise a correction request against a specific day on your timesheet. Your manager decides it, your own words are kept on the record either way, and nothing about the figure changes until somebody with authority agrees to it.",
    stage: "blocked",
    blockedBy:
      "A correction request is a `timecard_correction` workflow instance opened through hr.wf_request. The engine function exists in the hr schema, but there is no PostgREST-reachable `public.hr_wf_request` wrapper (verified live 2026-08-26), so no browser can open one. Owed by lane L3 / HRB-015. After lock this becomes hr.time_adjustment_create instead — see hr.time-adjustment-create.",
    surfaces: [
      "/hr/me/timesheet — attestation bar",
      "/hr/time/timesheets/[employmentId] — day actions",
    ],
  },
  "hr.punch-photo": {
    id: "hr.punch-photo",
    label: "View the punch photo",
    owner: "hr",
    promise:
      "Open the photo captured with this punch, behind the same sensitivity gate as any other employee image — and recorded in the access log, because looking at a picture of an employee is an access event.",
    stage: "blocked",
    blockedBy:
      "The register reports photo PRESENCE (`hasPhoto`), which is all a list may show. Opening the image needs the gated file read (`hr_confidential_get` on the punch photo target), and the punch photo is not yet a registered confidential target. Owed by lane L3 / HRB-015 with L1's sensitivity lane.",
    surfaces: ["/hr/time/punches — photo column"],
  },

  // ── Self-service surfaces the HR nav already links (SPEC-UI-IA §3.1) ──────
  // These are registered rather than left as 404s because `resolveHrNav`
  // renders the nav item for an employee persona TODAY. A nav item the shell
  // itself draws, pointing at nothing, is the dead end this registry exists to
  // make visible. Each names the pillar lane that owes it.
  "hr.me.documents": {
    id: "hr.me.documents",
    label: "My documents",
    owner: "hr",
    promise:
      "Your document file, your signature requests and your acknowledgments in one place — the same files the organization holds about you, not a copy.",
    stage: "planned",
    surfaces: ["/hr/me/documents", "HR nav — My Documents"],
  },
  "hr.me.schedule": {
    id: "hr.me.schedule",
    label: "My schedule",
    owner: "hr",
    promise:
      "Your published shifts, the open shifts you can claim, swap requests, and the availability you set — with a change banner whenever a published shift moves.",
    stage: "planned",
    surfaces: ["/hr/me/schedule", "HR nav — My Schedule"],
  },
  "hr.me.training": {
    id: "hr.me.training",
    label: "My training",
    owner: "hr",
    promise:
      "What you have been assigned, when it is due, and your transcript — which is yours and is never rewritten.",
    stage: "planned",
    surfaces: ["/hr/me/training", "HR nav — My Training"],
  },
  // ── The unbuilt HR PILLARS the nav has been offering all along ────────────
  //
  // 🚨 THESE NINE WERE 404s, IN TWO PLACES EACH. `resolveHrNav` is one resolver
  // with two callers — the left rail and the home card grid — so every unbuilt
  // pillar cost a dead rail item AND a dead card on the first screen a user
  // sees. Measured 2026-08-28, before the fix: hr_admin 17 rail items / 9 dead
  // and 16 home cards / 9 dead; manager 14 / 8; and Performance and Engagement
  // were ungated, so a plain employee, a contractor and a person with NO
  // EMPLOYER were each offered two of them. The owner's report was, exactly,
  // "the menus don't all work".
  //
  // Registered rather than removed from the nav, because these are committed
  // pillars with route numbers in SPEC-UI-IA §3 — an advertised direction, which
  // is what this registry is FOR. Who should never be offered one at all is a
  // separate and equally real fix, and it lives in `hr-nav.ts` as `requires`.
  //
  // Each renders through `features/hr/shared/HrPillarSurface.tsx`, inside the
  // full HR shell, so the page is somewhere a person can navigate onward from.
  // When a lane ships its pillar: mount the real surface AND delete the entry
  // here, in the same commit.
  "hr.hiring": {
    id: "hr.hiring",
    label: "Hiring",
    owner: "hr",
    promise:
      "Open a requisition, move candidates through interviews, and turn an accepted offer into an employee record without retyping a single field.",
    stage: "planned",
    blockedBy:
      "SPEC-UI-IA §3.3 routes 18–26. `hr.candidate` has no client read door yet, which is also why /hr/people/new can only carry a candidate id rather than prefill from one.",
    surfaces: ["/hr/hiring", "HR nav — Hiring", "HR home — Hiring card"],
  },
  "hr.schedule": {
    id: "hr.schedule",
    label: "Schedule",
    owner: "hr",
    promise:
      "Build the shift schedule, check it against your own scheduling rules before anyone sees it, publish it, and fill the shifts that come open.",
    stage: "planned",
    blockedBy:
      "SPEC-UI-IA §3.5. The rules this surface must respect are already configurable at /hr/settings/schedule-rules; the builder that reads them is not built.",
    surfaces: ["/hr/schedule", "HR nav — Schedule", "HR home — Schedule card"],
  },
  "hr.onboarding": {
    id: "hr.onboarding",
    label: "Onboarding",
    owner: "hr",
    promise:
      "Run a new hire through their first-day checklist — and run a leaver through the mirror of it — from templates you set once, with every task owned by a named person.",
    stage: "planned",
    blockedBy:
      "SPEC-UI-IA §3.6. The separation half already has its writer (hr_separation_record, wired from the /hr/people row menu); the run surface and its templates are not built.",
    surfaces: [
      "/hr/onboarding",
      "HR nav — Onboarding",
      "HR home — Onboarding card",
    ],
  },
  "hr.documents": {
    id: "hr.documents",
    label: "Documents",
    owner: "hr",
    promise:
      "The document library everyone works from, the acknowledgment campaigns you send from it, and the signatures that come back — with retention clocks and legal holds shown on the row.",
    stage: "planned",
    blockedBy:
      "SPEC-UI-IA §3.7 route 54. Documents reuse features/files end to end and HR must not build its own file storage; the association between an hr.employee and files.files rows is not wired.",
    surfaces: [
      "/hr/documents",
      "HR nav — Documents",
      "HR home — Documents card",
    ],
  },
  "hr.documents.i9-register": {
    id: "hr.documents.i9-register",
    label: "The I-9 register",
    owner: "hr",
    promise:
      "Every I-9 and its reverification dates, in a register with its own access — deliberately segregated from the personnel file, so opening somebody's record never means opening their work authorization.",
    stage: "planned",
    // The two call sites are the reason this is its own entry rather than a
    // corner of `hr.documents`: both of them exist to tell somebody the I-9 is
    // NOT where they are looking. That sentence is worthless if the door it
    // offers 404s, which is exactly what both were doing — the profile
    // Documents tab and the work-authorization expiry warning.
    blockedBy:
      "The Documents pillar is not built (see hr.documents), and the register is a segregated surface inside it with its own access tier.",
    surfaces: [
      "/hr/people/[employeeId]/documents — where I-9s actually live",
      "/hr/people/[employeeId]/personal — work-authorization expiry warning",
    ],
  },
  "hr.hiring.candidate-record": {
    id: "hr.hiring.candidate-record",
    label: "Open the candidate record",
    owner: "hr",
    promise:
      "Open the candidate this hire came from — their application, interviews and offer — while keeping interview notes, self-ID and rejection history on that side of the line, where they belong.",
    stage: "planned",
    blockedBy:
      "The Hiring pillar is not built (see hr.hiring), so /hr/hiring/candidates/[id] has nothing behind it. /hr/people/new already carries the candidate id it was handed and says plainly what it could not prefill.",
    surfaces: ["/hr/people/new — convert-candidate note"],
  },
  "hr.training": {
    id: "hr.training",
    label: "Training",
    owner: "hr",
    promise:
      "Assign a course or a compliance mandate to one person or a whole group, watch completion come down from the same list, and keep certifications and their expiries where a renewal cannot be missed.",
    stage: "planned",
    blockedBy:
      "SPEC-UI-IA §3.8 routes 57–61. The directory already offers Assign training as a registered promise (hr.people.assign-training) because bulk assignment is specified there.",
    surfaces: ["/hr/training", "HR nav — Training", "HR home — Training card"],
  },
  "hr.performance": {
    id: "hr.performance",
    label: "Performance",
    owner: "hr",
    promise:
      "Run review cycles for your team — the questions, the schedule, the outcomes — through one reviews feature, never a second one bolted onto the profile.",
    stage: "planned",
    blockedBy:
      "SPEC-UI-IA §3.9 route 62. The employee's own face of this ('yours') is a /hr/me/performance surface the same lane owes; until it exists the nav gates this org-wide surface rather than offering it to everybody.",
    surfaces: [
      "/hr/performance",
      "HR nav — Performance",
      "HR home — Performance card",
    ],
  },
  "hr.assets": {
    id: "hr.assets",
    label: "Assets",
    owner: "hr",
    promise:
      "What equipment is issued to whom, what is still out on somebody who has left, and what came back — so recovery is a list, not a memory.",
    stage: "planned",
    blockedBy:
      "SPEC-UI-IA §3.10. Offboarding is where recovery is triggered from, and that pillar is not built either (see hr.onboarding).",
    surfaces: ["/hr/assets", "HR nav — Assets", "HR home — Assets card"],
  },
  "hr.engagement": {
    id: "hr.engagement",
    label: "Engagement",
    owner: "hr",
    promise:
      "Send an announcement people actually receive, run a pulse survey whose answers stay anonymous when you promised they would, and recognize somebody where their team can see it.",
    stage: "planned",
    blockedBy:
      "SPEC-UI-IA §3.10. This is the authoring side; the employee's feed is a self surface the same lane owes, which is why the nav now gates the org-wide one instead of offering it to a person with no employer.",
    surfaces: [
      "/hr/engagement",
      "HR nav — Engagement",
      "HR home — Engagement card",
    ],
  },
  "hr.reports": {
    id: "hr.reports",
    label: "Reports",
    owner: "hr",
    promise:
      "Headcount, turnover, cost and compliance reporting over the records HR already holds — as of any date, because every one of those numbers is an as-of question.",
    stage: "planned",
    blockedBy:
      "SPEC-UI-IA §3.11. Reporting reads across every pillar, so it is deliberately last: a report over half the pillars would be a number nobody could defend.",
    surfaces: ["/hr/reports", "HR nav — Reports", "HR home — Reports card"],
  },
  "hr-settings.custom-field-authoring": {
    id: "hr-settings.custom-field-authoring",
    label: "Add a custom field",
    owner: "platform-extensibility",
    promise:
      "Create an extra field on an HR record — its type, where it appears, who may see it, and whether AI may read it — and edit or archive the ones that already exist.",
    stage: "blocked",
    // The registry (`platform.custom_field_definition` / `custom_field_target`) is
    // live and route 73 READS it today. What does not exist is the platform CLIENT
    // KIT — `CustomFieldsSection`, `CustomFieldInput`, `customFieldColumns` — which
    // lane L14 owns. Building an HR-local editor would be a second renderer for one
    // shape, which is the defect the one-component law exists to prevent, and the
    // kind that is never removed once two surfaces depend on it.
    blockedBy:
      "The platform custom-field client kit (CustomFieldsSection / CustomFieldInput / customFieldColumns) is owned by lane L14 and does not exist yet; HR must not fork a competing editor.",
    surfaces: ["/hr/settings/fields — Add a custom field"],
  },
  "commerce.store-connect-oauth": {
    id: "commerce.store-connect-oauth",
    label: "Connect eBay store",
    owner: "commerce-review",
    promise:
      "Authorize your eBay store so listings, orders and inventory sync into the commerce pipeline.",
    stage: "building",
    // W11 ships the connect flow's UI shell; W6 of the ebay-store-management
    // build owns the OAuth routes (authorize redirect + callback + the
    // account-deletion endpoint) that fill it. Until those land, the Connect
    // button is an honest tracked promise, not a dead click.
    blockedBy:
      "W6's eBay OAuth routes (authorize + callback) are in flight on the aidream side (common-docs/projects/ebay-store-management/BUILD.md).",
    surfaces: ["/commerce/stores/connect — Connect eBay store"],
  },
};

export function getComingSoon(id: string): ComingSoonEntry | undefined {
  return COMING_SOON[id];
}

export function listComingSoon(owner?: string): ComingSoonEntry[] {
  const all = Object.values(COMING_SOON);
  return owner ? all.filter((e) => e.owner === owner) : all;
}
