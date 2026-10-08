"use client";

// features/make/MakeHome.tsx — LANE MAKE-HOME (v6 Unified Data System), wave 1.
//
// /make: ONE INVITING PAGE THAT SAYS WHAT A PERSON CAN MAKE, AND MAKES IT. Champions: Airtable Home
// and Notion's new page — start, template and recent on one screen. Every tile opens the EXISTING
// builder from `@ai-matrx/records-ui` in a sheet on this page; nothing here is a second builder.
//
// WHY EVERY STORE-TOUCHING LINE IS IN THIS ONE FILE. `pnpm check:campaign-entry-points` makes each
// file that imports `@ai-matrx/records*` a registered runtime entry that reads the store switch
// itself. One file = one registration and one switch read (`MakeMount`), the TryEverythingScreen
// pattern.
//
// THE TWO ORGANIZATIONS (policies/access-ladder.md):
//   · reads — Recent and "Which table" — walk EVERY organization the person reaches (the data home's
//     one call with no organization), and every row names its organization;
//   · a builder mounts in the organization of the TABLE chosen in step 1 — never silently the
//     active one; a NEW table, a portal and an example are made where new things are saved (the
//     active organization), and with none chosen the page says so in one line and the first make
//     asks for it (A3) — it never picks a default.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Check, ChevronRight } from "lucide-react";
import { createRecordsClient, supabaseDataSource } from "@ai-matrx/records/core";
import { bookingPath, publicFormPath } from "@ai-matrx/records";
import { useOptionalRecordsClient } from "@ai-matrx/records/react";
import {
  BookingBuilder,
  ChecklistTemplateEditor,
  DashboardCanvas,
  FormBuilder,
  PickOrAdd,
  PortalBuilder,
  declareTable,
  tokenFor,
} from "@ai-matrx/records-ui";

import PageHeader from "@/features/shell/components/header/PageHeader";
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import * as doors from "@/features/unified-data/hub/doors";
import { buildDataHomeRows, dataHomeKindWord, type DataHomeRow } from "@/features/unified-data/home/dataHomeRows";
import { HUB_CAPABILITIES } from "@/features/unified-data/hub/capabilities";
import { KindIcon } from "@/features/unified-data/home/dataHomeColumns";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";

import {
  MAKE_FLOW_PARAM,
  MAKE_ID_PARAM,
  MAKE_ORG_PARAM,
  MAKE_TABLE_PARAM,
  MAKE_TILES,
  tileFor,
  type MakeFlow,
  type MakeTile,
} from "./tiles";
import { answerForRecent, isTestOrganization, recentlyChanged, withoutTestOrganizations } from "./recent";
import { MakeMount, NewTableBody, SAVED_WHERE_CHOSEN, SavesTo } from "./MakeMount";
import { InstalledOneOffs, TemplateGallerySection } from "./gallery/TemplateGallery";
import { DescribeBox } from "./describe/DescribeBox";
import { formatRelativeTime } from "@ai-matrx/kit/format";

// ─────────────────────────────────────────────────────────────────────────────
// Two reads across every organization: Recent (the data home's one call) and step 1's tables.
// ─────────────────────────────────────────────────────────────────────────────

/** One door's answer on this page: reading, the store's words with Try again, or the rows. */
export type Read<T> =
  | { phase: "reading"; slow?: { retry: () => void } }
  | { phase: "failed"; why: string; retry: () => void }
  | { phase: "read"; data: T };

/** How long a read may show a skeleton before the page says it is slow (MAKE-HOME 1c: ≤ 10 s). */
export const SLOW_READ_MS = 8_000;

function useRead<T>(key: string | null, load: () => Promise<{ ok: true; data: T } | { ok: false; why: string }>): Read<T> {
  const [read, setRead] = useState<Read<T>>({ phase: "reading" });
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setRead({ phase: "reading" });
    setAttempt((n) => n + 1);
  };
  useEffect(() => {
    if (key === null) return;
    let alive = true;
    // A read still out after SLOW_READ_MS says so, with Try again — never a silent skeleton.
    const slow = setTimeout(() => {
      if (alive) setRead((now) => (now.phase === "reading" ? { phase: "reading", slow: { retry } } : now));
    }, SLOW_READ_MS);
    void load()
      .then((answered) => {
        if (!alive) return;
        setRead(answered.ok ? { phase: "read", data: answered.data } : { phase: "failed", why: answered.why, retry });
      })
      .catch((err: unknown) => {
        if (alive) setRead({ phase: "failed", why: err instanceof Error ? err.message : String(err), retry });
      });
    return () => {
      alive = false;
      clearTimeout(slow);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names everything `load` reads
  }, [key, attempt]);
  return read;
}

/**
 * RECENT: the data home's one call (`custom.data_home`), built into rows by the home's own builder,
 * archived and app-kept rows taken out first (recent.ts). It starts the moment the page mounts — it
 * waits on nothing else; test organizations are dropped from the built rows at render, once the
 * person's organizations are known. Shared-with-me is not asked: an accepted share is already a
 * table row, and that listing costs two more round trips after the home answers.
 */
function useRecentRead(userId: string | null) {
  return useRead<DataHomeRow[]>(userId, async () => {
    const source = supabaseDataSource(createClient());
    const answered = await doors.dataHome(source, null);
    if (!answered.ok) return { ok: false, why: doors.doorFailureLine(answered.error) };
    const client = createRecordsClient({ dataSource: source, actor: { actor: "user", user_id: userId! }, organizationId: null });
    const built = await buildDataHomeRows(
      { client, dataSource: source, answer: answerForRecent(answered.data, new Set()) },
      HUB_CAPABILITIES.filter((c) => c.id !== "shared-with-me"),
    );
    return { ok: true, data: built.rows };
  });
}

/**
 * STEP 1's LIST: every table the person can open in every organization she reaches — the lighter
 * `custom.data_home_tables` door alone, so "Which table" never waits on the whole home.
 */
function useTablesRead(userId: string | null, wanted: boolean) {
  // Read only when a flow that asks "which table" is open: never on the page's first paint.
  return useRead<doors.DataHomeTableRow[]>(userId && wanted ? userId : null, async () => {
    const answered = await doors.dataHomeTables(supabaseDataSource(createClient()), null);
    return answered.ok ? { ok: true, data: answered.data } : { ok: false, why: doors.doorFailureLine(answered.error) };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The page.
// ─────────────────────────────────────────────────────────────────────────────

export default function MakeHome() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const userId = useAppSelector(selectUserId);
  // org-filter: write-target the active organization is only where a NEW table, portal or example is saved; every read on this page walks all organizations
  const active = useOrganizationRequired();
  const { organizations } = useUserOrganizations();
  const testOrganizationIds = useMemo(
    () => new Set(organizations.filter((o) => isTestOrganization(o)).map((o) => o.id)),
    [organizations],
  );
  const recentRead = useRecentRead(userId ?? null);
  const recent: Read<DataHomeRow[]> =
    recentRead.phase === "read"
      ? { phase: "read", data: recentlyChanged(withoutTestOrganizations(recentRead.data, testOrganizationIds)) }
      : recentRead;

  const flow = tileFor(params.get(MAKE_FLOW_PARAM));
  const tables = useTablesRead(userId ?? null, Boolean(flow?.asksForTable));
  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  const close = () =>
    go({ [MAKE_FLOW_PARAM]: null, [MAKE_TABLE_PARAM]: null, [MAKE_ORG_PARAM]: null, [MAKE_ID_PARAM]: null });
  // THE MADE THING'S ID GOES INTO THE ADDRESS, REPLACING IT (wave 1b): a reload reopens it.
  const remember = (id: string) => {
    if (params.get(MAKE_ID_PARAM) === id) return;
    const q = new URLSearchParams(params.toString());
    q.set(MAKE_ID_PARAM, id);
    router.replace(`${pathname}?${q.toString()}`, { scroll: false });
  };

  return (
    <>
      <PageHeader>
        <RecordPageHeader backHref="/" record={{ name: "Make" }} />
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden bg-textured">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-16 pt-[calc(var(--shell-header-h)+1.25rem)] sm:px-6">
          <section className="flex flex-col gap-6" aria-labelledby="make-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 id="make-heading" className="text-2xl font-semibold tracking-tight text-foreground">
                What do you want to make?
              </h1>
              <SavesTo />
            </div>
            <DescribeBox />
            {/* A tile is a real link (/make?make=<flow>): it opens on the FIRST click, even before the
                page is interactive — a plain navigation that reloads with the flow open (MAKE-HOME 1c).
                The second line may take two lines: the tile's narrowest width holds a 60-character
                line in two (guard: a-tile-line-fits-its-slot). */}
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-3" data-make-tiles="">
              {MAKE_TILES.map((tile) => (
                <li key={tile.id} className="min-w-0">
                  <Link
                    href={tile.href ?? `${pathname}?${MAKE_FLOW_PARAM}=${tile.flow}`}
                    scroll={false}
                    data-make-tile={tile.id}
                    className="group relative flex h-full w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.99]"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
                      <KindIcon kind={tile.kind} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate pr-4 text-sm font-medium text-foreground">{tile.label}</span>
                      <span className="line-clamp-2 text-xs text-muted-foreground" data-make-tile-what="">
                        {tile.what}
                      </span>
                    </span>
                    <ChevronRight className="absolute right-3 top-4 h-4 w-4 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          <InstalledOneOffs />

          <RecentSection recent={recent} />

          <TemplateGallerySection />
        </div>
      </div>

      <Dialog open={flow !== null} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent className="flex max-h-[90dvh] w-[min(56rem,calc(100vw-2rem))] max-w-none flex-col gap-3 overflow-hidden p-4">
          {flow ? (
            <MakeFlowSheet
              tile={flow}
              tables={tables}
              testOrganizationIds={testOrganizationIds}
              activeOrganizationId={active.organizationState === "ready" ? active.organizationId : null}
              activeState={active.organizationState}
              tableId={params.get(MAKE_TABLE_PARAM)}
              organizationId={params.get(MAKE_ORG_PARAM)}
              madeId={params.get(MAKE_ID_PARAM)}
              onMade={remember}
              onChoose={(tableId, organizationId) =>
                go({ [MAKE_TABLE_PARAM]: tableId, [MAKE_ORG_PARAM]: organizationId })
              }
              onBack={() => router.back()}
              onClose={close}
              onLand={(href) => router.push(href)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RecentSection({ recent }: { recent: Read<DataHomeRow[]> }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="make-recent">
      <h2 id="make-recent" className="text-sm font-medium text-muted-foreground">
        Recently changed
      </h2>
      {recent.phase === "reading" && recent.slow ? (
        <ReadFailed read={{ why: "Still reading. This is taking longer than usual.", retry: recent.slow.retry }} />
      ) : recent.phase === "reading" ? (
        <Skeleton className="h-24 w-full" />
      ) : recent.phase === "failed" ? (
        <ReadFailed read={recent} />
      ) : recent.data.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing changed yet</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" data-make-recent="">
          {recent.data.map((row) => (
            <li key={row.id} data-make-recent-row={row.kind}>
              <Link href={row.href} className="flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted">
                <KindIcon kind={row.kind} className="h-4 w-4 shrink-0 text-muted-foreground" />
                {/* Every row names its organization — on a phone as the second line. */}
                {/* Two rows of the same name differ by what they are, where they live and when they
                    changed: kind word · parent table · organization, and the change time. */}
                <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
                  <span className="truncate text-sm text-foreground sm:min-w-0 sm:flex-1">{row.name}</span>
                  <span className="truncate text-xs text-muted-foreground sm:max-w-[50%]" data-make-recent-facts="">
                    {recentFacts(row)}
                  </span>
                </span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground" title={row.updatedAt ? new Date(row.updatedAt).toLocaleString() : undefined}>
                  {whenWords(row.updatedAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** A read that did not answer: the store's sentence (in a person's words) and Try again. */
function ReadFailed({ read }: { read: { why: string; retry: () => void } }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm" role="alert">
      <span className="text-destructive">{read.why}</span>
      <Button variant="outline" onClick={read.retry}>
        Try again
      </Button>
    </div>
  );
}

/** "Form · in Patient Intake · Cedar Ridge Physical Therapy" — what tells two same-named rows apart. */
export function recentFacts(row: Pick<DataHomeRow, "kind" | "parentName" | "organizationName">): string {
  return [dataHomeKindWord(row.kind), row.parentName ? `in ${row.parentName}` : null, row.organizationName ?? "—"]
    .filter(Boolean)
    .join(" · ");
}

function whenWords(at: string | null): string {
  return formatRelativeTime(at, { style: "short" });
}

// ─────────────────────────────────────────────────────────────────────────────
// The sheet: step 1 ("Which table, or make one?") where the flow asks it, then the builder.
// ─────────────────────────────────────────────────────────────────────────────

export interface MakeFlowSheetProps {
  tile: MakeTile;
  tables: Read<doors.DataHomeTableRow[]>;
  testOrganizationIds: ReadonlySet<string>;
  activeOrganizationId: string | null;
  activeState: ReturnType<typeof useOrganizationRequired>["organizationState"];
  tableId: string | null;
  organizationId: string | null;
  /** The thing this flow already made (the address's `id`): reopened, never made again. */
  madeId?: string | null;
  /** Told the id of the thing the flow just made, so the address can name it. */
  onMade?: (id: string) => void;
  onChoose: (tableId: string, organizationId: string) => void;
  onBack: () => void;
  onClose: () => void;
  onLand: (href: string) => void;
}

export function MakeFlowSheet(props: MakeFlowSheetProps) {
  const { tile, tableId, organizationId, onBack } = props;
  // The made thing's own name, once it exists, replaces "New …" in the title.
  const [madeName, setMadeName] = useState<string | null>(null);
  const chosen = tile.asksForTable && tableId && organizationId ? { tableId, organizationId } : null;
  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <Button icon={<ArrowLeft />} variant="quiet" onClick={onBack} aria-label="Back" />
        <KindIcon kind={tile.kind} className="h-4 w-4 text-muted-foreground" />
        <DialogTitle className="truncate text-base font-medium">
          {tile.asksForTable && !chosen
            ? "Which table, or make one?"
            : props.madeId && madeName
              ? madeName
              : `New ${tile.label.toLowerCase()}`}
        </DialogTitle>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-make-flow={tile.flow}>
        <FlowBody {...props} chosen={chosen} onName={setMadeName} />
      </div>
    </>
  );
}

function FlowBody(props: MakeFlowSheetProps & { chosen: { tableId: string; organizationId: string } | null; onName: (name: string | null) => void }) {
  const { tile, chosen, activeOrganizationId, activeState, onLand, onClose, madeId, onMade, onName } = props;
  if (tile.asksForTable && !chosen) return <TableChoice {...props} />;
  if (chosen) {
    return (
      <BuilderFor
        flow={tile.flow}
        {...chosen}
        madeId={madeId ?? null}
        onMade={onMade ?? (() => undefined)}
        onLand={onLand}
        onClose={onClose}
        onName={onName}
      />
    );
  }
  // A table is made where new things are saved; the one New table body asks for it when none is chosen.
  if (tile.flow === "table") return <NewTableBody />;
  // A portal is made where new things are saved: with none chosen, ask for it (A3).
  if (!activeOrganizationId) {
    return <OrganizationContextNotice state={activeState === "ready" ? "required" : activeState} what="New client portals" description={SAVED_WHERE_CHOSEN} compact />;
  }
  if (tile.flow === "portal") {
    return <PortalFlow organizationId={activeOrganizationId} madeId={madeId ?? null} onMade={onMade ?? (() => undefined)} onName={onName} />;
  }
  return null;
}

/** The portal flow: its id goes into the address once saved, and a reload reopens THAT portal. */
function PortalFlow({ organizationId, madeId, onMade, onName }: { organizationId: string; madeId: string | null; onMade: (id: string) => void; onName: (name: string | null) => void }) {
  const [saved, setSaved] = useState(Boolean(madeId));
  return (
    <div className="flex flex-col gap-3">
      {saved ? (
        <div className="flex flex-wrap items-center gap-2 text-sm" data-make-landing="">
          <SavedMark />
        </div>
      ) : null}
      <MakeMount organizationId={organizationId}>
        <MadeName flow="portal" tableId={null} madeId={madeId} onName={onName} />
        <PortalBuilder
          {...(madeId ? { portalId: madeId } : {})}
          onSaved={(id: string) => {
            onMade(id);
            setSaved(true);
          }}
        />
      </MakeMount>
    </div>
  );
}

/** Reads the made thing's own name (inside the mount, where the store client is) and reports it for the title. */
function MadeName({ flow, tableId, madeId, onName }: { flow: MakeFlow; tableId: string | null; madeId: string | null; onName: (name: string | null) => void }) {
  const client = useOptionalRecordsClient();
  useEffect(() => {
    if (!madeId || !client) return;
    let alive = true;
    const say = (name: string | null | undefined) => {
      if (alive && name && name.trim()) onName(name.trim());
    };
    void (async () => {
      if (flow === "portal") {
        const card = await client.portalCard({ portal_id: madeId as never });
        if (card.ok) say(card.data.title);
      } else if (flow === "form" && tableId) {
        const forms = await client.forms({ table_id: tableId as never });
        if (forms.ok) say(forms.data.find((f) => f.form_id === madeId)?.title);
      } else if (flow === "booking" && tableId) {
        const pages = await client.bookings({ table_id: tableId as never });
        if (pages.ok) say(pages.data.find((b) => b.form_id === madeId)?.title);
      } else if (flow === "checklist" && tableId) {
        const templates = await client.checklistTemplates({ about_table_id: tableId as never });
        if (templates.ok) say(templates.data.find((t) => t.template_id === madeId)?.name);
      }
    })();
    return () => {
      alive = false;
    };
  }, [client, flow, tableId, madeId, onName]);
  return null;
}

/** The one "it is saved" mark every flow shows once the made thing exists. */
function SavedMark() {
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground" role="status" data-make-saved="">
      <Check className="h-3.5 w-3.5" aria-hidden />
      Saved
    </span>
  );
}

/** Step 1, shared by every flow that collects into a table. */
function TableChoice({ tables: tablesRead, testOrganizationIds, activeOrganizationId, activeState, onChoose }: MakeFlowSheetProps) {
  const userId = useAppSelector(selectUserId);
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [making, setMaking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [askOrganization, setAskOrganization] = useState(false);

  const makeTable = async () => {
    // "New table" is offered before anything is typed (MAKE-HOME W5b: it appeared only after typing,
    // so a person with no table yet saw nothing to press). Unnamed, it is "New table"; she names it
    // and adds its questions in the builder that opens next.
    const typed = search.trim();
    const name = typed || "New table";
    if (!activeOrganizationId) {
      setOpen(false);
      setAskOrganization(true);
      return;
    }
    setMaking(true);
    setRefused(null);
    const client = createRecordsClient({
      dataSource: supabaseDataSource(createClient()),
      actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
      // org-filter: write-target a new table is made in the organization new things are saved to
      organizationId: activeOrganizationId,
    });
    const made = await declareTable(client, { name, slug: typed ? tokenFor(name) : `${tokenFor(name)}_${Date.now().toString(36)}` });
    setMaking(false);
    if (!made.ok) {
      // The store's own sentence; a statement timeout is said in a person's words (doorFailureLine).
      setRefused(doors.doorFailureLine({ message: made.error.message }));
      return;
    }
    onChoose(made.data, activeOrganizationId);
  };

  // The organization asked for on the first make has been chosen: make the table she named (ask and replay).
  useEffect(() => {
    if (!askOrganization || !activeOrganizationId) return;
    setAskOrganization(false);
    void makeTable();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- replays once, when the organization lands
  }, [askOrganization, activeOrganizationId]);

  if (tablesRead.phase === "reading") {
    return tablesRead.slow ? (
      <ReadFailed read={{ why: "Still reading. This is taking longer than usual.", retry: tablesRead.slow.retry }} />
    ) : (
      <Skeleton className="h-10 w-64" />
    );
  }
  if (tablesRead.phase === "failed") return <ReadFailed read={tablesRead} />;

  // The person's own tables in every organization she reaches (never the app's bookkeeping), the
  // most recently changed first and test organizations last; each names its organization.
  const tables = tablesRead.data
    .filter((t) => t.kind === "table" && !t.kept_by_the_app)
    .slice()
    .sort(
      (a, b) =>
        Number(testOrganizationIds.has(a.organization_id)) - Number(testOrganizationIds.has(b.organization_id)) ||
        Date.parse(b.updated_at ?? "") - Date.parse(a.updated_at ?? ""),
    );
  const q = search.trim().toLowerCase();
  const items = tables
    .filter((t) => !q || t.table_name.toLowerCase().includes(q) || t.organization_name.toLowerCase().includes(q))
    .slice(0, 200)
    .map((t) => ({
      id: t.table_id,
      label: t.table_name,
      detail: t.organization_name,
      picked: false,
      attrs: { "data-make-table-choice": t.table_id },
    }));
  const byId = new Map(tables.map((t) => [t.table_id, t]));


  return (
    <div className="flex flex-col gap-3" data-make-table-choice-step="">
      <PickOrAdd
        triggerLabel="Choose a table"
        triggerText="Choose a table"
        open={open}
        onOpenChange={setOpen}
        search={search}
        onSearch={setSearch}
        items={items}
        onPick={(id) => {
          const t = byId.get(id);
          if (t) onChoose(t.table_id, t.organization_id);
        }}
        empty={<p className="px-2 py-1.5 text-xs text-muted-foreground">{q ? "No table by that name" : "No tables yet"}</p>}
        add={{ label: search.trim() ? `New table “${search.trim()}”` : "New table", onAdd: () => void makeTable(), disabled: making }}
      />
      {making ? <Skeleton className="h-6 w-48" /> : null}
      {refused ? <p className="text-sm text-destructive">{refused}</p> : null}
      {askOrganization && !activeOrganizationId ? (
        <OrganizationContextNotice state={activeState === "ready" ? "required" : activeState} what="New tables" description={SAVED_WHERE_CHOSEN} compact />
      ) : null}
    </div>
  );
}

/** Step 2: the table's own builder, made NEW on open, mounted in the TABLE's organization. */
function BuilderFor({
  flow,
  tableId,
  organizationId,
  madeId,
  onMade,
  onLand,
  onClose,
  onName,
}: {
  flow: MakeFlow;
  tableId: string;
  organizationId: string;
  madeId: string | null;
  onMade: (id: string) => void;
  onLand: (href: string) => void;
  onClose: () => void;
  onName: (name: string | null) => void;
}) {
  const tableHref = `/data/${tableId}`;
  // Made and saved: from the address on a reload, or the moment the builder answers its id.
  const [saved, setSaved] = useState(Boolean(madeId));
  const keep = (id: string) => {
    onMade(id);
    setSaved(true);
  };
  // Reopened from the address: its link is there from the first paint.
  const [made, setMade] = useState<{ href: string | null; label: string } | null>(() =>
    !madeId
      ? null
      : flow === "dashboard"
        ? { href: `${tableHref}?dashboard=${madeId}`, label: "Open dashboard" }
        : flow === "booking"
          ? { href: bookingPath(madeId), label: "Booking link" }
          : null,
  );
  let builder: ReactNode = null;
  switch (flow) {
    case "form":
      builder = (
        <FormBuilder
          tableId={tableId}
          {...(madeId ? { activeFormId: madeId } : { startWithOne: true })}
          onActiveForm={(form) => {
            keep(form.id);
            setMade(form.state === "draft" ? { href: null, label: "" } : { href: publicFormPath(form.id), label: "Public link" });
          }}
        />
      );
      break;
    case "booking":
      builder = (
        <BookingBuilder
          tableId={tableId}
          {...(madeId ? { bookingId: madeId } : { startNew: true })}
          onSaved={(page) => {
            keep(page.form_id);
            setMade({ href: bookingPath(page.form_id), label: "Booking link" });
          }}
        />
      );
      break;
    case "dashboard":
      builder = (
        <DashboardCanvas
          tableId={tableId}
          {...(madeId ? { activeDashboardId: madeId } : { createOnMount: true })}
          onCreated={(id) => {
            keep(id);
            setMade({ href: `${tableHref}?dashboard=${id}`, label: "Open dashboard" });
          }}
        />
      );
      break;
    case "checklist":
      // Save stays here and says Saved (its id goes into the address; a second Save re-states it);
      // Cancel closes the flow. "Open table" below lands on the table's checklists.
      builder = (
        <ChecklistTemplateEditor
          aboutTableId={tableId}
          {...(madeId ? { templateId: madeId } : {})}
          onSaved={keep}
          onDone={onClose}
        />
      );
      break;
    default:
      builder = null;
  }
  const rail = flow === "form" ? "forms" : flow === "booking" ? "bookings" : flow === "checklist" ? "checklists" : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm" data-make-landing="">
        {saved ? <SavedMark /> : null}
        {made?.href ? (
          <Link href={made.href} target={flow === "dashboard" ? undefined : "_blank"} className="text-primary underline-offset-2 hover:underline">
            {made.label}
          </Link>
        ) : null}
        <Link href={rail ? `${tableHref}?rail=${rail}` : tableHref} className={cn("text-muted-foreground underline-offset-2 hover:underline")}>
          Open table
        </Link>
      </div>
      <MakeMount organizationId={organizationId}>
        <MadeName flow={flow} tableId={tableId} madeId={madeId} onName={onName} />
        {builder}
      </MakeMount>
    </div>
  );
}
