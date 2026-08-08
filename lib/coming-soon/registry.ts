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
  "marketing.campaigns": {
    id: "marketing.campaigns",
    label: "Campaigns",
    owner: "marketing",
    promise:
      "Group content, social, email, ads, and outreach under one goal with shared budget, timeline, and attribution — the container every channel reports into.",
    stage: "planned",
    surfaces: ["/marketing/campaigns hub card", "/marketing/campaigns route"],
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
      "Define segments, ICPs, and personas once so every brief, campaign, and agent writes for a named audience instead of a guess.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/audience route"],
  },
  "marketing.local": {
    id: "marketing.local",
    label: "Local & Listings",
    owner: "marketing",
    promise:
      "Manage Google Business Profiles, directory listings, review responses, and map-pack rank for every physical location of a brand.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/local route"],
  },
  "marketing.ai-visibility": {
    id: "marketing.ai-visibility",
    label: "AI Visibility",
    owner: "marketing",
    promise:
      "Monitor whether AI assistants cite your brand: prompt-set tracking, share of answer, competitor mentions, and the source gaps that cause omissions.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/ai-visibility route"],
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
  "marketing.email": {
    id: "marketing.email",
    label: "Email Marketing",
    owner: "marketing",
    promise:
      "Build lists, send broadcasts, run lifecycle automation, and watch deliverability health per brand.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/email route"],
  },
  "marketing.ads": {
    id: "marketing.ads",
    label: "Paid Ads",
    owner: "marketing",
    promise:
      "Pull Google, Meta, and LinkedIn spend into one place with creative, keyword, and ROAS rollups against each campaign.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/ads route"],
  },
  "marketing.outreach": {
    id: "marketing.outreach",
    label: "Outreach",
    owner: "marketing",
    promise:
      "Prospect link and PR targets, run sequenced contact, and track earned placements back to the pages they point at.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/outreach route"],
  },
  "marketing.competitors": {
    id: "marketing.competitors",
    label: "Competitors",
    owner: "marketing",
    promise:
      "Track named rivals for share of voice, keyword and content gaps, backlink velocity, and week-over-week movement.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/competitors route"],
  },
  "marketing.monitoring": {
    id: "marketing.monitoring",
    label: "Brand Monitoring",
    owner: "marketing",
    promise:
      "Watch mentions, reviews, and sentiment across the web for every brand, with alerting when something moves.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/monitoring route"],
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
  "marketing.reports": {
    id: "marketing.reports",
    label: "Client Reports",
    owner: "marketing",
    promise:
      "Assemble scheduled, branded, client-ready reports from live marketing data — the deliverable an agency actually sends.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/reports route"],
  },
  "marketing.automations": {
    id: "marketing.automations",
    label: "Marketing Automations",
    owner: "marketing",
    promise:
      "Run trigger-based marketing workflows: on a new crawl finding, on a rank drop, on a brand mention, on a published page.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/automations route"],
  },
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
};

export function getComingSoon(id: string): ComingSoonEntry | undefined {
  return COMING_SOON[id];
}

export function listComingSoon(owner?: string): ComingSoonEntry[] {
  const all = Object.values(COMING_SOON);
  return owner ? all.filter((e) => e.owner === owner) : all;
}
