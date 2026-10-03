"use client";

// features/workflow-runtime/simple-builder/WorkflowBuilderPage.tsx
//
// /workflows/builder/<tableId> — THE SIMPLE WORKFLOW BUILDER (lane 11 wave 2; champion: Airtable
// automations). Left: every Workflow on this table — builder Workflows and the six existing
// features as read-only presets that open their own editor. Right: the trigger, the condition and
// the stack of steps, or the Runs tab. On/off, "Test with a record", Runs and "Open in Workflow
// Studio" live in the page's header (`EntityModeHeader`), never in a new row. On a phone the list
// is a drawer (`MobilePanelShell`).
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
import {
  RecordPicker,
  TableScope,
  useTablesAnywhere,
} from "@ai-matrx/records-ui/pickers";
import {
  BasicInput,
  Button,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { EntityModeHeader } from "@/features/shell/components/header/templates/EntityModeHeader";
import { MobilePanelShell } from "@/features/shell/components/header/templates/MobilePanelShell";
import { StatusBadge } from "@/components/official/status-badge/StatusBadge";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { createClient } from "@/utils/supabase/client";
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
import { emptySpec, specForSave, type BuilderSpec } from "./builderSpec";
import { BuilderEditor } from "./BuilderEditor";
import { BuilderRunsList } from "./BuilderRunsList";

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
        href: `/data-v2/${tableId}?rail=notifications`,
        external: false,
      };
    case "row_actions":
    case "pipeline":
    case "webhooks":
    case "enrich":
      return { href: `/data-v2/${tableId}?rail=settings`, external: false };
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
  const tables = useTablesAnywhere(dataSource);
  const table = tables.rows.find((t) => t.table_id === tableId) ?? null;
  const organizationId = table?.organization_id ?? null;

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
      backHref={`/data-v2/${tableId}`}
      entityLabel={view ? view.name : "New workflow"}
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
      right={
        view && !detached && organizationId ? (
          <TestWithRecord
            tableId={tableId}
            dataSource={dataSource}
            userId={userId}
            tables={tables}
            disabled={!isOn || busy !== null}
            disabledWhy={!isOn ? "Turn it on to test" : null}
            onRun={onTest}
          />
        ) : null
      }
      actions={[
        ...(readOnly
          ? []
          : [
              {
                label: busy === "save" ? "Saving…" : "Save",
                icon: Save,
                onPress: () => void onSave(),
                disabled: busy !== null || (!dirty && !!view),
                showLabel: true,
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
      newOpen={workflowParam === "new"}
      onNew={() => go({ workflow: "new", tab: "build" })}
    />
  );

  // ── The right side ──
  let main: ReactNode;
  if (tables.error)
    main = <p className="text-sm text-destructive">{tables.error}</p>;
  else if (!table)
    main = (
      <p className="text-sm text-muted-foreground">
        {tables.loading
          ? "Opening the table…"
          : "This table isn't one you can open."}
      </p>
    );
  else if (loadError)
    main = <p className="text-sm text-destructive">{loadError}</p>;
  else if (tab === "runs")
    main = view ? (
      <div className="flex flex-col gap-3">
        {/* The header's "Test with a record" is desktop-only; a phone gets it here. */}
        {!detached && organizationId ? (
          <div className="sm:hidden">
            <TestWithRecord
              tableId={tableId}
              dataSource={dataSource}
              userId={userId}
              tables={tables}
              disabled={!isOn || busy !== null}
              disabledWhy={!isOn ? "Turn it on to test" : null}
              onRun={onTest}
            />
          </div>
        ) : null}
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
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {says}
          </p>
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
      <div className="h-full pt-[var(--shell-header-h)]">
        <MobilePanelShell
          desktop={
            <div className="flex h-full min-h-0">
              <aside className="w-72 shrink-0 overflow-y-auto border-r border-border p-3">
                {list}
              </aside>
              <main className="min-w-0 flex-1 overflow-y-auto">{body}</main>
            </div>
          }
          main={<div className="h-full overflow-y-auto">{body}</div>}
          panels={[
            {
              id: "workflows",
              label: "Workflows",
              icon: Workflow,
              content: <div className="p-3">{list}</div>,
            },
          ]}
          menuIcon={Workflow}
          menuLabel="Workflows"
        />
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
  newOpen,
  onNew,
}: {
  rows: TableWorkflowRow[] | null;
  error: string | null;
  unavailable: string[];
  tableId: string;
  selectedId: string | null;
  newOpen: boolean;
  onNew: () => void;
}) {
  return (
    <nav aria-label="Workflows on this table" className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mb-2 justify-start gap-2"
        onClick={onNew}
      >
        <Plus className="h-4 w-4" />
        New workflow
      </Button>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
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
            <span className="min-w-0 flex-1 truncate">{row.name}</span>
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
        <p
          className="px-2 pt-2 text-xs text-muted-foreground"
          title={unavailable.join(", ")}
        >
          {unavailable.length === 1
            ? "1 feature couldn't be read"
            : `${unavailable.length} features couldn't be read`}
        </p>
      ) : null}
    </nav>
  );
}

function TestWithRecord({
  tableId,
  dataSource,
  userId,
  tables,
  disabled,
  disabledWhy,
  onRun,
}: {
  tableId: string;
  dataSource: ReturnType<typeof recordsDataSource>;
  userId: string | null;
  tables: ReturnType<typeof useTablesAnywhere>;
  disabled: boolean;
  disabledWhy: string | null;
  onRun: (recordId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [recordId, setRecordId] = useState<string | null>(null);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5"
          disabled={disabled}
          title={disabledWhy ?? undefined}
        >
          <FlaskConical className="h-4 w-4" />
          <span>Test with a record</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        sizing="content"
        align="end"
        className="flex w-80 flex-col gap-2 p-3"
      >
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
        <Button
          type="button"
          size="sm"
          disabled={!recordId}
          onClick={() => {
            if (!recordId) return;
            setOpen(false);
            onRun(recordId);
          }}
        >
          Run test
        </Button>
      </PopoverContent>
    </Popover>
  );
}
