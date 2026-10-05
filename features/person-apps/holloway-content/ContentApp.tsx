"use client";

// features/person-apps/holloway-content/ContentApp.tsx — HOLLOWAY CREATIVE'S CONTENT APP.
//
// Built for a social-media agency that runs every client's posts out of three of its own tables
// (Posts, Clients, Campaigns — moved from Notion). Three screens on those tables, nothing copied:
//   /apps/holloway-content                 the posting calendar, four weeks, filter by client
//   /apps/holloway-content/approvals       every post waiting on a decision, by client
//   /apps/holloway-content/client/<id>     one client's review page: approve or send back
// Every read and write is the viewer's own (the store decides); a refusal is shown in the store's words.

import { useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@ai-matrx/design-system";
import { useStoreTable } from "@ai-matrx/records/react";
import type { StoreRowOf } from "@ai-matrx/records/app-table";

import type { PersonAppProps } from "../registry";
import { posts, type PostsRow } from "./tables/posts";
import { clients } from "./tables/clients";

const ROOT = "/apps/holloway-content";
type Post = StoreRowOf<typeof posts>;
type Client = StoreRowOf<typeof clients>;
type Status = NonNullable<PostsRow["status"]>;
const STATUS_ORDER: Status[] = ["Idea", "Drafting", "In review", "Scheduled", "Published"];
const STATUS_TONE: Record<Status, string> = {
  Idea: "bg-muted text-muted-foreground",
  Drafting: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "In review": "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  Scheduled: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  Published: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function mondayOf(d: Date): Date {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}
function dayWords(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export default function ContentApp({ path }: PersonAppProps) {
  const [screen, id] = path;
  const all = useStoreTable(posts, { sort: [{ column: "publish_date", as: "date" }] });
  const people = useStoreTable(clients, { sort: [{ column: "name" }] });
  const clientName = useMemo(() => new Map(people.rows.map((c) => [c._id, c.name ?? "Unnamed client"])), [people.rows]);
  const nameOf = (p: Post) => (p.client ?? []).map((c) => clientName.get(c)).filter(Boolean).join(", ") || "No client";

  const setStatus = (p: Post, status: Status, approved?: boolean) =>
    all.update(p._id, approved === undefined ? { status } : { status, approved });

  const error = all.error ?? people.error;
  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-4">
      <header className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-base font-semibold">Holloway Creative</span>
        <nav className="flex gap-1 text-sm">
          <Tab href={ROOT} on={!screen}>Calendar</Tab>
          <Tab href={`${ROOT}/approvals`} on={screen === "approvals"}>
            Approvals{" "}
            <span className="tabular-nums text-muted-foreground">{all.rows.filter((p) => p.status === "In review").length}</span>
          </Tab>
        </nav>
      </header>
      {error ? <p className="mb-3 rounded-md border border-destructive/40 p-2 text-sm text-destructive">{error.message}</p> : null}
      {all.truncated ? <p className="mb-3 text-xs text-muted-foreground">Showing {all.rows.length} of {all.total} posts.</p> : null}
      {all.loading && all.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading posts…</p>
      ) : screen === "approvals" ? (
        <Approvals rows={all.rows} nameOf={nameOf} clients={people.rows} onDecide={setStatus} />
      ) : screen === "client" && id ? (
        <ClientReview clientId={id} name={clientName.get(id) ?? null} rows={all.rows} onDecide={setStatus} />
      ) : (
        <Calendar rows={all.rows} nameOf={nameOf} clients={people.rows} onStatus={setStatus} />
      )}
    </div>
  );
}

function Tab({ href, on, children }: { href: string; on: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={`rounded-md px-2.5 py-1 ${on ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/60"}`}>
      {children}
    </Link>
  );
}

function StatusPill({ post, onStatus }: { post: Post; onStatus?: (p: Post, s: Status) => void }) {
  const s = post.status;
  if (!onStatus) return s ? <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_TONE[s]}`}>{s}</span> : null;
  return (
    <select
      aria-label="Status"
      value={s ?? ""}
      onChange={(e) => onStatus(post, e.target.value as Status)}
      className={`rounded border-0 px-1.5 py-0.5 text-xs ${s ? STATUS_TONE[s] : "bg-muted"}`}
    >
      {s ? null : <option value="">No status</option>}
      {STATUS_ORDER.map((v) => (
        <option key={v} value={v}>
          {v}
        </option>
      ))}
    </select>
  );
}

function PostCard({ post, client, onStatus, children }: { post: Post; client?: string; onStatus?: (p: Post, s: Status) => void; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-2.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {client ? <span className="font-medium">{client}</span> : null}
        {(post.platform ?? []).map((p) => (
          <span key={p} className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            {p}
          </span>
        ))}
        <span className="ml-auto flex items-center gap-1.5">
          {post.approved ? <span className="text-emerald-600 dark:text-emerald-400">Approved</span> : null}
          <StatusPill post={post} onStatus={onStatus} />
        </span>
      </div>
      <p className="mt-1 text-sm font-medium">{post.name ?? "Untitled post"}</p>
      {post.caption ? <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{post.caption}</p> : null}
      {children}
    </div>
  );
}

function ClientFilter({ clients, value, onChange }: { clients: Client[]; value: string; onChange: (v: string) => void }) {
  return (
    <select aria-label="Client" value={value} onChange={(e) => onChange(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm">
      <option value="">All clients</option>
      {clients.map((c) => (
        <option key={c._id} value={c._id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function Calendar({
  rows,
  nameOf,
  clients: people,
  onStatus,
}: {
  rows: Post[];
  nameOf: (p: Post) => string;
  clients: Client[];
  onStatus: (p: Post, s: Status) => void;
}) {
  const [client, setClient] = useState("");
  const [start, setStart] = useState(() => mondayOf(new Date()));
  const shown = rows.filter((p) => !client || (p.client ?? []).includes(client));
  const weeks = [0, 1, 2, 3].map((w) => {
    const from = new Date(start);
    from.setDate(from.getDate() + w * 7);
    const days = [0, 1, 2, 3, 4, 5, 6].map((d) => {
      const day = new Date(from);
      day.setDate(day.getDate() + d);
      return isoDay(day);
    });
    return { from: days[0]!, days };
  });
  const byDay = new Map<string, Post[]>();
  for (const p of shown) if (p.publish_date) byDay.set(p.publish_date.slice(0, 10), [...(byDay.get(p.publish_date.slice(0, 10)) ?? []), p]);
  const unscheduled = shown.filter((p) => !p.publish_date && p.status !== "Published");
  const move = (weeksBy: number) =>
    setStart((s) => {
      const n = new Date(s);
      n.setDate(n.getDate() + weeksBy * 7);
      return n;
    });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ClientFilter clients={people} value={client} onChange={setClient} />
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="outline" onClick={() => move(-4)}>
            Earlier
          </Button>
          <Button size="sm" variant="outline" onClick={() => setStart(mondayOf(new Date()))}>
            This week
          </Button>
          <Button size="sm" variant="outline" onClick={() => move(4)}>
            Later
          </Button>
        </div>
      </div>
      {weeks.map((w) => {
        const count = w.days.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);
        return (
          <section key={w.from}>
            <h2 className="mb-2 text-sm font-semibold">
              Week of {dayWords(w.from)} <span className="font-normal text-muted-foreground">· {count} posts</span>
            </h2>
            {count === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing planned.</p>
            ) : (
              <div className="space-y-3">
                {w.days
                  .filter((d) => byDay.get(d)?.length)
                  .map((d) => (
                    <div key={d} className="grid gap-2 sm:grid-cols-[7rem_1fr]">
                      <div className="text-xs font-medium text-muted-foreground sm:pt-2.5">{dayWords(d)}</div>
                      <div className="grid gap-2 md:grid-cols-2">
                        {byDay.get(d)!.map((p) => (
                          <PostCard key={p._id} post={p} client={nameOf(p)} onStatus={onStatus} />
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </section>
        );
      })}
      {unscheduled.length ? (
        <section>
          <h2 className="mb-2 text-sm font-semibold">
            No date yet <span className="font-normal text-muted-foreground">· {unscheduled.length}</span>
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            {unscheduled.map((p) => (
              <PostCard key={p._id} post={p} client={nameOf(p)} onStatus={onStatus} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function Decide({ post, onDecide }: { post: Post; onDecide: (p: Post, s: Status, approved?: boolean) => Promise<unknown> }) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const act = async (s: Status, approved: boolean) => {
    setBusy(true);
    setRefused(null);
    const answer = (await onDecide(post, s, approved)) as { ok: boolean; error?: { message: string } };
    if (!answer.ok) setRefused(answer.error?.message ?? "The store refused the change.");
    setBusy(false);
  };
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <Button size="sm" disabled={busy} onClick={() => act("Scheduled", true)}>
        Approve
      </Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => act("Drafting", false)}>
        Send back
      </Button>
      {refused ? <span className="text-xs text-destructive">{refused}</span> : null}
    </div>
  );
}

function Approvals({
  rows,
  nameOf,
  clients: people,
  onDecide,
}: {
  rows: Post[];
  nameOf: (p: Post) => string;
  clients: Client[];
  onDecide: (p: Post, s: Status, approved?: boolean) => Promise<unknown>;
}) {
  const waiting = rows.filter((p) => p.status === "In review");
  if (waiting.length === 0) return <p className="text-sm text-muted-foreground">Nothing is waiting for approval.</p>;
  const groups = people
    .map((c) => ({ c, items: waiting.filter((p) => (p.client ?? []).includes(c._id)) }))
    .filter((g) => g.items.length);
  const loose = waiting.filter((p) => !(p.client ?? []).length);
  return (
    <div className="space-y-5">
      {groups.map(({ c, items }) => (
        <section key={c._id}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {c.name} <span className="font-normal text-muted-foreground">· {items.length}</span>
            <Link href={`${ROOT}/client/${c._id}`} className="ml-auto text-xs font-normal text-primary hover:underline">
              Client review page
            </Link>
          </h2>
          <div className="grid gap-2 md:grid-cols-2">
            {items.map((p) => (
              <PostCard key={p._id} post={p}>
                <p className="mt-1 text-xs text-muted-foreground">{p.publish_date ? `Goes out ${dayWords(p.publish_date.slice(0, 10))}` : "No date yet"}</p>
                <Decide post={p} onDecide={onDecide} />
              </PostCard>
            ))}
          </div>
        </section>
      ))}
      {loose.map((p) => (
        <PostCard key={p._id} post={p} client={nameOf(p)}>
          <Decide post={p} onDecide={onDecide} />
        </PostCard>
      ))}
    </div>
  );
}

function ClientReview({
  clientId,
  name,
  rows,
  onDecide,
}: {
  clientId: string;
  name: string | null;
  rows: Post[];
  onDecide: (p: Post, s: Status, approved?: boolean) => Promise<unknown>;
}) {
  const mine = rows.filter((p) => (p.client ?? []).includes(clientId));
  const waiting = mine.filter((p) => p.status === "In review");
  const coming = mine.filter((p) => p.status === "Scheduled").slice(0, 12);
  if (!name && mine.length === 0) return <p className="text-sm text-muted-foreground">This client has not been shared with you.</p>;
  return (
    <div className="space-y-5">
      <h1 className="text-lg font-semibold">{name ?? "Your posts"}</h1>
      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Waiting for your approval <span className="font-normal text-muted-foreground">· {waiting.length}</span>
        </h2>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">You are all caught up.</p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {waiting.map((p) => (
              <PostCard key={p._id} post={p}>
                {p.page_content ? <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted/50 p-2 text-xs">{p.page_content}</pre> : null}
                <Decide post={p} onDecide={onDecide} />
              </PostCard>
            ))}
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold">Coming up</h2>
        {coming.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {coming.map((p) => (
              <li key={p._id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="w-28 shrink-0 text-xs text-muted-foreground">{p.publish_date ? dayWords(p.publish_date.slice(0, 10)) : "—"}</span>
                <span className="truncate">{p.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">{(p.platform ?? []).join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
