// features/auth/components/module-landing/landings/MasterworkLanding.tsx
//
// Public marketing landing for Masterwork — served to guests at /masterwork
// (signed-in users get the Masterwork home instead). The spine, in the
// Expert's language: you talk → rules you approve → a system that works
// exactly your way → proof against plain AI. Zero jargon: no "workflow",
// no "prompt", no "agent slot".

import {
  BadgeCheck,
  BookOpen,
  Gauge,
  MessageCircle,
  Scale,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import {
  ModuleLanding,
  type ModuleCapability,
  type ModuleStep,
  type ModuleSubArea,
} from "../ModuleLanding";

const CAPABILITIES: ModuleCapability[] = [
  {
    icon: MessageCircle,
    title: "Start by talking",
    description:
      "An interviewer draws your method out of you in plain conversation — or reads your documents and best finished work. You never write a line of anything technical.",
  },
  {
    icon: BadgeCheck,
    title: "Rules you approve",
    description:
      "Everything you say becomes written rules in your own words. Nothing goes live until you approve it, line by line — approve, correct, or reject each one.",
  },
  {
    icon: BookOpen,
    title: "Your Rulebook, versioned",
    description:
      "Your judgment lives in one place you can read and edit forever. Every change is tracked, every version is kept, and every verdict cites the exact rule behind it.",
  },
  {
    icon: Sparkles,
    title: "Built into a working system",
    description:
      "One click builds a Masterwork from your Rulebook — a system that does the work the way you would, checked against your rules on every run.",
  },
  {
    icon: Scale,
    title: "Proof, not promises",
    description:
      "The Audition puts your Masterwork head-to-head against plain AI on the same task and scores both — so you can see, not hope, that your way wins.",
  },
  {
    icon: Users,
    title: "Share it, keep control",
    description:
      "Release a Masterwork and your team runs your judgment on demand — while the rules stay yours to change, and every run stays accountable to them.",
  },
];

const STEPS: ModuleStep[] = [
  {
    number: "01",
    title: "Talk",
    description:
      "Have a conversation about how you work — or hand over the documents and finished work that show it.",
  },
  {
    number: "02",
    title: "Approve your rules",
    description:
      "Read what the system heard, in your words. Approve what's right, correct what's off, reject what's wrong.",
  },
  {
    number: "03",
    title: "Build your Masterwork",
    description:
      "One click turns the approved Rulebook into a working system that follows it exactly.",
  },
  {
    number: "04",
    title: "Prove it",
    description:
      "Run the Audition against plain AI, watch the score, and release it for others to run.",
  },
];

const SUB_AREAS: ModuleSubArea[] = [
  {
    title: "Masterwork Studio",
    status: "Live",
    items: [
      "Your Rulebooks with review progress at a glance",
      "A guided start — four plain questions, then your preferred way in",
      "The Final Checkup: suggested fixes you approve or dismiss in seconds",
      "Everything you ever said, kept and openable — your words, on record",
    ],
  },
  {
    title: "Encore",
    status: "Live",
    items: [
      "Every released Masterwork you can reach, one click to run",
      "Made for the person running it — no settings, no jargon",
      "Your own run history on every Masterwork",
      "The expert behind each one, a click away",
    ],
  },
  {
    title: "The Audition",
    status: "Live",
    items: [
      "Your Masterwork vs. plain AI on the same task",
      "A quality score you can track over time",
      "Every verdict cites the exact rule it applied",
      "Run it any time your rules change",
    ],
  },
  {
    title: "Always improving",
    status: "Live",
    items: [
      "The specialists doing the work are under standing review",
      "Real sessions are re-read on a schedule",
      "Improvements found in review are applied as tracked revisions",
      "Your feedback in the Studio feeds the reviews",
    ],
  },
];

export default function MasterworkLanding() {
  return (
    <ModuleLanding
      surfaceId="landing:masterwork"
      eyebrow="AI Matrx Masterwork"
      eyebrowIcon={ShieldCheck}
      headline="Your expertise, working"
      headlineGradient="exactly your way."
      description="You're world-class at something. Masterwork turns that judgment into written rules you approve — then builds them into a system anyone can run, proven side-by-side against plain AI. You talk; it becomes reliable, reusable, and accountable."
      primaryCtaHref="/sign-up?source=masterwork-landing"
      primaryCtaLabel="Start Free"
      workspaceHref="/masterwork"
      workspaceLabel="Masterwork"
      capabilitiesHeading="From what you know to what it does"
      capabilitiesDescription="No code, no prompts, no technical anything — your knowledge becomes a system through conversation and approval."
      capabilities={CAPABILITIES}
      stepsDescription="Four steps from a conversation to a proven system."
      steps={STEPS}
      subAreasHeading="What's inside"
      subAreasDescription="A studio for the expert, a stage for everyone else, and proof in between."
      subAreas={SUB_AREAS}
      finalCtaHeading="Stop repeating yourself"
      finalCtaDescription="Say it once, approve the rules, and let your judgment do the work — for you, your team, and everyone you choose to share it with."
      relatedModules={["/agents", "/chat", "/notes"]}
    />
  );
}
