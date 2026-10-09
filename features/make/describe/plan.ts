// features/make/describe/plan.ts — lane MAKE-WORKS: the guided run's plan, pure.
//
// ONE SENTENCE → ONE PLAN → ONE RUN. Champions: Notion AI "build me a workspace" (a whole page over
// real databases) and Airtable's AI app builder (tables, views, forms from one prompt). The /make box
// used to send every sentence to the template builder, so "an agency OS with a dashboard and a 90-day
// plan" came back as a few bare tables and nothing to open. The plan routes each sentence to the door
// that can actually build it:
//   · "data"  — tables, forms, a booking page, views: mandate make.describe_template → install door;
//   · "page"  — a workspace / plan / wiki: mandate spaces.build (a Space with real tables and sub-pages);
//   · "both"  — a workspace that also needs forms or a booking page: the Space first, then the template
//               builder REUSING the Space's tables (its reuse rule binds them; never a second copy).
// Nothing here calls a model: the route is read from the words, instantly, so the person sees the plan
// before the first token.

export type MakeRoute = "data" | "page" | "both";

/** Words that ask for a page-shaped result: a home, a plan, a wiki — something to open and read. */
const PAGE_WORDS = [
  /\b(os|operating system)\b/,
  /\bworkspaces?\b/,
  /\bhub\b/,
  /\bwiki\b/,
  /\bhandbook\b/,
  /\bplaybook\b/,
  /\b(sops?|standard operating procedures?)\b/,
  /\broad ?map\b/,
  /\b\d+[- ]?(day|week|month)s? plan\b/,
  /\b(business|marketing|launch|project|content|growth|strategic|strategy) plan\b/,
  /\bdashboards?\b/,
  /\b(home|landing|overview|command) (page|center|centre)\b/,
  /\bknowledge base\b/,
  /\bnotes? (page|space)\b/,
  /\bmeeting notes\b/,
];

/** What the sentence needs only the template builder can make (a Space has no forms or bookings). */
const TEMPLATE_ONLY = [/\bforms?\b/, /\bintake\b/, /\bbook(ing|ings)?\b/, /\bappointments?\b/, /\bsign[- ]?ups?\b/, /\bportal\b/];

export interface MakePlan {
  route: MakeRoute;
  /** The steps the person sees, in order, before anything runs. */
  steps: MakeStepId[];
}

export type MakeStepId = "space" | "design" | "check" | "build" | "open";

/** The step words — layout, ≤ 30 chars each. */
export const STEP_WORDS: Record<MakeStepId, string> = {
  space: "Building your workspace",
  design: "Designing tables and forms",
  check: "Checking the design",
  build: "Creating everything",
  open: "Ready to open",
};

function hits(patterns: RegExp[], text: string): number {
  return patterns.filter((p) => p.test(text)).length;
}

/** Read the route from the words. A page word routes to Spaces; a form or booking alongside it adds the template step. */
export function planFor(sentence: string): MakePlan {
  const text = sentence.toLowerCase();
  const page = hits(PAGE_WORDS, text);
  const templateOnly = hits(TEMPLATE_ONLY, text);
  const route: MakeRoute = page === 0 ? "data" : templateOnly > 0 ? "both" : "page";
  const steps: MakeStepId[] =
    route === "data" ? ["design", "check", "build", "open"] : route === "page" ? ["space", "open"] : ["space", "design", "check", "build", "open"];
  return { route, steps };
}

/** Things that happen on a date — a reminder before them is the follow-up people ask for. */
const DATED = /\b(posts?|calendar|appointments?|visits?|bookings?|calls?|meetings?|events?|deadlines?|due|pto|time off|leave|shifts?|sessions?|classes|renewals?|follow[- ]?ups?)\b/i;

/** One made thing, as much of it as the follow-ups read. */
export interface MadeLike {
  kind: string;
  title?: string | null;
  ref?: string;
}

/**
 * ONE-LINE FOLLOW-UPS: what a person most often asks next, offered as a sentence the box runs as-is
 * (the template builder reuses what exists, so a follow-up extends, never duplicates). At most three,
 * and never one for something already made.
 */
export function followUpsFor(sentence: string, route: MakeRoute, made: MadeLike[]): string[] {
  const text = sentence.toLowerCase();
  const kinds = new Set(made.map((m) => m.kind));
  const titles = made.map((m) => (m.title ?? m.ref ?? "").toLowerCase()).join(" | ");
  const out: string[] = [];
  // A dated thing (a post, a visit, time off, a deadline) gets the one reminder people ask for next: the template builder
  // installs it as a store automation (date arrives, N days before → tell me).
  const dated = made.find((m) => m.kind === "table" && DATED.test(`${m.title ?? ""}`));
  if (route !== "page" && dated && !/\bremind/.test(text)) {
    const thing = (dated.title ?? "item").toLowerCase().replace(/ies$/, "y").replace(/s$/, "");
    out.push(`Remind me 2 days before each ${thing}`);
  }
  const people = /\bclients?\b|\bcustomers?\b|\bpatients?\b|\bmembers?\b/.exec(`${text} ${titles}`)?.[0]?.replace(/s$/, "");
  if (people && !kinds.has("portal")) out.push(`Add a ${people} portal`);
  if (!kinds.has("form") && !/\bforms?\b/.test(text)) out.push(people ? `Add an intake form for new ${people}s` : "Add a form to add new entries");
  if (!kinds.has("booking") && !/\bbook/.test(text) && /\bclients?\b|\bcalls?\b|\bmeetings?\b|\bleads?\b|\bpatients?\b/.test(`${text} ${titles}`))
    out.push("Add a booking page for calls");
  if (route !== "data" && !/\bdashboard\b/.test(text)) out.push("Add a dashboard with the key numbers");
  return out.slice(0, 3);
}
