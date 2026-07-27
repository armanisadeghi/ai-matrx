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
  "marketing.rank-tracking": {
    id: "marketing.rank-tracking",
    label: "Rank Tracking (cross-site)",
    owner: "marketing",
    promise:
      "Track rank movement across every brand and site in one view with alerts — today ranks only exist per site under a brand.",
    stage: "planned",
    surfaces: ["/marketing hub card", "/marketing/ranks route"],
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
};

export function getComingSoon(id: string): ComingSoonEntry | undefined {
  return COMING_SOON[id];
}

export function listComingSoon(owner?: string): ComingSoonEntry[] {
  const all = Object.values(COMING_SOON);
  return owner ? all.filter((e) => e.owner === owner) : all;
}
