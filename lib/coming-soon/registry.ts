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
  "mandates.workflow-holder": {
    id: "mandates.workflow-holder",
    label: "Fulfil with a Workflow",
    owner: "agents",
    promise:
      "Bind a whole Workflow (not just a single agent) as the Holder that fulfils a mandate.",
    stage: "blocked",
    // The wire shape exists (agent.mandate_binding.holder_type='workflow'),
    // but aidream's resolve_mandate refuses workflow Holders this wave — a
    // stored workflow binding would break the mandate for the user. Enable
    // the moment the runtime executes workflow Holders.
    blockedBy:
      "The mandate runtime executes agent Holders only; workflow execution behind a mandate is not wired yet (aidream services/mandates).",
    surfaces: ["/agents/mandates/[mandateKey] override flow — Holder step"],
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
  "chat.add-to-docs": {
    id: "chat.add-to-docs",
    label: "Add to Docs",
    owner: "chat",
    promise:
      "Send this response straight into the document workspace without copying and pasting it by hand.",
    stage: "planned",
    surfaces: [
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
  "image-studio.edit-suggestions": {
    id: "image-studio.edit-suggestions",
    label: "AI Edit Suggestions",
    owner: "image-studio",
    promise:
      "Analyze the current image and recommend concrete edits that improve it.",
    stage: "blocked",
    blockedBy:
      "The edit-toolbar control is built, but edit suggestions are disabled in IMAGE_STUDIO_BACKEND_CAPABILITIES until the deployed endpoint is available.",
    surfaces: ["Image Studio edit toolbar"],
  },
  "image-studio.prompt-edit": {
    id: "image-studio.prompt-edit",
    label: "Prompt-based Image Editing",
    owner: "image-studio",
    promise:
      "Describe a change in plain language and apply it directly to the current image.",
    stage: "blocked",
    blockedBy:
      "The prompt-edit control is built, but prompt editing is disabled in IMAGE_STUDIO_BACKEND_CAPABILITIES until the deployed endpoint is available.",
    surfaces: ["Image Studio edit toolbar"],
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
  "image-studio.face-detection": {
    id: "image-studio.face-detection",
    label: "Detect Faces",
    owner: "image-studio",
    promise:
      "Find faces in an image so they can be obscured without locating each one by hand.",
    stage: "blocked",
    blockedBy:
      "The blur-faces control is built, but face detection is disabled in IMAGE_STUDIO_BACKEND_CAPABILITIES until the deployed endpoint is available.",
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
  "hr.period-approval-progress": {
    id: "hr.period-approval-progress",
    label: "Pay-period approval progress",
    owner: "hr",
    promise:
      "See how far this pay period is through approval — who still has timecards to approve, which exceptions are open, and what has to happen before it can be exported.",
    stage: "building",
    blockedBy:
      "The pay-period state machine and its approval view are being built alongside the export lane; export history landed first.",
    surfaces: ["/hr/time/periods/[periodId] — period header"],
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
};

export function getComingSoon(id: string): ComingSoonEntry | undefined {
  return COMING_SOON[id];
}

export function listComingSoon(owner?: string): ComingSoonEntry[] {
  const all = Object.values(COMING_SOON);
  return owner ? all.filter((e) => e.owner === owner) : all;
}
