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
// THE TWO ORGANIZATIONS (policies/active-org-is-never-a-list-filter.md):
//   · reads — Recent and "Which table" — walk EVERY organization the person reaches (the data home's
//     one call with no organization), and every row names its organization;
//   · a builder mounts in the organization of the TABLE chosen in step 1 — never silently the
//     active one; a NEW table, a portal and an example are made where new things are saved (the
//     active organization), and with none chosen the page says so in one line and the first make
//     asks for it (A3) — it never picks a default.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ChevronRight, Building2 } from "lucide-react";
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
  RecordsMount,
  TablesHome,
  declareTable,
  personActor,
  tokenFor,
} from "@ai-matrx/records-ui";

import PageHeader from "@/features/shell/components/header/PageHeader";
import HeaderStructured from "@/features/shell/components/header/variants/variants/HeaderStructured";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationName } from "@/features/scopes/redux/selectors/active-context";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { useUserOrganizations } from "@/features/organizations/hooks";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { OrganizationPickerPopover } from "@/features/organizations/components/OrganizationPickerPopover";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import { useUnifiedDataCampaign } from "@/lib/knobs/useUnifiedDataCampaignGate";
import { UnifiedDataSwitchNotice } from "@/features/unified-data/components/UnifiedDataSwitchNotice";
import {
  recordsUiHostFor,
  useRecordsDataSource,
  useRecordsUiPorts,
} from "@/features/data-tables/records-ui-host/recordsUiHost";
import { createRecordsRealtimePort } from "@/features/unified-data/realtime/recordsRealtimePort";
import * as doors from "@/features/unified-data/hub/doors";
import { buildDataHomeRows, type DataHomeRow } from "@/features/unified-data/home/dataHomeRows";
import { KindIcon } from "@/features/unified-data/home/dataHomeColumns";
import { fetchAccessibleKits } from "@/features/kits/service";
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

// ─────────────────────────────────────────────────────────────────────────────
// The store mount for ONE organization: the real host (recordsUiHostFor + useRecordsUiPorts, the
// same ports every table surface binds) behind the organization's store switch.
// ─────────────────────────────────────────────────────────────────────────────

export function MakeMount({ organizationId, children }: { organizationId: string; children: ReactNode }) {
  const userId = useAppSelector(selectUserId);
  const dataSource = useRecordsDataSource();
  const ports = useRecordsUiPorts({ organizationId, dataSource });
  const realtime = useMemo(() => createRecordsRealtimePort(organizationId), [organizationId]);
  const campaign = useUnifiedDataCampaign({
    organizationId,
    organizationState: "ready",
    storeSwitch: (organization) => UNIFIED_DATA_CAMPAIGN.check(organization),
  });
  if (campaign.state !== "on") return <UnifiedDataSwitchNotice gate={campaign} what="Data records" />;
  return (
    <RecordsMount
      letTheStoreDecideRights
      config={{ dataSource, actor: personActor(userId), organizationId, realtime }}
      host={recordsUiHostFor({ ports, merged: false })}
    >
      {children}
    </RecordsMount>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The data home's one answer, read once for the page: Recent and "Which table" both come from it.
// ─────────────────────────────────────────────────────────────────────────────

type HomeRead =
  | { phase: "reading" }
  | { phase: "failed"; why: string }
  | { phase: "read"; answer: doors.DataHomeAnswer; recent: DataHomeRow[] };

function useMakeHomeRead(userId: string | null, testOrganizationIds: ReadonlySet<string>, ready: boolean): HomeRead {
  const [read, setRead] = useState<HomeRead>({ phase: "reading" });
  const testKey = [...testOrganizationIds].sort().join(",");
  useEffect(() => {
    if (!userId || !ready) return;
    let alive = true;
    void (async () => {
      const source = supabaseDataSource(createClient());
      const answered = await doors.dataHome(source, null);
      if (!alive) return;
      if (!answered.ok) {
        setRead({ phase: "failed", why: doors.doorFailureLine(answered.error) });
        return;
      }
      const client = createRecordsClient({ dataSource: source, actor: { actor: "user", user_id: userId }, organizationId: null });
      const built = await buildDataHomeRows({
        client,
        dataSource: source,
        answer: answerForRecent(answered.data, testOrganizationIds),
      });
      if (!alive) return;
      setRead({ phase: "read", answer: answered.data, recent: recentlyChanged(built.rows) });
    })().catch((err: unknown) => {
      if (alive) setRead({ phase: "failed", why: err instanceof Error ? err.message : String(err) });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the set is keyed by its contents
  }, [userId, ready, testKey]);
  return read;
}

// ─────────────────────────────────────────────────────────────────────────────
// The page.
// ─────────────────────────────────────────────────────────────────────────────

export interface MakeHomeProps {
  /** The platform's own kits, read on the server (features/kits/service.ts fetchKits). */
  platformKits: KitEntry[];
  platformOrganizationId: string | null;
}

export default function MakeHome({ platformKits, platformOrganizationId }: MakeHomeProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const userId = useAppSelector(selectUserId);
  // org-filter: write-target the active organization is only where a NEW table, portal or example is saved; every read on this page walks all organizations
  const active = useOrganizationRequired();
  // org-filter: write-target its name labels where new things are saved, nothing is read through it
  const activeName = useAppSelector(selectActiveOrganizationName);
  const { organizations, loading: organizationsLoading } = useUserOrganizations();
  const testOrganizationIds = useMemo(
    () => new Set(organizations.filter((o) => isTestOrganization(o)).map((o) => o.id)),
    [organizations],
  );
  const home = useMakeHomeRead(userId ?? null, testOrganizationIds, !organizationsLoading);

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
              <SavesTo state={active.organizationState} name={activeName ?? null} />
            </div>
            <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4" data-make-tiles="">
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

          <RecentSection home={home} />

          <TemplatesSection
            activeOrganizationId={active.organizationState === "ready" ? active.organizationId : null}
            platformKits={platformKits}
            platformOrganizationId={platformOrganizationId}
            onOpenTable={(id) => router.push(`/data-v2/${id}`)}
          />
        </div>
      </div>

      <Dialog open={flow !== null} onOpenChange={(next) => (next ? undefined : close())}>
        <DialogContent className="flex max-h-[90dvh] w-[min(56rem,calc(100vw-2rem))] max-w-none flex-col gap-3 overflow-hidden p-4">
          {flow ? (
            <MakeFlowSheet
              tile={flow}
              home={home}
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

/** One line: where new things are saved, and the control that changes it (A3). */
function SavesTo({ state, name }: { state: ReturnType<typeof useOrganizationRequired>["organizationState"]; name: string | null }) {
  if (state === "resolving") return <Skeleton className="h-7 w-48" />;
  if (state !== "ready" && state !== "required") return null;
  const label = state === "ready" && name ? `New things save to ${name}` : "Choose where new things are saved";
  return (
    <OrganizationPickerPopover
      align="end"
      trigger={
        <Button size="sm" variant="ghost" className="max-w-full gap-1.5 text-muted-foreground" data-make-saves-to={state}>
          <Building2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </Button>
      }
    />
  );
}

function RecentSection({ home }: { home: HomeRead }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby="make-recent">
      <h2 id="make-recent" className="text-sm font-medium text-muted-foreground">
        Recently changed
      </h2>
      {home.phase === "reading" ? (
        <Skeleton className="h-24 w-full" />
      ) : home.phase === "failed" ? (
        <p className="text-sm text-destructive">{home.why}</p>
      ) : home.recent.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing changed yet</p>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" data-make-recent="">
          {home.recent.map((row) => (
            <li key={row.id} data-make-recent-row={row.kind}>
              <Link href={row.href} className="flex min-w-0 items-center gap-3 px-3 py-2.5 hover:bg-muted">
                <KindIcon kind={row.kind} className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{row.name}</span>
                <span className="hidden max-w-[40%] shrink truncate text-xs text-muted-foreground sm:block">
                  {row.organizationName ?? "—"}
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

function useOrganizationKits(platformOrganizationId: string | null) {
  const [kits, setKits] = useState<KitEntry[] | null>(null);
  useEffect(() => {
    let alive = true;
    void fetchAccessibleKits(createClient(), platformOrganizationId).then((r) => {
      if (alive) setKits(r.error ? [] : r.kits);
    });
    return () => {
      alive = false;
    };
  }, [platformOrganizationId]);
  return kits;
}

function TemplatesSection({
  activeOrganizationId,
  platformKits,
  platformOrganizationId,
  onOpenTable,
}: {
  activeOrganizationId: string | null;
  platformKits: KitEntry[];
  platformOrganizationId: string | null;
  onOpenTable: (tableId: string) => void;
}) {
  const orgKits = useOrganizationKits(platformOrganizationId);
  const [examples, setExamples] = useState(true);
  const kits = [...(orgKits ?? []), ...platformKits];
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
  home: HomeRead;
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
  // Table and portal are made where new things are saved: with none chosen, ask for it (A3).
  if (!activeOrganizationId) {
    return <OrganizationContextNotice state={activeState === "ready" ? "required" : activeState} what="New tables" compact />;
  }
  if (tile.flow === "table") {
    return (
      <MakeMount organizationId={activeOrganizationId}>
        <TablesHome makingOnly onOpenTable={(id) => onLand(`/data-v2/${id}`)} />
      </MakeMount>
    );
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
function TableChoice({ home, testOrganizationIds, activeOrganizationId, activeState, onChoose }: MakeFlowSheetProps) {
  const userId = useAppSelector(selectUserId);
  const [open, setOpen] = useState(true);
  const [search, setSearch] = useState("");
  const [making, setMaking] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const [askOrganization, setAskOrganization] = useState(false);

  if (home.phase === "reading") return <Skeleton className="h-10 w-64" />;
  if (home.phase === "failed") return <p className="text-sm text-destructive">{home.why}</p>;

  // The person's own tables in every organization she reaches (never the app's bookkeeping), the
  // most recently changed first and test organizations last; each names its organization.
  const tables = home.answer.tables
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
      setRefused(made.error.message);
      return;
    }
    onChoose(made.data, activeOrganizationId);
  };

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
        empty={<p className="px-2 py-1.5 text-xs text-muted-foreground">No tables yet</p>}
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
