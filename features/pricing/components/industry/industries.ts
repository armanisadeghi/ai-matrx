import {
  Briefcase,
  Code,
  GraduationCap,
  HeartPulse,
  LineChart,
  Megaphone,
  Scale,
  ShoppingBag,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";

export type IndustryId =
  | "legal"
  | "coding"
  | "medical"
  | "education"
  | "finance"
  | "ecommerce"
  | "marketing";

export type IndustryConfig = {
  id: IndustryId;
  label: string;
  eyebrow: string;
  headline: string;
  subhead: string;
  /** Recommended plan — a billing.plan plan_key from billing.plan_catalog(). */
  recommendedPlanId: string;
  /** Two-column proof points. */
  proof: { metric: string; label: string }[];
  /** Use case bullets, each with an icon. */
  useCases: { icon: LucideIcon; title: string; body: string }[];
  /** Risk-tier note that speaks to the determinism-at-edges value. */
  guardrail: string;
  /** Pull quote. */
  quote: { body: string; attribution: string };
  /** Color accent name (CSS variable on .dark/light) — kept neutral, just for tag. */
  tag: string;
  icon: LucideIcon;
};

export const INDUSTRIES: Record<IndustryId, IndustryConfig> = {
  legal: {
    id: "legal",
    label: "Legal",
    eyebrow: "For legal teams & solo practitioners",
    headline: "An associate that reads every page, cites every source, and never misses a deadline.",
    subhead:
      "Discovery review, contract redlines, motion drafting, citation checking — running inside a harness with audit trails your GC will actually approve.",
    recommendedPlanId: "company-pro",
    tag: "Legal",
    icon: Scale,
    proof: [
      { metric: "30×", label: "faster doc review on average matter" },
      { metric: "100%", label: "trajectory replay for privilege review" },
      { metric: "0", label: "hallucinated citations with strict tools" },
    ],
    useCases: [
      {
        icon: Briefcase,
        title: "Discovery & doc review",
        body: "Bulk-classify, redact, and summarize across thousands of pages with citations to source paragraphs.",
      },
      {
        icon: Scale,
        title: "Contract redlines",
        body: "Compare against your fallback positions and draft markup in your firm's voice — never a fresh agreement.",
      },
      {
        icon: Stethoscope,
        title: "Citation verification",
        body: "Every cite goes through a deterministic lookup tool. Hallucinated cases never reach the brief.",
      },
    ],
    guardrail:
      "Strict-schema tools mean the model proposes — your retrieval layer disposes. No invented Westlaw citations.",
    quote: {
      body: "We finally have an AI we can put in front of partners. The replay log is what got compliance over the line.",
      attribution: "Director of Legal Ops, AmLaw 100",
    },
  },
  coding: {
    id: "coding",
    label: "Coding",
    eyebrow: "For engineering teams & solo founders",
    headline:
      "An engineer that ships, reviews, and never forgets the architecture you wrote down on Monday.",
    subhead:
      "Multi-step refactors, full-PR reviews, on-call triage, repo-wide migrations — backed by externalized memory and reliable tools.",
    recommendedPlanId: "personal-pro",
    tag: "Coding",
    icon: Code,
    proof: [
      { metric: "10×", label: "faster on multi-file refactors" },
      { metric: "<1s", label: "to replay any production agent run" },
      { metric: "200+", label: "tools wired with strict schemas" },
    ],
    useCases: [
      {
        icon: Code,
        title: "Repo-aware refactors",
        body: "Plan, execute, and verify changes across a real working tree — with rollbacks, lints, and tests in the loop.",
      },
      {
        icon: Briefcase,
        title: "PR & code review",
        body: "Reviewer agents read the diff in context, run the tests, and post line-level feedback the team actually uses.",
      },
      {
        icon: LineChart,
        title: "On-call triage",
        body: "Logs in, hypothesis out. The agent reasons, runs queries, and writes the postmortem doc itself.",
      },
    ],
    guardrail:
      "Sandbox by default. Destructive shell commands gate through stricter tiers. The model never gets to git push --force.",
    quote: {
      body: "We replaced three brittle internal scripts with one Matrx agent and an observability dashboard our SRE actually trusts.",
      attribution: "Staff Engineer, fintech infra",
    },
  },
  medical: {
    id: "medical",
    label: "Medical",
    eyebrow: "For clinics, hospitals & researchers",
    headline:
      "A scribe, a researcher, and a triage assistant — operating under HIPAA, never on the patient.",
    subhead:
      "Chart review, intake summaries, prior-auth drafting, literature surveys. Determinism at the edges so the model proposes, your protocols decide.",
    recommendedPlanId: "company-premium",
    tag: "Medical",
    icon: Stethoscope,
    proof: [
      { metric: "HIPAA", label: "BAA available on Enterprise" },
      { metric: "12 min", label: "saved per visit on documentation" },
      { metric: "0 PHI", label: "ever leaves your VPC on self-hosted" },
    ],
    useCases: [
      {
        icon: HeartPulse,
        title: "Encounter scribing",
        body: "Real-time visit summaries that follow your template and route to the right note section in your EHR.",
      },
      {
        icon: Stethoscope,
        title: "Prior auth drafting",
        body: "Pulls relevant priors and chart facts; produces a draft that a clinician approves — never an autonomous submission.",
      },
      {
        icon: Briefcase,
        title: "Literature surveying",
        body: "Searches PubMed, follows citation chains, summarizes findings with the trajectory you can defend to IRB.",
      },
    ],
    guardrail:
      "No autonomous patient-facing actions. Every diagnosis-adjacent step routes through human-in-the-loop checkpoints.",
    quote: {
      body: "The audit trail is what unblocked our compliance review. Clinicians stay in control; the agent handles the typing.",
      attribution: "CMIO, regional health system",
    },
  },
  education: {
    id: "education",
    label: "Education",
    eyebrow: "For students, teachers & ed-tech",
    headline: "A patient tutor that explains, quizzes, and adapts — never just hands you the answer.",
    subhead:
      "Personalized tutors, study companions, grading helpers, and curriculum builders — with memory that follows the learner across sessions.",
    recommendedPlanId: "personal-entry",
    tag: "Education",
    icon: GraduationCap,
    proof: [
      { metric: "50% off", label: "for verified students with .edu" },
      { metric: "Persistent", label: "memory across sessions and topics" },
      { metric: "Free tier", label: "powerful enough for daily homework" },
    ],
    useCases: [
      {
        icon: GraduationCap,
        title: "Personalized tutors",
        body: "An agent per subject that remembers what you understood last week and what you tripped on this morning.",
      },
      {
        icon: Briefcase,
        title: "Study & exam prep",
        body: "Spaced-repetition flashcards, targeted quizzes, and cited explanations — never raw model regurgitation.",
      },
      {
        icon: LineChart,
        title: "Teacher copilots",
        body: "Lesson plans, rubric-based feedback, and progress reports drafted in your voice and your school's standards.",
      },
    ],
    guardrail:
      "Iteration beats intelligence. The tutor checks itself, asks before solving, and surfaces the work — not just the answer.",
    quote: {
      body: "My daughter went from 'just give me the answer' to actually thinking through the steps. The tutor doesn't let her cheat.",
      attribution: "Parent, university prep",
    },
  },
  finance: {
    id: "finance",
    label: "Finance",
    eyebrow: "For accounting & FP&A teams",
    headline:
      "A junior analyst that can read every invoice, reconcile every account, and show its work to your auditor.",
    subhead:
      "Month-end close, expense classification, variance analysis, audit-ready memos — with full trajectory replay for every number it touches.",
    recommendedPlanId: "company-pro",
    tag: "Finance",
    icon: LineChart,
    proof: [
      { metric: "5 days", label: "shaved off month-end close" },
      { metric: "Audit-ready", label: "trajectory log per transaction" },
      { metric: "SOC 2", label: "Type II on Premium and above" },
    ],
    useCases: [
      {
        icon: LineChart,
        title: "Reconciliation & close",
        body: "Pulls bank, ledger, and AP sources; flags exceptions; drafts the journal entries with the rationale attached.",
      },
      {
        icon: Briefcase,
        title: "Expense categorization",
        body: "Learns your chart of accounts and your team's quirks. Asks once when it doesn't know — never twice.",
      },
      {
        icon: Scale,
        title: "Audit-ready memos",
        body: "Variance commentary written in your tone, every number traceable to the agent's source step.",
      },
    ],
    guardrail:
      "No autonomous payments. Anything that moves money is a human-in-the-loop checkpoint, period.",
    quote: {
      body: "Our auditors asked for the trail. We gave them a replayable run. They had no follow-up questions.",
      attribution: "VP Finance, SaaS scale-up",
    },
  },
  ecommerce: {
    id: "ecommerce",
    label: "E-commerce",
    eyebrow: "For DTC brands & operators",
    headline:
      "A merchandiser, a CS lead, and a copywriter — running on your catalog at 2 AM.",
    subhead:
      "Product description scaling, support triage, ad-creative variants, returns automation — wired into Shopify, Klaviyo, Gorgias, and the rest of your stack.",
    recommendedPlanId: "team",
    tag: "E-commerce",
    icon: ShoppingBag,
    proof: [
      { metric: "12 hrs", label: "to produce 5,000 brand-voiced PDPs" },
      { metric: "70%", label: "first-touch CS resolution autonomously" },
      { metric: "20+", label: "native integrations on Team and above" },
    ],
    useCases: [
      {
        icon: ShoppingBag,
        title: "Catalog at scale",
        body: "Spin up brand-voiced product descriptions, alt text, and metadata across every SKU — and keep them in sync.",
      },
      {
        icon: Megaphone,
        title: "Ad creative variants",
        body: "Generate, score, and ship ad copy + image variants for Meta and TikTok with your performance data in the loop.",
      },
      {
        icon: HeartPulse,
        title: "Support triage",
        body: "Resolve WISMO, route refunds, escalate the hard ones — with order context and your tone built in.",
      },
    ],
    guardrail:
      "Refunds, replacements, and store credits route through your refund-tier limits. The model proposes; your policy disposes.",
    quote: {
      body: "We replaced two agencies and one CS hire. The harness is the part that made it boringly reliable.",
      attribution: "Founder, $40M DTC brand",
    },
  },
  marketing: {
    id: "marketing",
    label: "Marketing & SEO",
    eyebrow: "For content, growth & SEO teams",
    headline:
      "A research-grade content engine — not another article spinner.",
    subhead:
      "Topical maps, brief generation, on-brand drafts, internal linking, GSC-aware refreshes. Memory and observability so it learns your voice across thousands of pieces.",
    recommendedPlanId: "company-pro",
    tag: "Marketing",
    icon: Megaphone,
    proof: [
      { metric: "10×", label: "throughput vs. agency briefs" },
      { metric: "On-brand", label: "drafts with your style guide as memory" },
      { metric: "Replay", label: "every research path the agent took" },
    ],
    useCases: [
      {
        icon: Megaphone,
        title: "Briefs & drafts",
        body: "Topic clusters, SERP-aware briefs, then drafts that follow your style guide — not the model's defaults.",
      },
      {
        icon: LineChart,
        title: "GSC-aware refreshes",
        body: "Pulls underperforming pages, runs the diagnosis, and proposes the rewrite with the win condition spelled out.",
      },
      {
        icon: Briefcase,
        title: "Internal linking",
        body: "Site-wide linking maps that keep authority where it belongs — across thousands of pages, not just the new ones.",
      },
    ],
    guardrail:
      "Plagiarism and AI-detector checks run as deterministic tools, not vibes. The agent re-iterates until they pass.",
    quote: {
      body: "Three writers, one editor, one Matrx workspace. Output tripled. Editorial standards held.",
      attribution: "Head of Content, B2B SaaS",
    },
  },
};

export const INDUSTRY_ORDER: IndustryId[] = [
  "legal",
  "coding",
  "medical",
  "education",
  "finance",
  "ecommerce",
  "marketing",
];
