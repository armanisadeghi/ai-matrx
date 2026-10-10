"use client";

// features/workflow-runtime/simple-builder/WorkflowBuilderPage.tsx
//
// /workflows/builder/<tableId> — THE SIMPLE WORKFLOW BUILDER (lane 11 wave 2; champion: Airtable
// automations). Left: every Workflow on this table — builder Workflows and the six existing
// features as read-only presets that open their own editor. Right: the trigger, the condition and
// the stack of steps, or the Runs tab. On/off, "Test with a record", Runs and "Open in Workflow
// Studio" live in the page's header (`EntityModeHeader`), never in a new row. On a phone the list
// opens from the header's sheet as a bottom sheet.
//
// The address is the state: `?workflow=<id>|new`, `?tab=runs`.

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bell,
  Bot,
  Columns3,
  ExternalLink,
  FlaskConical,
  Mail,
  MousePointerClick,
  Plus,
  Power,
  PowerOff,
  Save,
  Send,
  Webhook,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { recordsDataSource } from "@ai-matrx/records-ui";
import { RecordsProvider, useTable } from "@ai-matrx/records/react";
import {
  RecordPicker,
  TableScope,
  useTablesAnywhere,
} from "@ai-matrx/records-ui/pickers";
import { BasicInput, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { StatusBadge } from "@/components/official/status-badge/StatusBadge";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { useIsMobile } from "@ai-matrx/kit/media-query";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
import { useObjectOrganization } from "@/features/unified-data/objectOrganization";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import {
  BuilderRefusal,
  createBuilderWorkflow,
  listBuilderRuns,
  listTableWorkflows,
  readBuilderWorkflow,
  saveBuilderWorkflow,
  testBuilderWorkflow,
  turnBuilderWorkflowOff,
  turnBuilderWorkflowOn,
  type BuilderRun,
  type BuilderView,
  type TableWorkflowKind,
  type TableWorkflowRow,
} from "./builderApi";
import { TRIGGER_LABEL, emptySpec, specForSave, type BuilderSpec } from "./builderSpec";
import { BuilderEditor } from "./BuilderEditor";
import { BuilderRunsList } from "./BuilderRunsList";
import { useAppRecordsConfig } from "@/features/data-tables/records-ui-host/recordsUiHost";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
const KIND_ICON: Record<TableWorkflowKind, LucideIcon> = {
  workflow: Workflow,
  button: MousePointerClick,
  agent_on_change: Bot,
  stage_rule: Columns3,
  notify: Bell,
  digest: Mail,
  webhook: Webhook,
  enrich: Send,
};

/** Where a row's own editor lives. Presets keep their engine and their editor (adopt, don't replace). */
function editorHref(
  row: TableWorkflowRow,
  tableId: string,
): { href: string; external: boolean } | null {
  const open = row.open as Record<string, string | undefined>;
  switch (open.editor) {
    case "workflow_builder":
      return {
        href: `/workflows/builder/${tableId}?workflow=${open.workflow_id}`,
        external: false,
      };
    case "workflow_studio":
      return {
        href: `${WORKFLOWS_APP_URL}/workflows/${open.workflow_id}`,
        external: true,
      };
    case "scheduled_task":
      return open.task_id
        ? { href: `/schedules/${open.task_id}`, external: false }
        : null;
    case "subscriptions":
      return {
        href: `/data/${tableId}?rail=notifications`,
        external: false,
      };
    case "row_actions":
    case "pipeline":
    case "webhooks":
    case "enrich":
      return { href: `/data/${tableId}?rail=settings`, external: false };
    default:
      return null;
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function WorkflowBuilderPage({ tableId }: { tableId: string }) {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId) ?? null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const workflowParam = searchParams.get("workflow");
  const tab = searchParams.get("tab") === "runs" ? "runs" : "build";

  const [dataSource] = useState(() => recordsDataSource(createClient()));
  // THIS table's organization comes from its own id (custom.where_id_opens, one cheap read) and
  // its name from the store; the list of every table is only for the pickers, and a slow or
  // refused list never holds the builder (it is the heaviest read on the page).
  const object = useObjectOrganization(dataSource, tableId);
  const [tableRead, setTableRead] = useState<string | null>(null);
  const everyTable = useTablesAnywhere(dataSource);
  const organizationId =
    object.state === "found" ? object.organizationId : null;
  const ownRow = organizationId
    ? {
        table_id: tableId,
        table_name:
          tableRead ??
          everyTable.rows.find((t) => t.table_id === tableId)?.table_name ??
          "Table",
        organization_id: organizationId,
        organization_name: "",
        kind: null,
        platform_owned: false,
      }
    : null;
  const tables = {
    loading: everyTable.loading,
    error: everyTable.error,
    rows: ownRow
      ? [ownRow, ...everyTable.rows.filter((t) => t.table_id !== tableId)]
      : everyTable.rows,
  };
  const table = ownRow;

  // ── The list ──
  const [rows, setRows] = useState<TableWorkflowRow[] | null>(null);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listNonce, setListNonce] = useState(0);
  useEffect(() => {
    if (!organizationId) return;
    let live = true;
    listTableWorkflows(dispatch, organizationId, tableId)
      .then((answer) => {
        if (!live) return;
        setRows(answer.workflows);
        setUnavailable(answer.unavailable ?? []);
        setListError(null);
      })
      .catch((e) => live && setListError(errorText(e)));
    return () => {
      live = false;
    };
  }, [dispatch, organizationId, tableId, listNonce]);

  // ── The open Workflow ──
  const firstBuilder = rows?.find(
    (r) =>
      r.kind === "workflow" &&
      (r.open as { editor?: string }).editor === "workflow_builder",
  );
  const selectedId =
    workflowParam === "new"
      ? null
      : (workflowParam ??
        (firstBuilder?.open as { workflow_id?: string } | undefined)
          ?.workflow_id ??
        null);
  const [view, setView] = useState<BuilderView | null>(null);
  const [spec, setSpec] = useState<BuilderSpec>(() => emptySpec(tableId));
  const [name, setName] = useState("");
  const [dirty, setDirty] = useState(false);
  const [issues, setIssues] = useState<{ field: string; says: string }[]>([]);
  const [says, setSays] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "save" | "on" | "off" | "test">(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const isMobile = useIsMobile();
  // Picking a Workflow from the phone's sheet closes it.
  useEffect(() => setListOpen(false), [selectedId, workflowParam]);

  useEffect(() => {
    setIssues([]);
    setSays(null);
    setDirty(false);
    if (!organizationId) return;
    if (!selectedId) {
      setView(null);
      setSpec(emptySpec(tableId));
      setName("");
      setLoadError(null);
      return;
    }
    let live = true;
    readBuilderWorkflow(dispatch, organizationId, selectedId)
      .then((v) => {
        if (!live) return;
        setView(v);
        setSpec(v.spec ?? emptySpec(tableId));
        setName(v.name);
        setLoadError(null);
      })
      .catch((e) => live && setLoadError(errorText(e)));
    return () => {
      live = false;
    };
  }, [dispatch, organizationId, selectedId, tableId]);

  // ── Runs ──
  const [runs, setRuns] = useState<BuilderRun[] | null>(null);
  const [runsError, setRunsError] = useState<string | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsNonce, setRunsNonce] = useState(0);
  useEffect(() => {
    if (tab !== "runs" || !organizationId || !selectedId) return;
    let live = true;
    setRunsLoading(true);
    listBuilderRuns(dispatch, organizationId, selectedId)
      .then((r) => {
        if (!live) return;
        setRuns(r.runs);
        setRunsError(null);
      })
      .catch((e) => live && setRunsError(errorText(e)))
      .finally(() => live && setRunsLoading(false));
    return () => {
      live = false;
    };
  }, [dispatch, organizationId, selectedId, tab, runsNonce]);
  // A run in flight finishes on the server; look again while the tab is open.
  useEffect(() => {
    if (tab !== "runs") return;
    const t = setInterval(() => setRunsNonce((n) => n + 1), 5000);
    return () => clearInterval(t);
  }, [tab]);

  const go = (params: { workflow?: string | null; tab?: "build" | "runs" }) => {
    const next = new URLSearchParams(searchParams.toString());
    if (params.workflow !== undefined) {
      if (params.workflow) next.set("workflow", params.workflow);
      else next.delete("workflow");
    }
    if (params.tab) {
      if (params.tab === "runs") next.set("tab", "runs");
      else next.delete("tab");
    }
    router.replace(`/workflows/builder/${tableId}?${next.toString()}`);
  };

  const detached = !!view?.detached;
  const ownerOnly = !!view && view.can_edit === false;
  const readOnly = detached || ownerOnly;
  const isOn = !!view?.is_on;
  const tableName = table?.table_name ?? "Table";

  const refused = (e: unknown) => {
    if (e instanceof BuilderRefusal) {
      setIssues(e.issues);
      setSays(e.message);
    } else setSays(errorText(e));
  };

  /** Save; a new Workflow is created on its first save. Answers the saved view. */
  const save = async (): Promise<BuilderView | null> => {
    if (!organizationId) return null;
    setIssues([]);
    setSays(null);
    const body = specForSave(spec);
    const named = name.trim() || `When ${tableName} changes`;
    try {
      const saved = view
        ? await saveBuilderWorkflow(
            dispatch,
            organizationId,
            view.workflow_id,
            body,
            named,
            view.updated_at,
          )
        : await createBuilderWorkflow(dispatch, organizationId, named, body);
      setView(saved);
      setName(saved.name);
      setDirty(false);
      // The list shows it at once; the re-read below only confirms (it can take a while).
      setRows((held) => {
        const row: TableWorkflowRow = {
          kind: "workflow",
          name: saved.name,
          is_on: Boolean(saved.is_on),
          open: { editor: "workflow_builder", workflow_id: saved.workflow_id },
        };
        const list = held ?? [];
        const at = list.findIndex(
          (r) =>
            (r.open as { workflow_id?: string }).workflow_id ===
            saved.workflow_id,
        );
        return at >= 0
          ? list.map((r, i) => (i === at ? { ...r, ...row } : r))
          : [row, ...list];
      });
      setListNonce((n) => n + 1);
      if (!view) go({ workflow: saved.workflow_id });
      return saved;
    } catch (e) {
      refused(e);
      return null;
    }
  };

  const onSave = async () => {
    setBusy("save");
    const saved = await save();
    setBusy(null);
    if (saved) toast.success("Saved");
  };

  const onToggle = async () => {
    if (!organizationId) return;
    setBusy(isOn ? "off" : "on");
    try {
      if (isOn) {
        await turnBuilderWorkflowOff(
          dispatch,
          organizationId,
          view!.workflow_id,
        );
        toast.success("Turned off");
      } else {
        const saved = dirty || !view ? await save() : view;
        if (!saved) return;
        await turnBuilderWorkflowOn(
          dispatch,
          organizationId,
          saved.workflow_id,
        );
        toast.success("Turned on");
      }
      const fresh = await readBuilderWorkflow(
        dispatch,
        organizationId,
        view?.workflow_id ?? selectedId!,
      );
      setView(fresh);
      setListNonce((n) => n + 1);
    } catch (e) {
      refused(e);
    } finally {
      setBusy(null);
    }
  };

  const onTest = async (recordId: string) => {
    if (!organizationId || !view) return;
    setBusy("test");
    setSays(null);
    try {
      await testBuilderWorkflow(
        dispatch,
        organizationId,
        view.workflow_id,
        recordId,
      );
      toast.success("Test started");
      go({ tab: "runs" });
      setRunsNonce((n) => n + 1);
    } catch (e) {
      refused(e);
    } finally {
      setBusy(null);
    }
  };

  // ── The header ──
  const builderRows = (rows ?? []).filter(
    (r) => (r.open as { editor?: string }).editor === "workflow_builder",
  );
  const status = view ? (
    <StatusBadge
      label={detached ? "Edited in Workflow Studio" : isOn ? "On" : "Off"}
      tone={detached ? "info" : isOn ? "success" : "neutral"}
      icon={isOn ? Power : PowerOff}
      size="sm"
    />
  ) : null;
  const studioHref = view
    ? `${WORKFLOWS_APP_URL}/workflows/${view.workflow_id}`
    : null;
  const header = (
    <EntityModeHeader
      backHref={`/data/${tableId}`}
      entityLabel={
        view ? view.name : organizationId ? "New workflow" : "Workflows"
      }
      entityStatus={status}
      entityOptions={builderRows.map((r) => {
        const id = (r.open as { workflow_id?: string }).workflow_id ?? "";
        return {
          label: r.name,
          href: `/workflows/builder/${tableId}?workflow=${id}`,
          active: id === selectedId,
        };
      })}
      modes={[
        {
          name: "Build",
          href: `/workflows/builder/${tableId}?workflow=${selectedId ?? "new"}`,
        },
        {
          name: "Runs",
          href: `/workflows/builder/${tableId}?workflow=${selectedId ?? "new"}&tab=runs`,
        },
      ]}
      activeModeHref={`/workflows/builder/${tableId}?workflow=${selectedId ?? "new"}${tab === "runs" ? "&tab=runs" : ""}`}
      onModeSelect={(href) =>
        go({ tab: href.endsWith("tab=runs") ? "runs" : "build" })
      }
      actions={[
        ...(readOnly || !organizationId
          ? []
          : [
              {
                label: busy === "save" ? "Saving…" : "Save",
                icon: Save,
                onPress: () => void onSave(),
                disabled: busy !== null || (!dirty && !!view),
              },
              {
                label: isOn
                  ? busy === "off"
                    ? "Turning off…"
                    : "Turn off"
                  : busy === "on"
                    ? "Turning on…"
                    : "Turn on",
                icon: isOn ? PowerOff : Power,
                onPress: () => void onToggle(),
                disabled: busy !== null,
                primary: !isOn,
                pinnedOnPhone: true,
              },
            ]),
        ...(view && !readOnly
          ? [
              {
                label: busy === "test" ? "Testing…" : "Test with a record",
                icon: FlaskConical,
                onPress: () => setTestOpen(true),
                disabled: busy !== null,
              },
            ]
          : []),
        {
          label: "Workflows on this table",
          icon: Workflow,
          onPress: () => setListOpen(true),
          phoneOnly: true,
        },
        ...(studioHref
          ? [
              {
                label: "Open in Workflow Studio",
                icon: ExternalLink,
                href: studioHref,
                newTab: true,
              },
            ]
          : []),
      ]}
    />
  );

  // ── The list ──
  const list = (
    <WorkflowList
      rows={rows}
      error={listError}
      unavailable={unavailable}
      tableId={tableId}
      selectedId={selectedId}
      selectedTrigger={`${tableName} record ${TRIGGER_LABEL[spec.trigger.event]}`}
      newOpen={workflowParam === "new" && !view}
      onNew={() => go({ workflow: "new", tab: "build" })}
    />
  );

  // ── The right side ──
  let main: ReactNode;
  if (object.state === "unavailable")
    main = <p className="text-sm text-destructive">{object.why}<ErrorAlchemyMenu error={object.why} /></p>;
  else if (!table)
    main = (
      <p className="text-sm text-muted-foreground">
        {object.state === "resolving"
          ? "Opening the table…"
          : "This table isn't one you can open."}
      </p>
    );
  else if (loadError)
    main = <p className="text-sm text-destructive">{loadError}<ErrorAlchemyMenu error={loadError} /></p>;
  else if (tab === "runs")
    main = view ? (
      <div className="flex flex-col gap-3">
        <BuilderRunsList runs={runs} loading={runsLoading} error={runsError} />
      </div>
    ) : (
      <p className="text-sm text-muted-foreground">
        Save this Workflow to see its runs
      </p>
    );
  else
    main = (
      <div className="flex flex-col gap-3">
        {detached ? (
          <ReadOnlyLine
            says={view?.detached_says ?? "Edited in Workflow Studio."}
            action={
              studioHref ? (
                <a
                  href={studioHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Open
                </a>
              ) : null
            }
          />
        ) : ownerOnly ? (
          <ReadOnlyLine
            says={
              view?.can_edit_says ?? "Only its owner can change this Workflow."
            }
          />
        ) : null}
        {readOnly ? (
          <h2 className="truncate text-base font-semibold">{name}</h2>
        ) : (
          <BasicInput
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setDirty(true);
            }}
            placeholder={`When ${tableName} changes`}
            aria-label="Workflow name"
            className="text-base font-medium"
          />
        )}
        {says ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
          >
            {says}
          <ErrorAlchemyMenu /></p>
        ) : null}
        <BuilderEditor
          spec={spec}
          onChange={(next) => {
            setSpec(next);
            setDirty(true);
          }}
          tableName={tableName}
          readOnly={readOnly}
          seat={{ dataSource, userId, tables }}
          issues={issues}
        />
      </div>
    );

  const body = (
    <div className="mx-auto w-full max-w-3xl px-3 pb-24 pt-3 sm:px-4">
      {main}
    </div>
  );

  return (
    <div className="h-full overflow-hidden">
      {header}
      {organizationId ? (
        <TableNameProbe
          organizationId={organizationId}
          tableId={tableId}
          onName={setTableRead}
        />
      ) : null}
      {view && organizationId ? (
        <TestWithRecord
          open={testOpen}
          onOpenChange={setTestOpen}
          tableId={tableId}
          dataSource={dataSource}
          userId={userId}
          tables={tables}
          onRun={onTest}
        />
      ) : null}
      <div className="h-full pt-[var(--shell-header-h)]">
        {/* Desktop: the list beside the builder. Phone: the builder alone; the list opens from
            the header's sheet ("Workflows on this table") as a bottom sheet. */}
        {isMobile ? (
          <div className="h-full overflow-y-auto">{body}</div>
        ) : (
          <div className="flex h-full min-h-0">
            <aside className="w-72 shrink-0 overflow-y-auto border-r border-border p-3">
              {list}
            </aside>
            <main className="min-w-0 flex-1 overflow-y-auto">{body}</main>
          </div>
        )}
        <Dialog open={listOpen} onOpenChange={setListOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Workflows on this table</DialogTitle>
            </DialogHeader>
            {list}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}

function ReadOnlyLine({ says, action }: { says: string; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm">
      <span className="min-w-0 flex-1">{says}</span>
      {action}
    </div>
  );
}

function WorkflowList({
  rows,
  error,
  unavailable,
  tableId,
  selectedId,
  selectedTrigger,
  newOpen,
  onNew,
}: {
  rows: TableWorkflowRow[] | null;
  error: string | null;
  unavailable: string[];
  tableId: string;
  selectedId: string | null;
  /** The open workflow's trigger, in words — the second line of its row. */
  selectedTrigger: string;
  newOpen: boolean;
  onNew: () => void;
}) {
  return (
    <nav aria-label="Workflows on this table" className="flex flex-col gap-1">
      <Button
        icon={<Plus />}
        type="button"
        variant="outline"
        className="mb-2 justify-start"
        onClick={onNew}
      >
        New workflow
      </Button>
      {error ? <p className="text-sm text-destructive">{error}<ErrorAlchemyMenu error={error} /></p> : null}
      {!rows && !error ? (
        <p className="px-2 text-sm text-muted-foreground">Loading&hellip;</p>
      ) : null}
      {newOpen ? (
        <div className="rounded-md bg-accent px-2 py-1.5 text-sm font-medium">
          New workflow
        </div>
      ) : null}
      {rows?.length === 0 && !newOpen ? (
        <p className="px-2 text-sm text-muted-foreground">No workflows yet</p>
      ) : null}
      {rows?.map((row, i) => {
        const target = editorHref(row, tableId);
        const Icon = KIND_ICON[row.kind] ?? Workflow;
        const id = (row.open as { workflow_id?: string }).workflow_id;
        const active = row.kind === "workflow" && !!id && id === selectedId;
        const preset =
          (row.open as { editor?: string }).editor !== "workflow_builder";
        const content = (
          <>
            <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate" title={row.name}>
                {row.name}
              </span>
              <span className="truncate text-xs font-normal text-muted-foreground">
                {active
                  ? selectedTrigger
                  : row.last_run_at
                    ? `Ran ${new Date(row.last_run_at).toLocaleDateString()}`
                    : "Not run yet"}
              </span>
            </span>
            <StatusBadge
              label={row.is_on ? "On" : "Off"}
              tone={row.is_on ? "success" : "neutral"}
              size="sm"
            />
          </>
        );
        const className = cn(
          "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent",
          active && "bg-accent font-medium",
        );
        if (!target) {
          return (
            <div
              key={i}
              className={className}
              title={preset ? "Read-only" : undefined}
            >
              {content}
            </div>
          );
        }
        return target.external ? (
          <a
            key={i}
            href={target.href}
            target="_blank"
            rel="noopener noreferrer"
            className={className}
          >
            {content}
          </a>
        ) : (
          <Link key={i} href={target.href} className={className}>
            {content}
          </Link>
        );
      })}
      {unavailable.length > 0 ? (
        <p data-error-box
          className="px-2 pt-2 text-xs text-muted-foreground"
          title={unavailable.join(", ")}
        >
          {unavailable.length === 1
            ? "1 feature couldn't be read"
            : `${unavailable.length} features couldn't be read`}
        <ErrorAlchemyMenu /></p>
      ) : null}
    </nav>
  );
}

function TestWithRecord({
  open,
  onOpenChange,
  tableId,
  dataSource,
  userId,
  tables,
  onRun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tableId: string;
  dataSource: ReturnType<typeof recordsDataSource>;
  userId: string | null;
  tables: ReturnType<typeof useTablesAnywhere>;
  onRun: (recordId: string) => void;
}) {
  const [recordId, setRecordId] = useState<string | null>(null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Test with a record</DialogTitle>
        </DialogHeader>
        <TableScope
          dataSource={dataSource}
          userId={userId}
          tableId={tableId}
          tables={tables}
        >
          <RecordPicker
            tableId={tableId}
            value={recordId}
            onChange={setRecordId}
          />
        </TableScope>
        <DialogFooter>
          <Button
            variant="primary"
            type="button"
            disabled={!recordId}
            onClick={() => {
              if (!recordId) return;
              onOpenChange(false);
              onRun(recordId);
            }}
          >
            Run test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Reports the table's own name, read through the store as the person (`useTable`). */
function TableNameProbe({
  organizationId,
  tableId,
  onName,
}: {
  organizationId: string;
  tableId: string;
  onName: (name: string) => void;
}) {
  const recordsConfig = useAppRecordsConfig(organizationId);
  return (
    <RecordsProvider config={recordsConfig}>
      <NameOf tableId={tableId} onName={onName} />
    </RecordsProvider>
  );
}

function NameOf({
  tableId,
  onName,
}: {
  tableId: string;
  onName: (name: string) => void;
}) {
  const table = useTable(tableId);
  const name = table.data?.name;
  useEffect(() => {
    if (name) onName(name);
  }, [name, onName]);
  return null;
}
