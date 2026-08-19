export type BillingCycle = "monthly" | "annual";

export type PlanCategory = "free" | "individual" | "company" | "enterprise";

export type PlanFeature = {
  label: string;
  detail?: string;
  included: boolean;
  highlight?: boolean;
};

export type Plan = {
  id: string;
  name: string;
  category: PlanCategory;
  tagline: string;
  monthly: number | null;
  annual: number | null;
  priceLabel?: string;
  priceSuffix?: string;
  seatLabel?: string;
  cta: string;
  ctaHref?: string;
  badge?: string;
  recommended?: boolean;
  features: PlanFeature[];
  meta?: string;
};

export const ANNUAL_DISCOUNT = 0.2;

export const TRIAL_DAYS = 14;

export const PLAN_CATEGORIES: Record<
  PlanCategory,
  { label: string; description: string }
> = {
  free: {
    label: "Free",
    description: "Try the harness with strict limits.",
  },
  individual: {
    label: "Individual",
    description: "For builders, founders, and power users.",
  },
  company: {
    label: "Company",
    description: "For teams running production agents.",
  },
  enterprise: {
    label: "Enterprise",
    description: "For 20+ seats, audit, SSO, and procurement.",
  },
};

const annualMonthly = (monthly: number) =>
  Math.round(monthly * (1 - ANNUAL_DISCOUNT));

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    category: "free",
    tagline: "Kick the tires. No credit card.",
    monthly: 0,
    annual: 0,
    cta: "Start free",
    features: [
      { label: "1 active agent", included: true },
      { label: "100 messages / month", included: true },
      { label: "Public models only", included: true, detail: "Haiku-class" },
      { label: "Community support", included: true },
      { label: "Tool execution", included: false },
      { label: "Workspace memory", included: false },
      { label: "Audit trail", included: false },
    ],
  },
  {
    id: "entry",
    name: "Entry",
    category: "individual",
    tagline: "Step into the harness.",
    monthly: 19,
    annual: annualMonthly(19),
    cta: "Start 14-day trial",
    features: [
      { label: "5 active agents", included: true },
      { label: "5,000 messages / month", included: true },
      { label: "Sonnet-class models", included: true, highlight: true },
      { label: "Tool execution (10/run)", included: true },
      { label: "1 GB workspace memory", included: true },
      { label: "Email support", included: true },
      { label: "Audit trail", included: false },
    ],
  },
  {
    id: "pro",
    name: "Pro",
    category: "individual",
    tagline: "What most builders pick.",
    monthly: 49,
    annual: annualMonthly(49),
    cta: "Start 14-day trial",
    badge: "Most popular",
    recommended: true,
    features: [
      { label: "20 active agents", included: true },
      { label: "25,000 messages / month", included: true },
      { label: "All frontier models", included: true, highlight: true },
      { label: "Tool execution (unlimited)", included: true },
      { label: "10 GB workspace memory", included: true },
      { label: "Custom system prompts & shortcuts", included: true },
      { label: "Priority email support", included: true },
    ],
  },
  {
    id: "plus",
    name: "Plus",
    category: "individual",
    tagline: "When one Pro seat isn't enough.",
    monthly: 99,
    annual: annualMonthly(99),
    cta: "Start 14-day trial",
    features: [
      { label: "50 active agents", included: true },
      { label: "75,000 messages / month", included: true },
      { label: "All frontier models", included: true },
      { label: "Reasoning + critic loops", included: true, highlight: true },
      { label: "50 GB workspace memory", included: true },
      { label: "Replayable trajectories", included: true },
      { label: "Live chat support", included: true },
    ],
  },
  {
    id: "max",
    name: "Max",
    category: "individual",
    tagline: "Maxed out, single seat.",
    monthly: 199,
    annual: annualMonthly(199),
    cta: "Start 14-day trial",
    features: [
      { label: "Unlimited agents", included: true },
      { label: "250,000 messages / month", included: true },
      { label: "All frontier models", included: true },
      { label: "Highest tier reasoning", included: true, highlight: true },
      { label: "250 GB workspace memory", included: true },
      { label: "Sandbox & long-running tasks", included: true },
      { label: "Priority routing on capacity", included: true },
    ],
  },
  {
    id: "team",
    name: "Team",
    category: "company",
    tagline: "Ship together. Min 3 seats.",
    monthly: 39,
    annual: annualMonthly(39),
    seatLabel: "per seat / month",
    cta: "Start team trial",
    meta: "3 seat minimum",
    features: [
      { label: "Shared workspaces", included: true },
      { label: "10,000 messages per seat", included: true },
      { label: "All frontier models", included: true },
      { label: "Role-based access", included: true },
      { label: "Shared agents & shortcuts", included: true, highlight: true },
      { label: "Tool execution (unlimited)", included: true },
      { label: "Centralized billing", included: true },
    ],
  },
  {
    id: "company-pro",
    name: "Pro",
    category: "company",
    tagline: "For teams running production agents.",
    monthly: 79,
    annual: annualMonthly(79),
    seatLabel: "per seat / month",
    cta: "Start team trial",
    badge: "Best for teams",
    recommended: true,
    meta: "3 seat minimum",
    features: [
      { label: "Everything in Team", included: true },
      { label: "30,000 messages per seat", included: true },
      { label: "Reasoning + critic loops", included: true },
      { label: "Org-level memory & Knowledge", included: true, highlight: true },
      { label: "Replayable trajectories", included: true },
      { label: "SSO (Google, Microsoft)", included: true },
      { label: "Slack & Teams integration", included: true },
    ],
  },
  {
    id: "premium",
    name: "Premium",
    category: "company",
    tagline: "Production scale, every safeguard on.",
    monthly: 149,
    annual: annualMonthly(149),
    seatLabel: "per seat / month",
    cta: "Talk to sales",
    meta: "3 seat minimum",
    features: [
      { label: "Everything in Pro", included: true },
      { label: "Unlimited messages", included: true },
      { label: "Sandboxed tools & long tasks", included: true },
      { label: "SAML SSO + SCIM", included: true },
      { label: "Audit log export", included: true, highlight: true },
      { label: "Custom retention policy", included: true },
      { label: "Dedicated success engineer", included: true },
    ],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    category: "enterprise",
    tagline: "20+ seats, custom controls, signed agreements.",
    monthly: null,
    annual: null,
    priceLabel: "Custom",
    cta: "Request a quote",
    meta: "20 seat minimum",
    features: [
      { label: "Everything in Premium", included: true },
      { label: "Custom volume pricing", included: true },
      { label: "Self-hosted or VPC option", included: true, highlight: true },
      { label: "Procurement, MSA, redlines", included: true },
      { label: "Custom DPA & SOC reports", included: true },
      { label: "Dedicated infra & SLAs", included: true },
      { label: "Named account team", included: true },
    ],
  },
];

export const getPlan = (id: string) => PLANS.find((p) => p.id === id);

export const getPlansByCategory = (category: PlanCategory) =>
  PLANS.filter((p) => p.category === category);

export const formatPrice = (
  plan: Plan,
  cycle: BillingCycle,
): { value: string; suffix: string } => {
  if (plan.priceLabel) return { value: plan.priceLabel, suffix: "" };
  const v = cycle === "annual" ? plan.annual : plan.monthly;
  if (v == null) return { value: "—", suffix: "" };
  if (v === 0) return { value: "$0", suffix: "" };
  return {
    value: `$${v}`,
    suffix: plan.seatLabel ?? "per month",
  };
};
