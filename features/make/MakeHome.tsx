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
import { ArrowLeft, ChevronRight } from "lucide-react";
import { createRecordsClient, supabaseDataSource } from "@ai-matrx/records/core";
import { bookingPath, publicFormPath } from "@ai-matrx/records";
import {
  BookingBuilder,
  ChecklistTemplateEditor,
  DashboardCanvas,
  ExampleTables,
  FormBuilder,
  PickOrAdd,
  PortalBuilder,
  declareTable,
  tokenFor,
} from "@ai-matrx/records-ui";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import * as doors from "@/features/unified-data/hub/doors";
import { buildDataHomeRows, type DataHomeRow } from "@/features/unified-data/home/dataHomeRows";
import { KindIcon } from "@/features/unified-data/home/dataHomeColumns";
import { fetchAccessibleKits, fetchKits } from "@/features/kits/service";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { KitCard } from "@/features/kits/components/KitCard";
import type { KitEntry } from "@/features/kits/types";
import { createClient } from "@/utils/supabase/client";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import {
  MAKE_FLOW_PARAM,
  MAKE_ORG_PARAM,
  MAKE_TABLE_PARAM,
  MAKE_TILES,
  tileFor,
  type MakeFlow,
  type MakeTile,
} from "./tiles";
import { answerForRecent, isTestOrganization, recentlyChanged } from "./recent";
import { MakeMount, NewTableBody, SavesTo } from "./MakeMount";

// ─────────────────────────────────────────────────────────────────────────────
// Two reads across every organization: Recent (the data home's one call) and step 1's tables.
// ─────────────────────────────────────────────────────────────────────────────

/** One door's answer on this page: reading, the store's words with Try again, or the rows. */
export type Read<T> =
  | { phase: "reading" }
  | { phase: "failed"; why: string; retry: () => void }
  | { phase: "read"; data: T };

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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` names everything `load` reads
  }, [key, attempt]);
  return read;
}

/**
 * RECENT: the data home's one call (`custom.data_home`), built into rows by the home's own builder,
 * with archived, test-organization and app-kept rows taken out first (recent.ts).
 */
function useRecentRead(userId: string | null, testOrganizationIds: ReadonlySet<string>, ready: boolean) {
  const testKey = [...testOrganizationIds].sort().join(",");
  return useRead<DataHomeRow[]>(userId && ready ? `${userId}|${testKey}` : null, async () => {
    const source = supabaseDataSource(createClient());
    const answered = await doors.dataHome(source, null);
    if (!answered.ok) return { ok: false, why: doors.doorFailureLine(answered.error) };
    const client = createRecordsClient({ dataSource: source, actor: { actor: "user", user_id: userId! }, organizationId: null });
    const built = await buildDataHomeRows({ client, dataSource: source, answer: answerForRecent(answered.data, testOrganizationIds) });
    return { ok: true, data: recentlyChanged(built.rows) };
  });
}

/**
 * STEP 1's LIST: every table the person can open in every organization she reaches — the lighter
 * `custom.data_home_tables` door alone, so "Which table" never waits on the whole home.
 */
function useTablesRead(userId: string | null) {
  return useRead<doors.DataHomeTableRow[]>(userId, async () => {
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
  const { organizations, loading: organizationsLoading } = useUserOrganizations();
  const testOrganizationIds = useMemo(
    () => new Set(organizations.filter((o) => isTestOrganization(o)).map((o) => o.id)),
    [organizations],
  );
  const recent = useRecentRead(userId ?? null, testOrganizationIds, !organizationsLoading);
  const tables = useTablesRead(userId ?? null);

  const flow = tileFor(params.get(MAKE_FLOW_PARAM));
  const go = (next: Record<string, string | null>) => {
    const q = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) q.delete(k);
      else q.set(k, v);
    }
    const s = q.toString();
    router.push(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };
  const open = (tile: MakeTile) => {
    if (tile.href) router.push(tile.href);
    else go({ [MAKE_FLOW_PARAM]: tile.flow, [MAKE_TABLE_PARAM]: null, [MAKE_ORG_PARAM]: null });
  };
  const close = () => go({ [MAKE_FLOW_PARAM]: null, [MAKE_TABLE_PARAM]: null, [MAKE_ORG_PARAM]: null });

  return (
    <>
      <PageHeader>
        <HeaderStructured back title="Make" />
      </PageHeader>
      <div className="h-full overflow-y-auto overflow-x-hidden bg-textured">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 pb-16 pt-[calc(var(--shell-header-h)+1.25rem)] sm:px-6">
          <section className="flex flex-col gap-3" aria-labelledby="make-heading">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h1 id="make-heading" className="text-2xl font-semibold tracking-tight text-foreground">
                What do you want to make?
              </h1>
              <SavesTo />
            </div>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3" data-make-tiles="">
              {MAKE_TILES.map((tile) => (
                <li key={tile.id} className="min-w-0">
                  <button
                    type="button"
                    data-make-tile={tile.id}
                    onClick={() => open(tile)}
                    className="group flex h-full w-full min-w-0 items-start gap-3 rounded-xl border border-border bg-card p-4 text-left shadow-sm transition hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <KindIcon kind={tile.kind} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{tile.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{tile.what}</span>
                    </span>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition group-hover:opacity-100" />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <RecentSection recent={recent} />

          <TemplatesSection
            activeOrganizationId={active.organizationState === "ready" ? active.organizationId : null}
            onOpenTable={(id) => router.push(`/data-v2/${id}`)}
          />
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
      {recent.phase === "reading" ? (
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
                <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
                  <span className="truncate text-sm text-foreground sm:min-w-0 sm:flex-1">{row.name}</span>
                  <span className="truncate text-xs text-muted-foreground sm:max-w-[40%]">{row.organizationName ?? "—"}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{whenWords(row.updatedAt)}</span>
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
      <Button size="sm" variant="outline" onClick={read.retry}>
        Try again
      </Button>
    </div>
  );
}

function whenWords(at: string | null): string {
  if (!at) return "—";
  const ms = Date.now() - Date.parse(at);
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 30 ? `${d}d ago` : new Date(at).toLocaleDateString();
}

/**
 * The kits the person can reach: the platform's own (the system organization's, `fetchKits`) and
 * every kit her organizations saved (`fetchAccessibleKits`) — the kits service's own doors, read in
 * the browser so the page never waits on them. A failed read shows no kits row, never an error wall.
 */
function useKits() {
  const [kits, setKits] = useState<KitEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const client = createClient();
      // org-fallback-deliberate: the platform's own kits are read from the platform's organization by name, not a stand-in for the person's
      const platformOrganizationId = await resolveSystemOrgId(client).catch(() => null);
      const [platform, mine] = await Promise.all([
        platformOrganizationId ? fetchKits(client, platformOrganizationId) : Promise.resolve({ kits: [], error: null }),
        fetchAccessibleKits(client, platformOrganizationId),
      ]);
      if (platform.error) console.error("[/make] platform kits read failed:", platform.error);
      if (mine.error) console.error("[/make] organization kits read failed:", mine.error);
      if (alive) setKits([...mine.kits, ...platform.kits]);
    })();
    return () => {
      alive = false;
    };
  }, []);
  return kits;
}

function TemplatesSection({
  activeOrganizationId,
  onOpenTable,
}: {
  activeOrganizationId: string | null;
  onOpenTable: (tableId: string) => void;
}) {
  const kits = useKits() ?? [];
  const [examples, setExamples] = useState(true);
  return (
    <section className="flex flex-col gap-3" aria-labelledby="make-templates">
      <h2 id="make-templates" className="text-sm font-medium text-muted-foreground">
        Start from a template
      </h2>
      {activeOrganizationId ? (
        examples ? (
          <MakeMount organizationId={activeOrganizationId}>
            <ExampleTables onBuilt={onOpenTable} onClose={() => setExamples(false)} className="bg-card" />
          </MakeMount>
        ) : (
          <Button size="sm" variant="outline" className="self-start" onClick={() => setExamples(true)}>
            Real business examples
          </Button>
        )
      ) : null}
      {kits.length > 0 ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-make-kits="">
          {kits.map((kit) => (
            <li key={`${kit.organizationId ?? "platform"}:${kit.key}`} className="min-w-0">
              <KitCard kit={kit} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
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
  onChoose: (tableId: string, organizationId: string) => void;
  onBack: () => void;
  onClose: () => void;
  onLand: (href: string) => void;
}

export function MakeFlowSheet(props: MakeFlowSheetProps) {
  const { tile, tableId, organizationId, onBack } = props;
  const chosen = tile.asksForTable && tableId && organizationId ? { tableId, organizationId } : null;
  return (
    <>
      <div className="flex shrink-0 items-center gap-2">
        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <KindIcon kind={tile.kind} className="h-4 w-4 text-muted-foreground" />
        <DialogTitle className="truncate text-base font-medium">
          {tile.asksForTable && !chosen ? "Which table, or make one?" : `New ${tile.label.toLowerCase()}`}
        </DialogTitle>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto" data-make-flow={tile.flow}>
        <FlowBody {...props} chosen={chosen} />
      </div>
    </>
  );
}

function FlowBody(props: MakeFlowSheetProps & { chosen: { tableId: string; organizationId: string } | null }) {
  const { tile, chosen, activeOrganizationId, activeState, onLand } = props;
  if (tile.asksForTable && !chosen) return <TableChoice {...props} />;
  if (chosen) return <BuilderFor flow={tile.flow} {...chosen} onLand={onLand} />;
  // A table is made where new things are saved; the one New table body asks for it when none is chosen.
  if (tile.flow === "table") return <NewTableBody />;
  // Table and portal are made where new things are saved: with none chosen, ask for it (A3).
  if (!activeOrganizationId) {
    return <OrganizationContextNotice state={activeState === "ready" ? "required" : activeState} what="New tables" compact />;
  }
  if (tile.flow === "portal") {
    return (
      <MakeMount organizationId={activeOrganizationId}>
        <PortalBuilder onSaved={() => toast.success("Portal saved")} />
      </MakeMount>
    );
  }
  return null;
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
    const name = search.trim();
    if (!name) return;
    if (!activeOrganizationId) {
      setOpen(false);
      setAskOrganization(true);
      return;
    }
    setMaking(true);
    setRefused(null);
    const gate = await UNIFIED_DATA_CAMPAIGN.check(activeOrganizationId);
    if (gate.state !== "on") {
      setMaking(false);
      setRefused("Data records are not on in this organization.");
      return;
    }
    const client = createRecordsClient({
      dataSource: supabaseDataSource(createClient()),
      actor: userId ? { actor: "user", user_id: userId } : { actor: "user" },
      // org-filter: write-target a new table is made in the organization new things are saved to
      organizationId: activeOrganizationId,
    });
    const made = await declareTable(client, { name, slug: tokenFor(name) });
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

  if (tablesRead.phase === "reading") return <Skeleton className="h-10 w-64" />;
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
        add={search.trim() ? { label: `New table “${search.trim()}”`, onAdd: () => void makeTable(), disabled: making } : null}
      />
      {making ? <Skeleton className="h-6 w-48" /> : null}
      {refused ? <p className="text-sm text-destructive">{refused}</p> : null}
      {askOrganization && !activeOrganizationId ? (
        <OrganizationContextNotice state={activeState === "ready" ? "required" : activeState} what="New tables" compact />
      ) : null}
    </div>
  );
}

/** Step 2: the table's own builder, made NEW on open, mounted in the TABLE's organization. */
function BuilderFor({
  flow,
  tableId,
  organizationId,
  onLand,
}: {
  flow: MakeFlow;
  tableId: string;
  organizationId: string;
  onLand: (href: string) => void;
}) {
  const [made, setMade] = useState<{ href: string | null; label: string } | null>(null);
  const tableHref = `/data-v2/${tableId}`;
  let builder: ReactNode = null;
  switch (flow) {
    case "form":
      builder = (
        <FormBuilder
          tableId={tableId}
          createOnMount
          onActiveForm={(form) =>
            setMade(form.state === "draft" ? { href: null, label: "" } : { href: publicFormPath(form.id), label: "Public link" })
          }
        />
      );
      break;
    case "booking":
      builder = <BookingBuilder tableId={tableId} startNew onSaved={(page) => setMade({ href: bookingPath(page.form_id), label: "Booking link" })} />;
      break;
    case "dashboard":
      builder = (
        <DashboardCanvas
          tableId={tableId}
          createOnMount
          onCreated={(id) => setMade({ href: `${tableHref}?dashboard=${id}`, label: "Open dashboard" })}
        />
      );
      break;
    case "checklist":
      builder = <ChecklistTemplateEditor aboutTableId={tableId} onDone={() => onLand(`${tableHref}?rail=checklists`)} />;
      break;
    default:
      builder = null;
  }
  const rail = flow === "form" ? "forms" : flow === "booking" ? "bookings" : null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-sm" data-make-landing="">
        {made?.href ? (
          <Link href={made.href} target={flow === "dashboard" ? undefined : "_blank"} className="text-primary underline-offset-2 hover:underline">
            {made.label}
          </Link>
        ) : null}
        <Link href={rail ? `${tableHref}?rail=${rail}` : tableHref} className={cn("text-muted-foreground underline-offset-2 hover:underline")}>
          Open table
        </Link>
      </div>
      <MakeMount organizationId={organizationId}>{builder}</MakeMount>
    </div>
  );
}
