// features/spaces/store/seed.ts — "The Traveling SMM™ OS" sample, added on request by store/sample.ts.
//
// The acceptance Space ("The Traveling SMM™ OS", rebuilt from Arman's three reference screenshots) and
// one sub-Space for every page link in it, each with a little realistic working content. The four chart
// rings and the client database are `database` blocks over the agency sample (data/agency-spec.ts).

import type { RichSpan, SpaceBlock, SpaceColor, SpaceDoc, SpaceMedia } from "../contract";
import { spread } from "./position";
import { AGENCY_SAMPLE_ID, sampleTable, type ChartSettings, type SpaceDbView } from "../data/sources";

const bid = () => crypto.randomUUID();

const t = (text: string, marks: Omit<RichSpan, "text"> = {}): RichSpan => ({ text, ...marks });
const spans = (s: string | RichSpan[]): RichSpan[] => (typeof s === "string" ? (s ? [t(s)] : []) : s);

export const b = {
  text: (s: string | RichSpan[] = "", color?: SpaceColor): SpaceBlock => ({ id: bid(), type: "text", text: spans(s), color }),
  h1: (s: string | RichSpan[]): SpaceBlock => ({ id: bid(), type: "heading", text: spans(s), props: { level: 1 } }),
  h2: (s: string | RichSpan[], background?: SpaceColor): SpaceBlock => ({ id: bid(), type: "heading", text: spans(s), background, props: { level: 2 } }),
  h3: (s: string | RichSpan[]): SpaceBlock => ({ id: bid(), type: "heading", text: spans(s), props: { level: 3 } }),
  /** Notion's "Toggle heading 3": a heading that folds its children. */
  toggleH3: (s: string | RichSpan[], children: SpaceBlock[] = []): SpaceBlock => ({ id: bid(), type: "heading", text: spans(s), props: { level: 3, toggleable: true }, children }),
  bullet: (s: string | RichSpan[], children?: SpaceBlock[]): SpaceBlock => ({ id: bid(), type: "bulleted", text: spans(s), children }),
  numbered: (s: string | RichSpan[]): SpaceBlock => ({ id: bid(), type: "numbered", text: spans(s) }),
  todo: (s: string | RichSpan[], checked = false, color?: SpaceColor, children?: SpaceBlock[]): SpaceBlock => ({
    id: bid(),
    type: "todo",
    text: spans(s),
    color,
    props: { checked },
    children,
  }),
  toggle: (s: string | RichSpan[], children: SpaceBlock[] = []): SpaceBlock => ({ id: bid(), type: "toggle", text: spans(s), children }),
  quote: (s: string | RichSpan[]): SpaceBlock => ({ id: bid(), type: "quote", text: spans(s) }),
  divider: (): SpaceBlock => ({ id: bid(), type: "divider" }),
  callout: (s: string | RichSpan[], children: SpaceBlock[] = [], icon = "", background?: SpaceColor): SpaceBlock => ({
    id: bid(),
    type: "callout",
    text: spans(s),
    background,
    props: { icon },
    children,
  }),
  page: (spaceId: string, color?: SpaceColor, background?: SpaceColor): SpaceBlock => ({ id: bid(), type: "page", color, background, props: { spaceId } }),
  columns: (...cols: Array<{ width: number; blocks: SpaceBlock[] }>): SpaceBlock => ({
    id: bid(),
    type: "columnList",
    children: cols.map((c) => ({ id: bid(), type: "column", props: { width: c.width }, children: c.blocks })),
  }),
  slot: (label: string, height: number): SpaceBlock => ({ id: bid(), type: "slot", props: { label, height } }),
  /** A linked view of one agency-sample table (Notion's inline database / chart tile). */
  database: (token: string, views: SpaceDbView[], extra: Record<string, unknown> = {}): SpaceBlock => {
    const table = sampleTable(token);
    return {
      id: bid(),
      type: "database",
      props: { source: { kind: "table", tableId: table.id }, inline: true, title: table.name, sample: AGENCY_SAMPLE_ID, linked: true, showTitle: false, views, activeViewId: views[0].id, ...extra },
    };
  },
  ring: (token: string, name: string, icon: string, chart: ChartSettings): SpaceBlock =>
    b.database(token, [{ id: "view-ring", name, icon, layout: "chart", chart: { centerValue: true, ...chart } }]),
};

/** The four chart rings' view names, as the page's owner typed them (in capitals). */
export const RING_NAMES: Record<string, string> = {
  "Active clients": "ACTIVE CLIENTS",
  "Client wins": "CLIENT WINS",
  "Avg NPS score": "AVG NPS SCORE",
  "YTD tasks completed": "YTD TASKS COMPLETED",
};

/** The page's cover and icon: a warm landscape and a portrait, from the bundled gallery (page/gallery.ts). */
export const SAMPLE_COVER = { url: "gallery:photo-golden-palms", offsetY: 62 };
export const SAMPLE_ICON = { url: "gallery:portrait-founder" };
/** The page's two columns, measured on the reference: 348px beside 1070px. */
export const SAMPLE_COLUMNS = [0.245, 0.755] as const;

/** The four chart rings of the acceptance page (Active clients, Client wins, Avg NPS score, YTD tasks). */
export function sampleRings(): SpaceBlock {
  return b.columns(
      { width: 0.25, blocks: [b.ring("client", RING_NAMES["Active clients"], "Users", { type: "donut", groupBy: "status", op: "count" })] },
      { width: 0.25, blocks: [b.ring("client_win", RING_NAMES["Client wins"], "Trophy", { type: "donut", groupBy: "kind", op: "count" })] },
      { width: 0.25, blocks: [b.ring("nps_survey", RING_NAMES["Avg NPS score"], "Gauge", { type: "donut", groupBy: "score", op: "avg", field: "score" })] },
      { width: 0.25, blocks: [b.ring("task", RING_NAMES["YTD tasks completed"], "ListChecks", { type: "donut", groupBy: "task", op: "count" })] },
    );
}

/** The screenshot's client database shows five properties; the reverse links (surveys, wins, tasks) are hidden. */
export const SAMPLE_CLIENT_HIDDEN = ["linked:nps_survey__client", "linked:client_win__client", "linked:task__client"];

/** The linked client database of the acceptance page. */
export function sampleClientsDatabase(): SpaceBlock {
  return b.database("client", [{ id: "view-all", name: "All", icon: "Users", layout: "grid", hiddenFields: SAMPLE_CLIENT_HIDDEN }]);
}

interface PageSeed {
  key: string;
  title: string;
  icon: string;
  blocks?: SpaceBlock[];
}

export const SEED_ROOT_ID = "seed-traveling-smm-os";
const ROOT = "traveling-smm-os";

/** Sections of the left column: heading, then the links in its box. */
const SECTIONS: Array<{ heading: string; pages: PageSeed[] }> = [
  {
    heading: "CLIENTS",
    pages: [
      { key: "clients-os", title: "Clients OS", icon: "UserRound" },
      { key: "nps-surveys", title: "NPS Surveys", icon: "ChartColumn" },
      { key: "client-wins", title: "Client Wins", icon: "Trophy" },
    ],
  },
  {
    heading: "FULFILLMENT",
    pages: [
      { key: "fulfillment-funnel-os", title: "Fulfillment Funnel OS", icon: "BadgeCheck" },
      { key: "fulfillment-interface", title: "Fulfillment Interface", icon: "ChartColumn" },
      { key: "sop-library", title: "SOP Library", icon: "SearchCheck" },
    ],
  },
  {
    heading: "TEAM BOARDS",
    pages: [
      { key: "cora", title: "CORA", icon: "Crown" },
      { key: "cora-organic", title: "Cora · Organic Instagram Strategist", icon: "Camera" },
      { key: "darlene", title: "Darlene · Social Media Manager / Assistant", icon: "Megaphone" },
      { key: "zunayed", title: "Zunayed · Editing Powerhouse", icon: "Clapperboard" },
      { key: "csm", title: "Client Success Manager", icon: "BadgeCheck" },
      { key: "ea", title: "Executive Assistant", icon: "Smile" },
      { key: "shot-lists", title: "Client Shot Lists", icon: "Video" },
      { key: "ghl-partner", title: "GHL Partner", icon: "SquareArrowOutUpRight" },
      { key: "data-entry", title: "Data Entry", icon: "ChartArea" },
    ],
  },
  {
    heading: "MOMENTUM CAMPAIGN",
    pages: [
      { key: "momentum-os", title: "Momentum OS", icon: "CircleAlert" },
      { key: "momentum-interface", title: "Momentum Interface", icon: "ChartColumn" },
    ],
  },
  {
    heading: "APPT SETTING",
    pages: [
      { key: "leads-os", title: "Leads OS", icon: "Users" },
      { key: "leads-interface", title: "Leads Interface", icon: "ChartColumn" },
    ],
  },
  {
    heading: "SALES",
    pages: [
      { key: "sales-os", title: "Sales OS", icon: "Phone" },
      { key: "sales-interface", title: "Sales Interface", icon: "ChartColumn" },
    ],
  },
  {
    heading: "ADS REPORTING",
    pages: [
      { key: "authority-funnel-os", title: "Cora Authority Funnel OS", icon: "Target" },
      { key: "authority-funnel-interface", title: "Authority Funnel Interface", icon: "ChartColumn" },
    ],
  },
  {
    heading: "ORGANIC + ADS",
    pages: [
      { key: "internal-marketing-os", title: "Internal MarketingOS", icon: "Apple" },
      { key: "internal-marketing-interface", title: "Internal Marketing Interface", icon: "ChartColumn" },
    ],
  },
  {
    heading: "OUTBOUND",
    pages: [
      { key: "outbound-os", title: "Outbound OS", icon: "MailOpen" },
      { key: "outbound-interface", title: "Outbound Interface", icon: "ChartColumn" },
    ],
  },
  { heading: "HIRING", pages: [{ key: "hiring-os", title: "Hiring OS", icon: "Rocket" }] },
  {
    heading: "FINANCES",
    pages: [
      { key: "financial-os", title: "FinancialOS", icon: "Wallet" },
      { key: "finance-interface", title: "Finance Interface", icon: "ChartColumn" },
    ],
  },
  {
    heading: "COMPANY BOARD",
    pages: [
      { key: "offers", title: "Offers", icon: "BadgeCheck" },
      { key: "brand", title: "Brand", icon: "Crown" },
    ],
  },
  { heading: "MAP", pages: [{ key: "map", title: "Map (do not delete)", icon: "Map" }] },
];

const PLAN_PAGES: PageSeed[] = [
  { key: "wins-won", title: "Wins WON", icon: "" },
  { key: "notes", title: "Notes", icon: "" },
  { key: "spanish", title: "Spanish", icon: "" },
  { key: "livemeta", title: "LiveMeta", icon: "" },
  { key: "cora-series-scripts", title: "Cora Series Scripts", icon: "" },
];

const CHECKLIST: PageSeed = { key: "implementation-checklist", title: "IMPLEMENTATION CHECKLIST", icon: "ListChecks" };
const PLAN: PageSeed = { key: "90-day-plan", title: "90 Day Plan", icon: "CalendarRange" };

/** Working content for a sub-Space: what an agency owner would actually keep there. */
function bodyFor(page: PageSeed): SpaceBlock[] {
  const t0 = page.title.replace(/ ·.*$/, "");
  if (page.title.endsWith("Interface")) {
    return [
      b.text(`The dashboard view of ${t0.replace(" Interface", "")}: numbers first, then the work queue.`),
      b.h2("This week"),
      b.todo("Review last week's numbers with the team"),
      b.todo("Flag anything below target in the weekly sync"),
      b.todo("Export the summary for the client report", true),
      b.h2("Notes"),
      b.text(""),
    ];
  }
  switch (page.key) {
    case "clients-os":
      return [
        b.text("Every active client, their offer, start date and status. Onboarding steps live in each client's page."),
        b.h2("Active"),
        b.bullet("Cora | The Traveling SMM™ — Book a Call Funnel™"),
        b.bullet("Jonathon | JetQuest — Content Engine Pro™"),
        b.bullet("Viva España | Mario + Meli — VSL + Webinar Funnel™"),
        b.h2("Onboarding"),
        b.bullet("Pipe | Fitness Coaching — Content Engine Pro™"),
      ];
    case "nps-surveys":
      return [
        b.text("Send the NPS survey on day 30 and day 90 of every engagement."),
        b.numbered("Copy the survey link from the client's page"),
        b.numbered("Send it with the monthly report"),
        b.numbered("Log the score and any quote worth sharing"),
        b.quote("“The captions finally sound like me.” — Mario, Viva España"),
      ];
    case "client-wins":
      return [b.text("Screenshots and numbers worth celebrating. Add one every time a client hits a milestone."), b.bullet("JetQuest: 4 booked calls from one reel"), b.bullet("Viva España: webinar show-up rate up to 41%")];
    case "sop-library":
      return [
        b.text("How we do things, written once."),
        b.toggle("Posting checklist", [b.todo("Caption proofread"), b.todo("Hashtags from the client bank"), b.todo("Cover frame chosen")]),
        b.toggle("Monthly report", [b.text("Pull numbers on the 1st, send by the 3rd.")]),
        b.toggle("Client offboarding", [b.text("Archive the shared drive, send the final report, ask for a testimonial.")]),
      ];
    case "hiring-os":
      return [
        b.text("Open roles and the interview loop."),
        b.h2("Open roles"),
        b.bullet("Short-form video editor (part time)"),
        b.bullet("Appointment setter (commission)"),
        b.h2("Loop"),
        b.numbered("Paid test task"),
        b.numbered("30-minute call"),
        b.numbered("Two-week trial"),
      ];
    case "map":
      return [b.callout("This page links every system in the OS. Do not delete or move it.", [], "TriangleAlert", "red"), b.page(ROOT)];
    case CHECKLIST.key:
      return [
        b.text("Work through these in order the first month."),
        b.todo("Duplicate the OS into the client workspace", true),
        b.todo("Fill in the Offers page", true),
        b.todo("Connect the lead form to Leads OS"),
        b.todo("Record the welcome Loom"),
        b.todo("Book the 30-day review"),
      ];
    case PLAN.key:
      return [b.text("Three months, one focus per month."), b.h2("Month 1 — Systems"), b.h2("Month 2 — Content"), b.h2("Month 3 — Scale")];
    case "wins-won":
      return [b.text("A running list of wins for the end-of-quarter recap.")];
    case "spanish":
      return [b.text("Thirty minutes a day before client calls."), b.todo("Lesson 12 — past tense"), b.todo("Voice note practice with Meli")];
    default:
      return [b.text(`${page.title}: owner, weekly cadence and the current focus.`), b.h2("Current focus"), b.todo("Write the one-page brief"), b.todo("Agree the weekly check-in time"), b.h2("Links"), b.text("")];
  }
}

const icon = (name: string): SpaceMedia | null => (name ? { icon: name } : null);

/** The sample as docs keyed by `seed-<key>` ids; the installer swaps in the database's real ids. */
export function seedSpaces(): SpaceDoc[] {
  const stamp = new Date(Date.now() - 37 * 60 * 1000).toISOString();
  const docs: SpaceDoc[] = [];
  const idOf = (key: string) => `seed-${key}`;
  const make = (page: PageSeed, parentId: string | null, position: string, blocks: SpaceBlock[], extra: Partial<SpaceDoc> = {}): SpaceDoc => ({
    id: idOf(page.key),
    parentId,
    position,
    title: page.title,
    icon: icon(page.icon),
    cover: null,
    settings: { font: "default", smallText: false, fullWidth: false, locked: false },
    blocks,
    isArchived: false,
    createdAt: stamp,
    updatedAt: stamp,
    updatedBy: null,
    version: 1,
    ...extra,
  });

  const children: PageSeed[] = [CHECKLIST, ...SECTIONS.flatMap((s) => s.pages), PLAN, ...PLAN_PAGES];
  const positions = spread(children.length);
  children.forEach((page, i) => docs.push(make(page, idOf(ROOT), positions[i], bodyFor(page))));

  const left: SpaceBlock[] = [
    b.divider(),
    b.page(idOf(CHECKLIST.key), "default", "gray"),
    b.divider(),
    ...SECTIONS.flatMap((s) => [
      b.h2(s.heading, "gray"),
      b.callout(
        "",
        s.pages.map((p) => b.page(idOf(p.key), p.key === "map" ? "red" : undefined)),
      ),
    ]),
  ];

  const right: SpaceBlock[] = [
    sampleRings(),
    sampleClientsDatabase(),
    b.text(""),
    b.h1([t("90 Day Plan", { link: `/spaces/${idOf(PLAN.key)}`, color: "gray" })]),
    ...PLAN_PAGES.map((p) => b.page(idOf(p.key))),
    b.text(""),
    b.h3("Scaling to $30K Months"),
    b.text(""),
    b.text(""),
    b.todo("Set up Cora's Organic Portal", false, undefined, [b.todo("Set up Cora's weekly deadlines for the strategist - like the Daily Winning Formula type thing")]),
    b.todo([t("Funnel Journey Map JetQuest (20 minutes)", { bold: true })], true, "orange"),
    b.todo([t("Send Meli the voice notes for the Viva ManyChat automations (5 minutes)", { bold: true })], true, "orange"),
    b.todo([t("Revise captions for Viva (30 minutes)", { bold: true })], false, "orange"),
    b.todo([t("JetQuest captions 4-17 (30 minutes)", { bold: true })], false, "orange"),
    b.todo("Do the caption training for Darlene"),
    b.todo("Get Metricool set up for Jonathon"),
    b.todo("Cora's content"),
    b.todo("Put the shot list system into Cora's notion"),
    b.text(""),
    b.text(""),
    b.text(""),
    b.todo("Reviewing Cora's posts"),
    b.todo("Update Darlene's daily winning formula trainings"),
    b.text(""),
    b.text(""),
    b.text(""),
    b.text("The Quote Pages (Cora, JetQuest, Viva)"),
    b.text("The reporting system (finish it for organic - monthly and quarterly)"),
    b.text([t("Claude Skills - "), t("https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills", { link: "https://docs.anthropic.com/en/docs/agents-and-tools/agent-skills" })]),
    b.text(""),
    b.text(""),
    b.text([t("Auto posting for social media: "), t("https://www.instagram.com/creators/", { link: "https://www.instagram.com/creators/" })]),
    b.text(""),
    b.toggleH3("Other To Dos", [b.todo("Renew the Metricool plan"), b.todo("Update the Offers page pricing")]),
    b.toggleH3("Gina Notes", [b.text("Gina wants a weekly Loom instead of the Friday call.")]),
    b.toggleH3("JetQuest Notes", [b.bullet("Captions 4-17 due Thursday"), b.bullet("Jonathon prefers voice notes over email")]),
    b.toggleH3("Darlene Training Project", [b.numbered("Caption formula walkthrough"), b.numbered("Daily winning formula review"), b.numbered("Shadow two client calls")]),
    b.toggleH3("Upcoming", [b.text("Pipe | Fitness Coaching kickoff on September 15.")]),
    b.toggleH3("When New Clients Onboard", [b.todo("Send the welcome packet"), b.todo("Create their page in Clients OS"), b.todo("Book the strategy call")]),
    b.toggleH3("Analytics System", [b.text("Metricool for organic, Ads Manager export for paid, both into the monthly report.")]),
    b.toggleH3("AI Process", [b.text("Draft captions with the brand voice prompt, then a human edit pass before scheduling.")]),
  ];

  const root = make({ key: ROOT, title: "The Traveling SMM™ OS", icon: "TreePalm" }, null, "i", [b.columns({ width: SAMPLE_COLUMNS[0], blocks: left }, { width: SAMPLE_COLUMNS[1], blocks: right })], {
    icon: SAMPLE_ICON,
    cover: SAMPLE_COVER,
    settings: { font: "default", smallText: false, fullWidth: true, locked: false },
  });

  return [root, ...docs];
}
