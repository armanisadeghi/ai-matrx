// features/spaces/data/agency-spec.ts — the sample agency the data blocks draw while the build runs:
// a social-media agency's Clients, NPS surveys, Client wins and Tasks. "Add the sample" installs it as real
// custom tables (data/agency-install.ts); the template gallery's preview reads it in memory (`templatePreview`).
//
// Title fields are not required: Notion's "+ New page" makes an untitled row, and so does the inline grid's.
//
// The Traveling SMM™ OS acceptance page reads it: Active clients (4), Client wins (10), Avg NPS score
// (8.6) and YTD tasks completed (355), and the client database (screenshot 1).

import type { TemplateSpec } from "@ai-matrx/records/templates";

export const AGENCY_SAMPLE_ID = "spaces-agency-sample";

/** The agency's offers — its own table, so a client's Offer Bought is a link to the offer's page
 *  (screenshot 1 draws it as the offer's page chip), not a free-text pill. */
const OFFERS = [
  { key: "o-book-a-call", name: "Book a Call Funnel™", price: 2500 },
  { key: "o-content-engine", name: "Content Engine Pro™ - 7x per week", price: 3200 },
  { key: "o-vsl-webinar", name: "VSL + Webinar Funnel™", price: 4800 },
  { key: "o-momentum", name: "Momentum Campaign™", price: 1800 },
];

const CLIENTS = [
  { key: "c-cora", name: "Cora | The Traveling SMM™", offer: OFFERS[0].key, started: "2026-01-01", status: "Active" },
  { key: "c-jetquest", name: "Jonathon | JetQuest", offer: OFFERS[1].key, started: "2026-06-09", status: "Active" },
  { key: "c-viva", name: "Viva España | Mario + Meli", offer: OFFERS[2].key, started: "2026-06-26", status: "Active" },
  { key: "c-pipe", name: "Pipe | Fitness Coaching", offer: OFFERS[1].key, started: "2026-09-15", status: "Onboarding" },
];

const NPS = [
  ["n01", "c-cora", 10, "2026-02-02"],
  ["n02", "c-cora", 9, "2026-05-04"],
  ["n03", "c-cora", 9, "2026-08-03"],
  ["n04", "c-jetquest", 8, "2026-07-07"],
  ["n05", "c-jetquest", 9, "2026-08-04"],
  ["n06", "c-jetquest", 7, "2026-09-01"],
  ["n07", "c-viva", 10, "2026-07-28"],
  ["n08", "c-viva", 8, "2026-08-25"],
  ["n09", "c-viva", 8, "2026-09-22"],
  ["n10", "c-pipe", 8, "2026-09-29"],
] as const;

const WINS = [
  ["w01", "First 10k-view reel", "c-cora", "Reach", "2026-02-14"],
  ["w02", "Booked 22 discovery calls in March", "c-cora", "Leads", "2026-03-31"],
  ["w03", "Brand deal with a luggage label", "c-cora", "Revenue", "2026-04-18"],
  ["w04", "Funnel live in 9 days", "c-jetquest", "Launch", "2026-06-18"],
  ["w05", "3.1x ROAS on the summer offer", "c-jetquest", "Revenue", "2026-07-22"],
  ["w06", "Reel shared by a travel creator", "c-jetquest", "Reach", "2026-08-09"],
  ["w07", "Webinar filled to 140 seats", "c-viva", "Leads", "2026-07-30"],
  ["w08", "Sold out the September retreat", "c-viva", "Revenue", "2026-08-28"],
  ["w09", "1,000 new followers in a week", "c-viva", "Reach", "2026-09-12"],
  ["w10", "Onboarding call booked same day", "c-pipe", "Launch", "2026-09-15"],
] as const;

const TASK_KINDS = ["Caption batch", "Reel edit", "Story set", "Carousel design", "Report", "Strategy call", "Comment sweep", "Ad refresh"];

/** 355 tasks finished this year, spread over the clients and months (each one its own named piece of work). */
function tasks() {
  return Array.from({ length: 355 }, (_, i) => {
    const client = CLIENTS[i % CLIENTS.length];
    const month = 1 + (i % 9);
    const day = 1 + ((i * 7) % 27);
    const kind = TASK_KINDS[i % TASK_KINDS.length];
    return {
      key: `t${String(i + 1).padStart(3, "0")}`,
      values: {
        task: `${kind} #${i + 1} — ${client.name.split(" |")[0]}`,
        client: client.key,
        kind,
        status: "Done",
        done_on: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      },
    };
  });
}

export const AGENCY_SPEC = {
  specVersion: 1,
  id: AGENCY_SAMPLE_ID,
  catalogueId: "T-SPACES-1",
  useCase:
    "Cora Reyes runs a small social-media agency from the road and uses this to see her clients, the wins she has delivered for them, how happy they are and the work her team has finished this year.",
  industry: "agencies_creative",
  vertical: "Social media agency",
  job: "crm_pipeline",
  audience: "organization",
  teaches: "dashboards",
  strengths: ["S4"],
  requires: ["dashboard", "field.select", "field.datetime"],
  business: {
    name: "The Traveling SMM",
    describes: "A social-media agency run from the road with a strategist, an editor and an assistant.",
    address: { line1: "14 Driftwood Row", city: "San Diego", region: "CA", postalCode: "92109", country: "US" },
    phone: "(619) 555-0148",
    website: "travelingsmm.net",
    email: "hello@travelingsmm.net",
    timezone: "America/Los_Angeles",
  },
  cleanupTag: "use-case:spaces-agency-sample",
  tables: [
    {
      token: "client",
      name: "Clients",
      labelSingular: "Client",
      labelPlural: "Clients",
      type: "entity",
      display: "grid",
      weight: "light",
      ordered: false,
      icon: "users",
      titleField: "client_name",
      describes: "Every client, the offer they bought and where they are.",
      subject: "thing",
      fields: [
        { key: "client_name", label: "Client Name", parityType: "text", sensitivity: "internal", contextPolicy: "include" },
        { key: "offer", label: "Offer Bought", parityType: "relation", sensitivity: "internal", contextPolicy: "include", relationTarget: "offer", relationMax: 1 },
        { key: "date_started", label: "Date Started", parityType: "datetime", sensitivity: "internal", contextPolicy: "include", format: "date", absoluteDates: true, historicalReason: "the sample agency's dated history, read as of 2026-10-05" },
        { key: "end_date", label: "End Date", parityType: "datetime", sensitivity: "internal", contextPolicy: "include", format: "date", absoluteDates: true, historicalReason: "the sample agency's dated history, read as of 2026-10-05" },
        {
          key: "status",
          label: "Status",
          parityType: "select",
          sensitivity: "internal",
          contextPolicy: "include",
          choices: ["Onboarding", "Active", "Paused", "Ended"],
          choiceColors: { Onboarding: "orange", Active: "green", Paused: "slate", Ended: "red" },
        },
      ],
      rows: CLIENTS.map((c) => ({ key: c.key, values: { client_name: c.name, offer: c.offer, date_started: c.started, status: c.status } })),
    },
    {
      token: "offer",
      name: "Offers",
      labelSingular: "Offer",
      labelPlural: "Offers",
      type: "entity",
      display: "grid",
      weight: "light",
      ordered: false,
      icon: "package",
      titleField: "offer_name",
      describes: "What the agency sells, and the monthly price.",
      subject: "thing",
      fields: [
        { key: "offer_name", label: "Offer", parityType: "text", sensitivity: "internal", contextPolicy: "include" },
        { key: "monthly_price", label: "Monthly price", parityType: "number", sensitivity: "internal", contextPolicy: "include", rules: [{ kind: "min", value: 0 }, { kind: "max", value: 50000 }] },
      ],
      rows: OFFERS.map((o) => ({ key: o.key, icon: "Package", values: { offer_name: o.name, monthly_price: o.price } })),
    },
    {
      token: "nps_survey",
      name: "NPS Surveys",
      labelSingular: "NPS survey",
      labelPlural: "NPS surveys",
      type: "entity",
      display: "grid",
      weight: "light",
      ordered: false,
      icon: "gauge",
      titleField: "survey",
      describes: "What each client scored the agency, month by month.",
      subject: "thing",
      fields: [
        { key: "survey", label: "Survey", parityType: "text", sensitivity: "internal", contextPolicy: "include" },
        { key: "client", label: "Client", parityType: "relation", sensitivity: "internal", contextPolicy: "include", relationTarget: "client", relationMax: 1 },
        { key: "score", label: "Score", parityType: "number", sensitivity: "internal", contextPolicy: "include", rules: [{ kind: "min", value: 0 }, { kind: "max", value: 10 }] },
        { key: "sent_on", label: "Sent", parityType: "datetime", sensitivity: "internal", contextPolicy: "include", format: "date", absoluteDates: true, historicalReason: "the sample agency's dated history, read as of 2026-10-05" },
      ],
      rows: NPS.map(([key, client, score, sent]) => ({
        key,
        values: { survey: `${CLIENTS.find((c) => c.key === client)!.name.split(" |")[0]} · ${sent.slice(0, 7)}`, client, score, sent_on: sent },
      })),
    },
    {
      token: "client_win",
      name: "Client Wins",
      labelSingular: "Client win",
      labelPlural: "Client wins",
      type: "entity",
      display: "grid",
      weight: "light",
      ordered: false,
      icon: "trophy",
      titleField: "win",
      describes: "Results delivered for clients, worth telling the next one about.",
      subject: "thing",
      fields: [
        { key: "win", label: "Win", parityType: "text", sensitivity: "internal", contextPolicy: "include" },
        { key: "client", label: "Client", parityType: "relation", sensitivity: "internal", contextPolicy: "include", relationTarget: "client", relationMax: 1 },
        {
          key: "kind",
          label: "Kind",
          parityType: "select",
          sensitivity: "internal",
          contextPolicy: "include",
          choices: ["Reach", "Leads", "Revenue", "Launch"],
          choiceColors: { Reach: "yellow", Leads: "yellow", Revenue: "yellow", Launch: "yellow" },
        },
        { key: "won_on", label: "Won on", parityType: "datetime", sensitivity: "internal", contextPolicy: "include", format: "date", absoluteDates: true, historicalReason: "the sample agency's dated history, read as of 2026-10-05" },
      ],
      rows: WINS.map(([key, win, client, kind, won]) => ({ key, values: { win, client, kind, won_on: won } })),
    },
    {
      token: "task",
      name: "Tasks",
      labelSingular: "Task",
      labelPlural: "Tasks",
      type: "entity",
      display: "grid",
      weight: "light",
      ordered: false,
      icon: "list-checks",
      titleField: "task",
      describes: "Every piece of client work the team finished.",
      subject: "thing",
      fields: [
        { key: "task", label: "Task", parityType: "text", sensitivity: "internal", contextPolicy: "include" },
        { key: "client", label: "Client", parityType: "relation", sensitivity: "internal", contextPolicy: "include", relationTarget: "client", relationMax: 1 },
        { key: "kind", label: "Kind", parityType: "select", sensitivity: "internal", contextPolicy: "include", choices: TASK_KINDS },
        { key: "status", label: "Status", parityType: "select", sensitivity: "internal", contextPolicy: "include", choices: ["To do", "Doing", "Done"] },
        { key: "done_on", label: "Done on", parityType: "datetime", sensitivity: "internal", contextPolicy: "include", format: "date", absoluteDates: true, historicalReason: "the sample agency's dated history, read as of 2026-10-05" },
      ],
      rows: tasks(),
    },
  ],
  relationships: [
    { describes: "A client bought one offer.", fromTable: "client", fromField: "offer", toTable: "offer", flavor: "referenced", cardinality: "one", onDelete: "restrict", inverseKey: "clients" },
    { describes: "A survey is one client's score.", fromTable: "nps_survey", fromField: "client", toTable: "client", flavor: "referenced", cardinality: "one", onDelete: "restrict", inverseKey: "surveys" },
    { describes: "A win was delivered for one client.", fromTable: "client_win", fromField: "client", toTable: "client", flavor: "referenced", cardinality: "one", onDelete: "restrict", inverseKey: "wins" },
    { describes: "A task was done for one client.", fromTable: "task", fromField: "client", toTable: "client", flavor: "referenced", cardinality: "one", onDelete: "restrict", inverseKey: "tasks" },
  ],
  sharedBlocks: [],
  views: [
    { token: "all_clients", name: "All", table: "client", kind: "grid", isDefault: true, sorts: [{ field: "date_started", direction: "asc" }] },
    { token: "clients_by_status", name: "By status", table: "client", kind: "kanban", groupBy: "status" },
    { token: "all_wins", name: "All", table: "client_win", kind: "grid", isDefault: true },
    { token: "all_surveys", name: "All", table: "nps_survey", kind: "grid", isDefault: true },
    { token: "all_tasks", name: "All", table: "task", kind: "grid", isDefault: true },
    { token: "all_offers", name: "All", table: "offer", kind: "grid", isDefault: true },
  ],
  forms: [],
  dimensions: [],
  extras: [
    {
      kind: "dashboard",
      token: "agency_home",
      name: "Agency home",
      table: "client",
      blocks: [{ title: "Active clients", kind: "donut", groupBy: ["status"], measures: [{ op: "count" }] }],
    },
  ],
  agent: {
    platformAgent: { id: "4cd676c6-f55d-4426-b7eb-a9d0273566ec", name: "Answers From Your Tables" },
    name: "Agency assistant",
    variables: [{ name: "primary_table", table: "client", describes: "Every client, the offer they bought and their status." }],
    question: {
      ask: "How many clients are active right now?",
      whyItMatters: "Cora plans the team's week around the clients who are live.",
      expect: { table: "client", measure: { op: "count" }, filter: { status: "Active" }, answer: 3, unit: "clients" },
    },
  },
  walk: [
    { says: "Open All clients: every client with the offer they bought.", action: { kind: "open", surface: "all_clients" }, expect: { kind: "renders", surface: "all_clients", minItems: 4 } },
    { says: "Open the client wins.", action: { kind: "open", surface: "all_wins" }, expect: { kind: "renders", surface: "all_wins", minItems: 10 } },
    { says: "Open the NPS surveys.", action: { kind: "open", surface: "all_surveys" }, expect: { kind: "renders", surface: "all_surveys", minItems: 10 } },
  ],
  foundation: [{ table: "client", keptFor: "Every other table hangs off a client." }],
  provenance: {
    kind: "synthesized",
    authoredBy: "spaces builder lane",
    authoredOn: "2026-10-05",
    noRealPeople: true,
    sources: [],
    fictionalDomains: ["travelingsmm.net"],
    fictionalStreets: ["Driftwood Row"],
  },
  // 2: Offers became their own table and a client's Offer Bought a link to it (was a select).
  // 3: the Offers rows carry a row icon (Package).
  version: 3,
} as const satisfies TemplateSpec;

export const AGENCY_TABLES = {
  client: "client",
  nps: "nps_survey",
  wins: "client_win",
  tasks: "task",
} as const;
