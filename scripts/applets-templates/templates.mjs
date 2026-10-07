// The platform's own Applet templates (AP-0 item 10, lane E). Each one is an Applet over an existing
// platform data template: "Use this template" installs that data template into the chosen
// organization, then copies the Applet with every source rebound to the installed table.
import { SHARED_HELPERS } from "./shared-source.mjs";

const sharedFile = (imports, body) => `${imports}\n${SHARED_HELPERS}\n${body}`;

// ---------------------------------------------------------------- 1. Client approval portal
const approval = {
  slug: "client-approval-portal",
  name: "Client approval portal",
  tagline: "Send work to clients and see what is approved",
  description:
    "Every deliverable waiting on a client, grouped by client, with one-click Approved or Changes requested. Each client gets a review page that lists only their work, and a clients page shows who owes you an answer.",
  category: "Client work",
  tags: ["approvals", "clients", "agency", "deliverables", "portal"],
  template: { slug: "peregrine-lane-digital-retainers-deliverables-and-client-portal", bind: { deliverables: "deliverable", clients: "client" } },
  pages: [
    { path: "/", title: "Waiting on clients", file: "Waiting.tsx" },
    { path: "/clients", title: "Clients", file: "Clients.tsx" },
    { path: "/clients/:id", title: "Client review", file: "ClientReview.tsx", parent: "/clients" },
  ],
  files: {
    "App.tsx": `// Client approval portal: deliverables waiting on clients, the client list and one client's review page.
import { Pages } from "@ai-matrx/applets/react";

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-16 pt-4">
      <div className="mb-3 text-base font-semibold">Client approvals</div>
      <Pages layout="tabs" />
    </div>
  );
}
`,
    "shared.tsx": sharedFile(
      `import { useRows } from "@ai-matrx/applets/react";
import { Badge, Button, RegionSkeleton } from "@ai-matrx/design-system/controls";
import { useState } from "react";`,
      `
export const APPROVAL = ["Not sent", "Waiting on client", "Changes requested", "Approved"];
const TONE = { "Not sent": "neutral", "Waiting on client": "primary", "Changes requested": "warning", Approved: "success" };

/** Deliverables and clients, read as the viewer; a decision shows at once and rolls back on refusal. */
export function usePortal() {
  const deliverables = useRows("deliverables", { sort: [{ column: "due_on", direction: "asc" }], pageSize: 500 });
  const clients = useRows("clients", { sort: [{ column: "company_name", direction: "asc" }], pageSize: 200 });
  const names = Object.fromEntries(clients.rows.map((c) => [c._id, c.company_name || "Unnamed client"]));
  const clientOf = (d) => linkIds(d.client)[0] || null;
  const decide = (d, approval) =>
    deliverables.update(d._id, approval === "Approved" ? { approval, approved_on: new Date().toISOString().slice(0, 10) } : { approval });
  return { deliverables, clients, names, clientOf, decide, error: deliverables.error || clients.error };
}

export function ApprovalBadge({ value }) {
  return value ? <Badge tone={TONE[value] || "neutral"}>{value}</Badge> : null;
}

export function DeliverableCard({ d, client, decide }) {
  const [refused, setRefused] = useState(null);
  const act = async (approval) => {
    setRefused(null);
    const answer = await decide(d, approval);
    if (!answer.ok) setRefused(answer.error.message);
  };
  return (
    <div className="rounded-lg border border-border bg-card p-2.5" data-deliverable-id={d._id}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {client ? <span className="font-medium">{client}</span> : null}
        {d.kind ? <Badge>{d.kind}</Badge> : null}
        <span className="ml-auto"><ApprovalBadge value={d.approval} /></span>
      </div>
      <p className="mt-1 text-sm font-medium">{d.title || "Untitled deliverable"}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Due {dayWords(d.due_on)}{d.price ? " · " + money(d.price) : ""}</p>
      {d.client_note ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{d.client_note}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => act("Approved")}>Approved</Button>
        <Button variant="outline" onClick={() => act("Changes requested")}>Changes requested</Button>
        {refused ? <span className="text-xs text-destructive" data-applet-refusal="">{refused}</span> : null}
      </div>
    </div>
  );
}
`,
    ),
    "Waiting.tsx": `// Every deliverable sent and waiting on a client, grouped by client.
import { Link } from "@ai-matrx/applets/react";
import { usePortal, DeliverableCard, Notice, Loading } from "./shared";

export default function Waiting() {
  const { deliverables, clients, names, clientOf, decide, error } = usePortal();
  const waiting = deliverables.rows.filter((d) => d.approval === "Waiting on client" || d.approval === "Changes requested");
  const groups = clients.rows.map((c) => ({ c, items: waiting.filter((d) => clientOf(d) === c._id) })).filter((g) => g.items.length);
  return (
    <div className="space-y-5 pt-3">
      <Notice error={error} />
      <Loading state={deliverables} label="Loading deliverables" />
      {deliverables.status !== "loading" && waiting.length === 0 ? <p className="text-sm text-muted-foreground">Nothing is waiting on a client.</p> : null}
      {groups.map(({ c, items }) => (
        <section key={c._id}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {names[c._id]} <span className="font-normal text-muted-foreground">· {items.length}</span>
            <Link to={"/clients/" + c._id} className="ml-auto text-xs font-normal text-primary hover:underline">Review page</Link>
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            {items.map((d) => <DeliverableCard key={d._id} d={d} decide={decide} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
`,
    "Clients.tsx": `// Every client with what is waiting on them and what they approved.
import { Link } from "@ai-matrx/applets/react";
import { Badge } from "@ai-matrx/design-system/controls";
import { usePortal, Notice, Loading, money } from "./shared";

export default function Clients() {
  const { deliverables, clients, clientOf, error } = usePortal();
  return (
    <div className="space-y-2 pt-3">
      <Notice error={error} />
      <Loading state={clients} label="Loading clients" />
      {clients.rows.map((c) => {
        const mine = deliverables.rows.filter((d) => clientOf(d) === c._id);
        const waiting = mine.filter((d) => d.approval === "Waiting on client").length;
        const approved = mine.filter((d) => d.approval === "Approved").length;
        return (
          <Link key={c._id} to={"/clients/" + c._id} data-clickable="" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5 hover:bg-accent">
            <span className="text-sm font-medium">{c.company_name || "Unnamed client"}</span>
            {c.stage ? <Badge>{c.stage}</Badge> : null}
            <span className="ml-auto text-xs text-muted-foreground">
              {waiting} waiting · {approved} approved{c.monthly_retainer ? " · " + money(c.monthly_retainer) + "/mo" : ""}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
`,
    "ClientReview.tsx": `// One client's review page: only their deliverables, newest due first.
import { usePage } from "@ai-matrx/applets/react";
import { usePortal, DeliverableCard, Notice, Loading } from "./shared";

export default function ClientReview() {
  const { params } = usePage();
  const { deliverables, names, clientOf, decide, error } = usePortal();
  const mine = deliverables.rows.filter((d) => clientOf(d) === params.id);
  return (
    <div className="space-y-3 pt-3">
      <Notice error={error} />
      <h2 className="text-sm font-semibold">{names[params.id] || "Client"}</h2>
      <Loading state={deliverables} label="Loading deliverables" />
      {deliverables.status !== "loading" && mine.length === 0 ? <p className="text-sm text-muted-foreground">No deliverables for this client yet.</p> : null}
      <div className="grid gap-2 md:grid-cols-2">
        {mine.map((d) => <DeliverableCard key={d._id} d={d} decide={decide} />)}
      </div>
    </div>
  );
}
`,
  },
};

// ---------------------------------------------------------------- 2. Sales pipeline
const pipeline = {
  slug: "sales-pipeline-crm",
  name: "Sales pipeline CRM",
  tagline: "Deals by stage, companies and follow-ups",
  description:
    "A pipeline board of every open deal by stage, where moving a deal is one choice. A companies page totals open and won value, and each deal has its own page for amount, close date and notes.",
  category: "Sales",
  tags: ["crm", "pipeline", "deals", "sales", "companies"],
  template: { slug: "brindlemoor-logistics-software-deal-board-and-follow-ups", bind: { deals: "deal", companies: "account" } },
  pages: [
    { path: "/", title: "Pipeline", file: "Pipeline.tsx" },
    { path: "/companies", title: "Companies", file: "Companies.tsx" },
    { path: "/deals/:id", title: "Deal", file: "Deal.tsx", parent: "/" },
  ],
  files: {
    "App.tsx": `// Sales pipeline CRM: the deal board, companies and one deal's page.
import { Pages } from "@ai-matrx/applets/react";

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 pb-16 pt-4">
      <div className="mb-3 text-base font-semibold">Sales pipeline</div>
      <Pages layout="tabs" />
    </div>
  );
}
`,
    "shared.tsx": sharedFile(
      `import { useRows } from "@ai-matrx/applets/react";
import { Select, RegionSkeleton } from "@ai-matrx/design-system/controls";`,
      `
export const STAGES = ["Lead", "Discovery call", "Demo", "Proposal sent", "Negotiation", "Closed won", "Closed lost"];
export const OPEN = STAGES.slice(0, 5);

/** Deals and companies, read as the viewer; a stage move shows at once and rolls back on refusal. */
export function useCrm() {
  const deals = useRows("deals", { sort: [{ column: "close_on", direction: "asc" }], pageSize: 500 });
  const companies = useRows("companies", { sort: [{ column: "company_name", direction: "asc" }], pageSize: 300 });
  const names = Object.fromEntries(companies.rows.map((c) => [c._id, c.company_name || "Unnamed company"]));
  const companyOf = (d) => linkIds(d.account)[0] || null;
  return { deals, companies, names, companyOf, error: deals.error || companies.error };
}

export function StageSelect({ deal, onStage }) {
  return (
    <Select
      aria-label="Stage"
      value={deal.stage || ""}
      onValueChange={(v) => v && onStage(v)}
      options={[...(deal.stage ? [] : [{ value: "", label: "No stage" }]), ...STAGES.map((s) => ({ value: s, label: s }))]}
    />
  );
}
`,
    ),
    "Pipeline.tsx": `// The board: one column per open stage, deal cards with their company, amount and close date.
import { useState } from "react";
import { Link } from "@ai-matrx/applets/react";
import { useCrm, StageSelect, OPEN, Notice, Loading, money, dayWords } from "./shared";

export default function Pipeline() {
  const { deals, names, companyOf, error } = useCrm();
  const [refused, setRefused] = useState(null);
  const move = async (d, stage) => {
    setRefused(null);
    const answer = await deals.update(d._id, { stage });
    if (!answer.ok) setRefused(answer.error.message);
  };
  return (
    <div className="pt-3">
      <Notice error={error} />
      {refused ? <p className="mb-2 text-xs text-destructive" data-applet-refusal="">{refused}</p> : null}
      <Loading state={deals} label="Loading deals" />
      <div className="grid gap-3 md:grid-cols-5">
        {OPEN.map((stage) => {
          const items = deals.rows.filter((d) => d.stage === stage);
          const total = items.reduce((s, d) => s + (Number(d.amount) || 0), 0);
          return (
            <section key={stage} className="min-w-0">
              <h2 className="mb-2 text-xs font-semibold">{stage} <span className="font-normal text-muted-foreground">· {items.length} · {money(total)}</span></h2>
              <div className="space-y-2">
                {items.map((d) => (
                  <div key={d._id} className="rounded-lg border border-border bg-card p-2" data-deal-id={d._id}>
                    <Link to={"/deals/" + d._id} className="block truncate text-sm font-medium hover:underline">{d.deal_name || "Untitled deal"}</Link>
                    <p className="truncate text-xs text-muted-foreground">{names[companyOf(d)] || "No company"} · {money(d.amount)}</p>
                    <p className="mb-1.5 text-xs text-muted-foreground">Closes {dayWords(d.close_on)}</p>
                    <StageSelect deal={d} onStage={(s) => move(d, s)} />
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
`,
    "Companies.tsx": `// Every company with its open pipeline and what it has already bought.
import { useCrm, OPEN, Notice, Loading, money } from "./shared";

export default function Companies() {
  const { deals, companies, companyOf, error } = useCrm();
  return (
    <div className="space-y-2 pt-3">
      <Notice error={error} />
      <Loading state={companies} label="Loading companies" />
      {companies.rows.map((c) => {
        const mine = deals.rows.filter((d) => companyOf(d) === c._id);
        const open = mine.filter((d) => OPEN.includes(d.stage)).reduce((s, d) => s + (Number(d.amount) || 0), 0);
        const won = mine.filter((d) => d.stage === "Closed won").reduce((s, d) => s + (Number(d.amount) || 0), 0);
        return (
          <div key={c._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5">
            <span className="text-sm font-medium">{c.company_name || "Unnamed company"}</span>
            {c.city ? <span className="text-xs text-muted-foreground">{c.city}</span> : null}
            <span className="ml-auto text-xs text-muted-foreground">{money(open)} open · {money(won)} won · {mine.length} deals</span>
          </div>
        );
      })}
    </div>
  );
}
`,
    "Deal.tsx": `// One deal: stage, amount, close date and notes, each saved as it changes.
import { useState } from "react";
import { usePage, useRow } from "@ai-matrx/applets/react";
import { Field, Textarea, Button } from "@ai-matrx/design-system/controls";
import { StageSelect, Notice, money } from "./shared";

export default function Deal() {
  const { params } = usePage();
  const deal = useRow("deals", params.id);
  const [notes, setNotes] = useState(null);
  const [refused, setRefused] = useState(null);
  const save = async (patch) => {
    setRefused(null);
    const answer = await deal.update(patch);
    if (!answer.ok) setRefused(answer.error.message);
  };
  const d = deal.row;
  if (!d) return <div className="pt-3"><Notice error={deal.error} />{deal.status === "loading" ? null : <p className="text-sm text-muted-foreground">This deal is not available.</p>}</div>;
  return (
    <div className="max-w-xl space-y-3 pt-3">
      <Notice error={deal.error} />
      <h2 className="text-sm font-semibold">{d.deal_name || "Untitled deal"} <span className="font-normal text-muted-foreground">· {money(d.amount)}</span></h2>
      <StageSelect deal={d} onStage={(stage) => save({ stage })} />
      <Field type="date" aria-label="Close date" defaultValue={d.close_on ? String(d.close_on).slice(0, 10) : ""} onBlur={(e) => e.target.value && save({ close_on: e.target.value })} />
      <Textarea aria-label="Notes" value={notes ?? d.notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={5} />
      <Button variant="primary" onClick={() => save({ notes: notes ?? d.notes ?? "" })}>Save notes</Button>
      {refused ? <p className="text-xs text-destructive" data-applet-refusal="">{refused}</p> : null}
    </div>
  );
}
`,
  },
};

// ---------------------------------------------------------------- 3. Time tracking board
const time = {
  slug: "time-tracking-board",
  name: "Time tracking board",
  tagline: "Log hours, review them and see them by project",
  description:
    "Log time against a project in a few taps, see the last two weeks day by day, approve logged hours in one place, and read hours and billed value per project.",
  category: "Operations",
  tags: ["time tracking", "timesheets", "hours", "projects", "billing"],
  template: { slug: "ivybridge-way-architects-weekly-numbers-by-project-type", bind: { entries: "time_entry", projects: "project" } },
  pages: [
    { path: "/", title: "Log and days", file: "Days.tsx" },
    { path: "/review", title: "Review", file: "Review.tsx" },
    { path: "/projects", title: "Projects", file: "Projects.tsx" },
  ],
  files: {
    "App.tsx": `// Time tracking board: log and days, review, and hours by project.
import { Pages } from "@ai-matrx/applets/react";

export default function App() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-5xl flex-col px-4 pb-16 pt-4">
      <div className="mb-3 text-base font-semibold">Time tracking</div>
      <Pages layout="tabs" />
    </div>
  );
}
`,
    "shared.tsx": sharedFile(
      `import { useRows } from "@ai-matrx/applets/react";
import { Badge, RegionSkeleton } from "@ai-matrx/design-system/controls";`,
      `
const TONE = { Logged: "neutral", Approved: "success", Invoiced: "info" };
export function today() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
export function hours(n) {
  const v = Number(n) || 0;
  return (Math.round(v * 10) / 10).toString() + " h";
}

/** Entries and projects, read as the viewer; every change shows at once and rolls back on refusal. */
export function useTime() {
  const entries = useRows("entries", { sort: [{ column: "work_on", direction: "desc" }], pageSize: 1000 });
  const projects = useRows("projects", { sort: [{ column: "project_name", direction: "asc" }], pageSize: 300 });
  const names = Object.fromEntries(projects.rows.map((p) => [p._id, p.project_name || "Unnamed project"]));
  const projectOf = (e) => linkIds(e.project)[0] || null;
  return { entries, projects, names, projectOf, error: entries.error || projects.error };
}

export function StatusBadge({ value }) {
  return value ? <Badge tone={TONE[value] || "neutral"}>{value}</Badge> : null;
}
`,
    ),
    "Days.tsx": `// Log time, then the last fourteen days, each with its entries and total.
import { useState } from "react";
import { Button, Field, Select } from "@ai-matrx/design-system/controls";
import { useTime, StatusBadge, Notice, Loading, dayWords, hours, today } from "./shared";

export default function Days() {
  const { entries, projects, names, projectOf, error } = useTime();
  const [project, setProject] = useState("");
  const [amount, setAmount] = useState("");
  const [label, setLabel] = useState("");
  const [day, setDay] = useState(today());
  const [refused, setRefused] = useState(null);
  const log = async () => {
    setRefused(null);
    const answer = await entries.create({ entry_label: label || "Time", project: project ? [project] : [], hours: Number(amount), work_on: day, status: "Logged" });
    if (!answer.ok) return setRefused(answer.error.message);
    setAmount("");
    setLabel("");
  };
  const since = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const recent = entries.rows.filter((e) => String(e.work_on || "").slice(0, 10) >= since);
  const days = [...new Set(recent.map((e) => String(e.work_on).slice(0, 10)))].sort().reverse();
  return (
    <div className="space-y-4 pt-3">
      <Notice error={error} />
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5">
        <Select aria-label="Project" value={project} onValueChange={(v) => setProject(v || "")} options={[{ value: "", label: "Choose a project" }, ...projects.rows.map((p) => ({ value: p._id, label: names[p._id] }))]} />
        <Field aria-label="What you did" placeholder="What you did" value={label} onChange={(e) => setLabel(e.target.value)} />
        <Field aria-label="Hours" type="number" step="0.25" min="0" placeholder="Hours" width="xs" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Field aria-label="Day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
        <Button variant="primary" disabled={!project || !(Number(amount) > 0)} onClick={log}>Log time</Button>
        {refused ? <span className="text-xs text-destructive" data-applet-refusal="">{refused}</span> : null}
      </div>
      <Loading state={entries} label="Loading time entries" />
      {entries.status !== "loading" && days.length === 0 ? <p className="text-sm text-muted-foreground">No time logged in the last two weeks.</p> : null}
      {days.map((d) => {
        const items = recent.filter((e) => String(e.work_on).slice(0, 10) === d);
        return (
          <section key={d}>
            <h2 className="mb-1.5 text-sm font-semibold">{dayWords(d)} <span className="font-normal text-muted-foreground">· {hours(items.reduce((s, e) => s + (Number(e.hours) || 0), 0))}</span></h2>
            <div className="space-y-1.5">
              {items.map((e) => (
                <div key={e._id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm" data-entry-id={e._id}>
                  <span className="font-medium">{names[projectOf(e)] || "No project"}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{e.entry_label}</span>
                  <span className="tabular-nums">{hours(e.hours)}</span>
                  <StatusBadge value={e.status} />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
`,
    "Review.tsx": `// Every logged entry waiting for review; approve one or all of a project's at once.
import { useState } from "react";
import { Button } from "@ai-matrx/design-system/controls";
import { useTime, Notice, Loading, dayWords, hours } from "./shared";

export default function Review() {
  const { entries, names, projectOf, error } = useTime();
  const [refused, setRefused] = useState(null);
  const waiting = entries.rows.filter((e) => e.status === "Logged");
  const approve = async (list) => {
    setRefused(null);
    for (const e of list) {
      const answer = await entries.update(e._id, { status: "Approved" });
      if (!answer.ok) return setRefused(answer.error.message);
    }
  };
  const byProject = [...new Set(waiting.map(projectOf))];
  return (
    <div className="space-y-4 pt-3">
      <Notice error={error} />
      {refused ? <p className="text-xs text-destructive" data-applet-refusal="">{refused}</p> : null}
      <Loading state={entries} label="Loading time entries" />
      {entries.status !== "loading" && waiting.length === 0 ? <p className="text-sm text-muted-foreground">Every logged hour is reviewed.</p> : null}
      {byProject.map((pid) => {
        const items = waiting.filter((e) => projectOf(e) === pid);
        return (
          <section key={pid || "none"}>
            <h2 className="mb-1.5 flex items-center gap-2 text-sm font-semibold">
              {names[pid] || "No project"} <span className="font-normal text-muted-foreground">· {hours(items.reduce((s, e) => s + (Number(e.hours) || 0), 0))}</span>
              <Button variant="outline" className="ml-auto" onClick={() => approve(items)}>Approve all</Button>
            </h2>
            <div className="space-y-1.5">
              {items.map((e) => (
                <div key={e._id} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 text-sm" data-entry-id={e._id}>
                  <span className="text-muted-foreground">{dayWords(e.work_on)}</span>
                  <span className="min-w-0 flex-1 truncate">{e.entry_label}</span>
                  <span className="tabular-nums">{hours(e.hours)}</span>
                  <Button variant="primary" onClick={() => approve([e])}>Approve</Button>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
`,
    "Projects.tsx": `// Hours and billed value per project, with the phase each one is in.
import { Badge } from "@ai-matrx/design-system/controls";
import { useTime, Notice, Loading, hours, money } from "./shared";

export default function Projects() {
  const { entries, projects, projectOf, error } = useTime();
  return (
    <div className="space-y-2 pt-3">
      <Notice error={error} />
      <Loading state={projects} label="Loading projects" />
      {projects.rows.map((p) => {
        const mine = entries.rows.filter((e) => projectOf(e) === p._id);
        const h = mine.reduce((s, e) => s + (Number(e.hours) || 0), 0);
        const billed = mine.reduce((s, e) => s + (Number(e.billed) || 0), 0);
        return (
          <div key={p._id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2.5">
            <span className="text-sm font-medium">{p.project_name || "Unnamed project"}</span>
            {p.phase ? <Badge>{p.phase}</Badge> : null}
            <span className="ml-auto text-xs text-muted-foreground">{hours(h)} · {money(billed)} billed{p.contract_fee ? " of " + money(p.contract_fee) : ""}</span>
          </div>
        );
      })}
    </div>
  );
}
`,
  },
};

export const APPLET_TEMPLATES = [approval, pipeline, time];
