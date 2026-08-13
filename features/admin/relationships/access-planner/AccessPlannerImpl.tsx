"use client";

// eslint-disable-next-line no-restricted-syntax -- this module is only reached through AccessPlanner's dynamic(ssr:false) gate.
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  AlertCircle,
  ArrowDownToLine,
  Boxes,
  Check,
  ChevronRight,
  CircleDot,
  Database,
  ExternalLink,
  Eye,
  GitBranch,
  Layers3,
  Loader2,
  Network,
  RefreshCw,
  Search,
  Share2,
  Shield,
  Wrench,
} from "lucide-react";
import {
  booleanUrlCodec,
  stringUrlCodec,
  useUrlState,
} from "@/lib/url-state/useUrlState";

import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import type { Json } from "@/types/database.types";
import type { AccessPlannerProps } from "./AccessPlanner";
import {
  DISPOSITION_COPY,
  issueText,
  plannerPageAgentPayload,
  plannerPageHuman,
  plannerPanelAgentPayload,
  plannerPanelHuman,
  plannerSnapshotAgentPayload,
  plannerSnapshotData,
  plannerTableAgentPayload,
  plannerTableDetailData,
  type PlannerPanelView,
} from "./copy";
import {
  parseAccessPlannerSnapshot,
  plannerTableId,
  type AccessPlannerSnapshot,
  type PlannerTable,
} from "./types";

type AccessMode = "root" | "nested" | "component" | "infrastructure";

type PlannerNodeData = {
  label: string;
  subtitle: string;
  disposition: PlannerTable["disposition"] | "external";
  issues: number;
  shareable: boolean;
  selected: boolean;
  external: boolean;
};

type PlannerFlowNode = Node<PlannerNodeData, "plannerTable">;

const MODE_TITLES: Record<AccessMode, string> = {
  root: "Own access",
  nested: "Inherit + share directly",
  component: "Part of parent",
  infrastructure: "Infrastructure",
};

function titleCase(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function dispositionClass(disposition: PlannerNodeData["disposition"]) {
  if (disposition === "unplanned")
    return "border-destructive/50 bg-destructive/10";
  if (disposition === "component") return "border-primary/40 bg-primary/10";
  if (disposition === "nested_entity") return "border-ring/50 bg-accent";
  if (
    disposition === "infrastructure" ||
    disposition === "derived" ||
    disposition === "external"
  ) {
    return "border-border bg-muted/70";
  }
  return "border-border bg-card";
}

function PlannerTableNode({ data }: NodeProps<PlannerFlowNode>) {
  return (
    <div
      className={cn(
        "w-56 rounded-lg border-2 px-3 py-2.5 shadow-sm transition-shadow",
        dispositionClass(data.disposition),
        data.selected &&
          "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !border-background !bg-muted-foreground"
      />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {data.label}
          </div>
          <div className="truncate font-mono text-[10px] text-muted-foreground">
            {data.subtitle}
          </div>
        </div>
        {data.issues > 0 ? (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
            {data.issues}
          </span>
        ) : (
          <Check className="h-4 w-4 shrink-0 text-primary" />
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <span>
          {data.disposition === "external"
            ? "Related schema"
            : DISPOSITION_COPY[data.disposition].label}
        </span>
        {data.shareable && (
          <>
            <span aria-hidden>•</span>
            <Share2 className="h-3 w-3" />
            <span>Shareable</span>
          </>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-background !bg-muted-foreground"
      />
    </div>
  );
}

const nodeTypes = { plannerTable: PlannerTableNode };

function initialSelectedTable(snapshot: AccessPlannerSnapshot) {
  return (
    snapshot.tables.find((table) => table.issue_codes.length > 0)?.table_name ??
    snapshot.tables.find((table) => table.relation_kind === "table")
      ?.table_name ??
    snapshot.tables[0]?.table_name ??
    ""
  );
}

function modeFor(table: PlannerTable): AccessMode {
  if (table.disposition === "infrastructure") return "infrastructure";
  if (table.disposition === "component") return "component";
  if (table.disposition === "nested_entity") return "nested";
  return "root";
}

function layoutGraph(
  nodes: PlannerFlowNode[],
  edges: Edge[],
): PlannerFlowNode[] {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  graph.setGraph({
    rankdir: "LR",
    ranksep: 120,
    nodesep: 34,
    marginx: 30,
    marginy: 30,
  });
  nodes.forEach((node) => graph.setNode(node.id, { width: 224, height: 86 }));
  edges.forEach((edge) => graph.setEdge(edge.source, edge.target));
  dagre.layout(graph);
  return nodes.map((node) => {
    const point = graph.node(node.id) as { x: number; y: number } | undefined;
    return {
      ...node,
      position: point ? { x: point.x - 112, y: point.y - 43 } : { x: 0, y: 0 },
    };
  });
}

function traceReach(snapshot: AccessPlannerSnapshot, token: string | null) {
  if (!token) return { viewer: 0, editor: 0, tokens: [] as string[] };
  const caps = new Map<string, "viewer" | "editor">([[token, "editor"]]);
  const queue = [token];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;
    const currentCap = caps.get(current) ?? "viewer";
    snapshot.access_relationships
      .filter((relationship) => relationship.parent_type === current)
      .forEach((relationship) => {
        if (!caps.has(relationship.child_type)) {
          caps.set(relationship.child_type, currentCap);
          queue.push(relationship.child_type);
        }
      });
    snapshot.association_rules.forEach((rule) => {
      const container =
        rule.container_side === "source"
          ? rule.source_type
          : rule.container_side === "target"
            ? rule.target_type
            : null;
      const child =
        rule.container_side === "source"
          ? rule.target_type
          : rule.container_side === "target"
            ? rule.source_type
            : null;
      if (container !== current || !child || rule.conveys_max === "none")
        return;
      const nextCap =
        currentCap === "viewer" || rule.conveys_max === "viewer"
          ? "viewer"
          : "editor";
      const existing = caps.get(child);
      if (!existing || (existing === "viewer" && nextCap === "editor")) {
        caps.set(child, nextCap);
        queue.push(child);
      }
    });
  }
  caps.delete(token);
  return {
    viewer: [...caps.values()].filter((cap) => cap === "viewer").length,
    editor: [...caps.values()].filter((cap) => cap === "editor").length,
    tokens: [...caps.keys()],
  };
}

export function AccessPlannerImpl({ initialSnapshot }: AccessPlannerProps) {
  const [supabase] = useState(() => createClient());
  const [snapshot, setSnapshot] = useState(() =>
    parseAccessPlannerSnapshot(initialSnapshot),
  );
  const [selectedTableName, setSelectedTableName] = useUrlState(
    "table",
    stringUrlCodec(initialSelectedTable(snapshot)),
  );
  const [search, setSearch] = useUrlState("q", stringUrlCodec());
  const [onlyProblems, setOnlyProblems] = useUrlState(
    "problems",
    booleanUrlCodec(false),
  );
  const [showPlumbing, setShowPlumbing] = useUrlState(
    "plumbing",
    booleanUrlCodec(false),
  );
  const [showPhysicalFks, setShowPhysicalFks] = useUrlState(
    "fks",
    booleanUrlCodec(false),
  );
  const [showAssociations, setShowAssociations] = useUrlState(
    "associations",
    booleanUrlCodec(false),
  );
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedTable =
    snapshot.tables.find((table) => table.table_name === selectedTableName) ??
    snapshot.tables[0];
  const [mode, setMode] = useState<AccessMode>(() =>
    selectedTable ? modeFor(selectedTable) : "root",
  );
  const [token, setToken] = useState(
    () =>
      selectedTable?.token ?? `web_${selectedTable?.table_name ?? "resource"}`,
  );
  const [label, setLabel] = useState(
    () =>
      selectedTable?.label ??
      titleCase(selectedTable?.table_name ?? "Resource"),
  );
  const [parentChoice, setParentChoice] = useState(() => {
    const relationship = snapshot.access_relationships.find(
      (candidate) => candidate.child_type === selectedTable?.token,
    );
    return relationship
      ? `${relationship.parent_type}|${relationship.fk_column}`
      : "";
  });
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!selectedTable) return;
    setMode(modeFor(selectedTable));
    setToken(
      selectedTable.token ??
        `${selectedTable.schema_name}_${selectedTable.table_name}`,
    );
    setLabel(selectedTable.label ?? titleCase(selectedTable.table_name));
    const existingParent = snapshot.access_relationships.find(
      (relationship) => relationship.child_type === selectedTable.token,
    );
    setParentChoice(
      existingParent
        ? `${existingParent.parent_type}|${existingParent.fk_column}`
        : "",
    );
    setReason(
      selectedTable.exclusion_reason === null
        ? ""
        : selectedTable.exclusion_reason,
    );
  }, [selectedTable, snapshot.access_relationships]);

  const selectedId = selectedTable
    ? plannerTableId(snapshot.schema, selectedTable.table_name)
    : "";
  const baseTables = snapshot.tables.filter(
    (table) =>
      table.relation_kind === "table" ||
      table.relation_kind === "partitioned_table",
  );
  const plannedCount = baseTables.filter(
    (table) => table.disposition !== "unplanned",
  ).length;
  const problemCount = snapshot.tables.filter(
    (table) => table.issue_codes.length > 0,
  ).length;
  const query = search.trim().toLowerCase();
  const visibleTables = snapshot.tables.filter((table) => {
    if (onlyProblems && table.issue_codes.length === 0) return false;
    if (!query) return true;
    return [
      `${table.schema_name}.${table.table_name}`,
      table.token,
      table.label,
    ]
      .filter((value): value is string => value !== null)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
  const visibleIds = new Set(
    visibleTables.map((table) =>
      plannerTableId(table.schema_name, table.table_name),
    ),
  );
  const parentOptions = selectedTable
    ? snapshot.foreign_keys.filter(
        (foreignKey) =>
          foreignKey.source_schema === selectedTable.schema_name &&
          foreignKey.source_table === selectedTable.table_name &&
          Boolean(foreignKey.target_token) &&
          !foreignKey.is_plumbing,
      )
    : [];

  const rawNodes: PlannerFlowNode[] = visibleTables.map((table) => ({
    id: plannerTableId(table.schema_name, table.table_name),
    type: "plannerTable",
    position: { x: 0, y: 0 },
    data: {
      label: table.label ?? titleCase(table.table_name),
      subtitle: `${table.schema_name}.${table.table_name}`,
      disposition: table.disposition,
      issues: table.issue_codes.length,
      shareable: table.is_shareable,
      selected:
        selectedId === plannerTableId(table.schema_name, table.table_name),
      external: false,
    },
  }));

  const externalNodes = new Map<string, PlannerFlowNode>();
  snapshot.foreign_keys.forEach((foreignKey) => {
    if (foreignKey.is_plumbing && !showPlumbing) return;
    if (foreignKey.access_effect === "none" && !showPhysicalFks) return;
    const internalId =
      foreignKey.source_schema === snapshot.schema
        ? plannerTableId(foreignKey.source_schema, foreignKey.source_table)
        : foreignKey.target_schema === snapshot.schema
          ? plannerTableId(foreignKey.target_schema, foreignKey.target_table)
          : null;
    if (!internalId || !visibleIds.has(internalId)) return;
    const candidates = [
      {
        schema: foreignKey.source_schema,
        table: foreignKey.source_table,
        token: foreignKey.source_token,
        label: foreignKey.source_label,
      },
      {
        schema: foreignKey.target_schema,
        table: foreignKey.target_table,
        token: foreignKey.target_token,
        label: foreignKey.target_label,
      },
    ];
    candidates.forEach((candidate) => {
      if (candidate.schema === snapshot.schema || !candidate.token) return;
      const id = plannerTableId(candidate.schema, candidate.table);
      if (!externalNodes.has(id)) {
        externalNodes.set(id, {
          id,
          type: "plannerTable",
          position: { x: 0, y: 0 },
          data: {
            label: candidate.label ?? titleCase(candidate.table),
            subtitle: `${candidate.schema}.${candidate.table}`,
            disposition: "external",
            issues: 0,
            shareable: false,
            selected: false,
            external: true,
          },
        });
      }
    });
  });
  if (showAssociations)
    snapshot.association_rules.forEach((rule) => {
      const candidates = [
        {
          schema: rule.source_schema,
          table: rule.source_table,
          token: rule.source_type,
          label: rule.source_label,
          internalId: plannerTableId(rule.target_schema, rule.target_table),
        },
        {
          schema: rule.target_schema,
          table: rule.target_table,
          token: rule.target_type,
          label: rule.target_label,
          internalId: plannerTableId(rule.source_schema, rule.source_table),
        },
      ];
      candidates.forEach((candidate) => {
        if (
          candidate.schema === snapshot.schema ||
          !visibleIds.has(candidate.internalId)
        )
          return;
        const id = plannerTableId(candidate.schema, candidate.table);
        if (!externalNodes.has(id)) {
          externalNodes.set(id, {
            id,
            type: "plannerTable",
            position: { x: 0, y: 0 },
            data: {
              label: candidate.label,
              subtitle: `${candidate.schema}.${candidate.table}`,
              disposition: "external",
              issues: 0,
              shareable: false,
              selected: false,
              external: true,
            },
          });
        }
      });
    });
  externalNodes.forEach((node, id) => visibleIds.add(id));

  const edges: Edge[] = [];
  snapshot.foreign_keys.forEach((foreignKey) => {
    if (foreignKey.is_plumbing && !showPlumbing) return;
    const sourceId = plannerTableId(
      foreignKey.source_schema,
      foreignKey.source_table,
    );
    const targetId = plannerTableId(
      foreignKey.target_schema,
      foreignKey.target_table,
    );
    if (!visibleIds.has(sourceId) || !visibleIds.has(targetId)) return;
    const inherits = foreignKey.access_effect !== "none";
    if (!inherits && !showPhysicalFks) return;
    edges.push({
      id: `fk:${foreignKey.conname}:${sourceId}`,
      source: inherits ? targetId : sourceId,
      target: inherits ? sourceId : targetId,
      label: inherits ? foreignKey.access_effect : undefined,
      type: "smoothstep",
      markerEnd: {
        type: MarkerType.ArrowClosed,
        color: inherits
          ? "hsl(var(--primary))"
          : "hsl(var(--muted-foreground))",
      },
      style: {
        stroke: inherits
          ? "hsl(var(--primary))"
          : "hsl(var(--muted-foreground))",
        strokeWidth: inherits ? 2.4 : 1,
        opacity: inherits ? 0.9 : 0.28,
        strokeDasharray:
          foreignKey.access_effect === "containment" ? "7 5" : undefined,
      },
      labelStyle: { fill: "hsl(var(--foreground))", fontSize: 10 },
      labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
    });
  });
  if (showAssociations) {
    snapshot.association_rules.forEach((rule, index) => {
      if (rule.container_side === "none" || rule.conveys_max === "none") return;
      const sourceId = plannerTableId(rule.source_schema, rule.source_table);
      const targetId = plannerTableId(rule.target_schema, rule.target_table);
      if (!visibleIds.has(sourceId) || !visibleIds.has(targetId)) return;
      const containerId =
        rule.container_side === "source" ? sourceId : targetId;
      const childId = rule.container_side === "source" ? targetId : sourceId;
      edges.push({
        id: `association:${rule.source_type}:${rule.target_type}:${index}`,
        source: containerId,
        target: childId,
        type: "smoothstep",
        label: rule.conveys_max,
        animated: false,
        markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--ring))" },
        style: {
          stroke: "hsl(var(--ring))",
          strokeWidth: 1.5,
          strokeDasharray: "3 5",
          opacity: 0.65,
        },
        labelStyle: { fill: "hsl(var(--foreground))", fontSize: 10 },
        labelBgStyle: { fill: "hsl(var(--background))", fillOpacity: 0.9 },
      });
    });
  }
  const graphNodes = layoutGraph(
    [...rawNodes, ...externalNodes.values()],
    edges,
  );
  const reach = traceReach(snapshot, selectedTable?.token ?? null);
  const hasVisibility =
    selectedTable?.column_names.includes("visibility") ?? false;
  const hasOwnershipColumns =
    selectedTable?.column_names.includes("organization_id") === true &&
    selectedTable.column_names.includes("created_by");
  const isDerived =
    selectedTable?.relation_kind === "view" ||
    selectedTable?.relation_kind === "materialized_view";
  const selectedParent = parentOptions.find(
    (option) =>
      `${option.target_token}|${option.source_columns[0]}` === parentChoice,
  );

  function chooseTable(table: PlannerTable) {
    setSelectedTableName(table.table_name);
    setMode(modeFor(table));
    setToken(table.token ?? `${table.schema_name}_${table.table_name}`);
    setLabel(table.label ?? titleCase(table.table_name));
    const existingParent = snapshot.access_relationships.find(
      (relationship) => relationship.child_type === table.token,
    );
    setParentChoice(
      existingParent
        ? `${existingParent.parent_type}|${existingParent.fk_column}`
        : "",
    );
    setReason(table.exclusion_reason === null ? "" : table.exclusion_reason);
    setMessage(null);
  }

  async function refresh(schemaName = snapshot.schema) {
    setSaving(true);
    setMessage(null);
    const { data, error } = await supabase.rpc(
      "admin_access_planner_snapshot",
      { p_schema: schemaName },
    );
    setSaving(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    const next = parseAccessPlannerSnapshot(data);
    setSnapshot(next);
    const nextName =
      schemaName === snapshot.schema &&
      next.tables.some((table) => table.table_name === selectedTableName)
        ? selectedTableName
        : initialSelectedTable(next);
    const nextTable =
      next.tables.find((table) => table.table_name === nextName) ??
      next.tables[0];
    if (nextTable) chooseTable(nextTable);
  }

  async function applyDecision() {
    if (!selectedTable) return;
    setSaving(true);
    setMessage(null);
    if (mode === "infrastructure") {
      const { error } = await supabase.rpc(
        "admin_set_access_planner_exclusion",
        {
          p_schema: selectedTable.schema_name,
          p_table: selectedTable.table_name,
          p_excluded: true,
          p_reason: reason,
        },
      );
      if (error) {
        setSaving(false);
        setMessage(error.message);
        return;
      }
    } else {
      const { error } = await supabase.rpc("admin_configure_entity_access", {
        p_schema: selectedTable.schema_name,
        p_table: selectedTable.table_name,
        p_token: token,
        p_label: label,
        p_mode: mode,
        p_parent_type: selectedParent?.target_token ?? undefined,
        p_fk_column: selectedParent?.source_columns[0] ?? undefined,
        p_notes: `Configured in the schema access planner for ${snapshot.schema}.`,
      });
      if (error) {
        setSaving(false);
        setMessage(error.message);
        return;
      }
    }
    await refresh();
    setMessage("Access decision applied and the schema map was refreshed.");
    setConfirmOpen(false);
  }

  const decisionBlocked =
    !selectedTable ||
    selectedTable.relation_kind === "view" ||
    selectedTable.relation_kind === "materialized_view" ||
    !token.trim() ||
    !label.trim() ||
    (mode === "infrastructure" && !reason.trim()) ||
    (mode === "infrastructure" && Boolean(selectedTable.token)) ||
    ((mode === "root" || mode === "nested") && !hasOwnershipColumns) ||
    ((mode === "nested" || mode === "component") && !selectedParent) ||
    (mode === "nested" && !hasVisibility);

  /** The detail panel AS RENDERED, from live state — called inside the copy
   *  click handler so unsaved form edits are captured, not the saved row. */
  function buildPanelView(table: PlannerTable): PlannerPanelView {
    const unsavedChanges: string[] = [];
    const savedMode = modeFor(table);
    if (mode !== savedMode)
      unsavedChanges.push(
        `mode changed (saved: ${MODE_TITLES[savedMode]}, now: ${MODE_TITLES[mode]})`,
      );
    if (table.token !== null && token !== table.token)
      unsavedChanges.push(
        `entity token edited (saved: ${table.token}, now: ${token})`,
      );
    const savedLabel = table.label ?? titleCase(table.table_name);
    if (label !== savedLabel)
      unsavedChanges.push(`label edited (saved: ${savedLabel}, now: ${label})`);
    const savedRelationship = snapshot.access_relationships.find(
      (relationship) => relationship.child_type === table.token,
    );
    const savedChoice = savedRelationship
      ? `${savedRelationship.parent_type}|${savedRelationship.fk_column}`
      : "";
    if (parentChoice !== savedChoice)
      unsavedChanges.push("parent relationship changed");
    if (
      mode === "infrastructure" &&
      reason !== (table.exclusion_reason ?? "")
    )
      unsavedChanges.push("reason edited");

    const warnings: string[] = [];
    if (!isDerived) {
      if (mode === "infrastructure" && table.token)
        warnings.push(
          "This is an active entity. Deactivate it in the Entity registry before classifying it as infrastructure.",
        );
      if (
        (mode === "nested" || mode === "component") &&
        parentOptions.length === 0
      )
        warnings.push(
          "No non-plumbing foreign key points to a registered parent.",
        );
      if (mode === "nested" && !hasVisibility)
        warnings.push(
          "This table needs a visibility column before it can inherit and remain directly shareable.",
        );
      if ((mode === "root" || mode === "nested") && !hasOwnershipColumns)
        warnings.push(
          "A table that owns access needs organization_id and created_by columns first.",
        );
    }

    const applyBlockedReasons: string[] = [];
    if (isDerived)
      applyBlockedReasons.push("derived view — nothing to decide");
    if (!token.trim()) applyBlockedReasons.push("entity token is empty");
    if (!label.trim()) applyBlockedReasons.push("label is empty");
    if (mode === "infrastructure" && !reason.trim())
      applyBlockedReasons.push("infrastructure classification needs a reason");
    if (mode === "infrastructure" && Boolean(table.token))
      applyBlockedReasons.push(
        "active entity must be deactivated in the Entity registry first",
      );
    if ((mode === "root" || mode === "nested") && !hasOwnershipColumns)
      applyBlockedReasons.push(
        "missing organization_id + created_by ownership columns",
      );
    if ((mode === "nested" || mode === "component") && !selectedParent)
      applyBlockedReasons.push("no parent relationship chosen");
    if (mode === "nested" && !hasVisibility)
      applyBlockedReasons.push("missing visibility column");

    return {
      schema: snapshot.schema,
      table,
      reach,
      isDerived,
      form: {
        mode,
        modeTitle: MODE_TITLES[mode],
        token,
        label,
        parentRelationship: selectedParent
          ? `${selectedParent.target_label ?? selectedParent.target_token} via ${selectedParent.source_columns[0]}`
          : null,
        reason,
        unsavedChanges,
      },
      warnings,
      applyBlocked: decisionBlocked,
      applyBlockedReasons,
      doors: {
        entityRegistryToken: table.token,
        sharingRegistered: table.is_shareable,
        connectedRuleCount: snapshot.association_rules.filter(
          (rule) =>
            rule.source_type === table.token ||
            rule.target_type === table.token,
        ).length,
      },
      physical: {
        columnCount: table.columns.length,
        estimatedRows: table.estimated_rows,
        rlsEnabled: table.rls_enabled,
        policyCount: table.policy_count,
        parentFkCandidates: parentOptions.length,
        isManyToMany: table.is_many_to_many,
        columnNames: table.column_names,
      },
      schemaContext: {
        decided: plannedCount,
        baseTables: baseTables.length,
        problemTables: snapshot.tables
          .filter((candidate) => candidate.issue_codes.length > 0)
          .map((candidate) => ({
            table: `${candidate.schema_name}.${candidate.table_name}`,
            issues: candidate.issue_codes.map(issueText),
          })),
      },
    };
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b border-border bg-card px-3 py-3 lg:px-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">Schema access planner</h1>
              <Badge
                variant={
                  plannedCount === baseTables.length ? "success" : "warning"
                }
              >
                {plannedCount}/{baseTables.length} tables decided
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Decide once where every table gets access; verify everything a
              share reaches.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CopyButtons
              size="sm"
              label={`Schema ${snapshot.schema} access map`}
              human={() => plannerPageHuman(snapshot)}
              json={() => plannerSnapshotData(snapshot)}
              agent={() => plannerPageAgentPayload(snapshot)}
              agentVariant={{
                id: "page-view",
                label: "This page (what I see)",
                hint: "Dispositions + every open blocker, as rendered",
                position: "first",
              }}
              aiVariants={[
                {
                  id: "full-snapshot",
                  label: "Everything (full snapshot)",
                  hint: "All tables with RLS state + canonical findings",
                  build: () => plannerSnapshotAgentPayload(snapshot),
                },
              ]}
            />
            <Select
              value={snapshot.schema}
              onValueChange={(value) => void refresh(value)}
            >
              <SelectTrigger className="w-44" aria-label="Schema">
                <Database className="mr-2 h-4 w-4" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {snapshot.schemas.map((schema) => (
                  <SelectItem
                    key={schema.schema_name}
                    value={schema.schema_name}
                  >
                    {schema.schema_name} · {schema.planned_count}/
                    {schema.table_count}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={saving}
            >
              <RefreshCw
                className={cn("mr-2 h-4 w-4", saving && "animate-spin")}
              />
              Refresh
            </Button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
          <Metric
            icon={AlertCircle}
            label="Blockers"
            value={problemCount}
            danger={problemCount > 0}
          />
          <Metric
            icon={CircleDot}
            label="Own access"
            value={
              baseTables.filter((table) => table.disposition === "entity")
                .length
            }
          />
          <Metric
            icon={GitBranch}
            label="Nested"
            value={
              baseTables.filter(
                (table) => table.disposition === "nested_entity",
              ).length
            }
          />
          <Metric
            icon={Boxes}
            label="Parent-owned"
            value={
              baseTables.filter((table) => table.disposition === "component")
                .length
            }
          />
          <Metric
            icon={Share2}
            label="Shareable"
            value={baseTables.filter((table) => table.is_shareable).length}
          />
          <Metric
            icon={Layers3}
            label="Cross-schema"
            value={
              new Set(
                snapshot.foreign_keys
                  .filter(
                    (key) =>
                      key.source_schema !== key.target_schema &&
                      !key.is_plumbing,
                  )
                  .map((key) =>
                    key.source_schema === snapshot.schema
                      ? key.target_schema
                      : key.source_schema,
                  ),
              ).size
            }
          />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[280px_minmax(360px,1fr)_380px]">
        <aside className="min-h-0 border-b border-border bg-card lg:border-b-0 lg:border-r">
          <div className="space-y-3 border-b border-border p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Find a table or entity…"
                className="pl-8"
              />
            </div>
            <div className="flex items-center justify-between gap-2">
              <Label
                htmlFor="problems-only"
                className="text-xs font-normal text-muted-foreground"
              >
                Problems first
              </Label>
              <Switch
                id="problems-only"
                checked={onlyProblems}
                onCheckedChange={setOnlyProblems}
              />
            </div>
          </div>
          <ScrollArea className="h-[320px] w-full lg:h-[calc(100%-105px)]">
            <div className="min-w-0">
              {visibleTables
                .toSorted(
                  (a, b) =>
                    Number(b.issue_codes.length > 0) -
                      Number(a.issue_codes.length > 0) ||
                    a.table_name.localeCompare(b.table_name),
                )
                .map((table) => (
                  <button
                    key={table.table_name}
                    type="button"
                    onClick={() => chooseTable(table)}
                    className={cn(
                      "grid min-h-11 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border/40 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-accent/70 focus-visible:relative focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                      selectedTableName === table.table_name &&
                        "bg-accent text-accent-foreground",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block whitespace-normal break-words text-sm font-medium leading-tight [overflow-wrap:anywhere]">
                        {table.label ?? titleCase(table.table_name)}
                      </span>
                      <span className="mt-0.5 block whitespace-normal break-all font-mono text-[10px] leading-tight text-muted-foreground">
                        {table.table_name}
                      </span>
                    </span>
                    {table.issue_codes.length > 0 && (
                      <Badge variant="destructive" className="shrink-0">
                        {table.issue_codes.length}
                      </Badge>
                    )}
                  </button>
                ))}
            </div>
          </ScrollArea>
        </aside>

        <main className="relative hidden min-h-0 border-r border-border bg-muted/20 lg:block">
          <div className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 rounded-lg border border-border bg-card/95 p-2 shadow-sm backdrop-blur">
            <Toggle
              label="Plumbing"
              checked={showPlumbing}
              onChange={setShowPlumbing}
            />
            <Toggle
              label="Physical FKs"
              checked={showPhysicalFks}
              onChange={setShowPhysicalFks}
            />
            <Toggle
              label="Logical associations"
              checked={showAssociations}
              onChange={setShowAssociations}
            />
            <span className="border-l border-border pl-2 text-[10px] leading-6 text-muted-foreground">
              Solid = parent-owned · dashed = inherited · dotted = logical
            </span>
          </div>
          <ReactFlowProvider>
            <ReactFlow
              nodes={graphNodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
              minZoom={0.18}
              maxZoom={1.6}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable
              onNodeClick={(_event, node) => {
                if (node.data.external) return;
                const table = snapshot.tables.find(
                  (candidate) =>
                    plannerTableId(
                      candidate.schema_name,
                      candidate.table_name,
                    ) === node.id,
                );
                if (table) chooseTable(table);
              }}
              proOptions={{ hideAttribution: true }}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={18}
                size={1}
                color="hsl(var(--border))"
              />
              <MiniMap
                pannable
                zoomable
                className="!border !border-border !bg-card"
                nodeColor="hsl(var(--muted))"
              />
              <Controls
                showInteractive={false}
                className="!border-border !bg-card !shadow-sm"
              />
            </ReactFlow>
          </ReactFlowProvider>
        </main>

        <aside className="min-h-0 bg-card">
          <ScrollArea className="h-[520px] lg:h-full">
            {selectedTable ? (
              <div className="space-y-5 p-4">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">
                        {selectedTable.label ??
                          titleCase(selectedTable.table_name)}
                      </h2>
                      <p className="font-mono text-xs text-muted-foreground">
                        {selectedTable.schema_name}.{selectedTable.table_name}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <CopyButtons
                        size="icon"
                        label={`${selectedTable.schema_name}.${selectedTable.table_name}`}
                        human={() =>
                          plannerPanelHuman(buildPanelView(selectedTable))
                        }
                        json={() =>
                          plannerTableDetailData(snapshot, selectedTable)
                        }
                        agent={() =>
                          plannerPanelAgentPayload(buildPanelView(selectedTable))
                        }
                        agentVariant={{
                          id: "panel-view",
                          label: "This panel (what I see)",
                          hint: "Blockers, reach, LIVE form values, warnings",
                          position: "first",
                        }}
                        aiVariants={[
                          {
                            id: "full-detail",
                            label: "Everything (full table detail)",
                            hint: "All columns, FKs, access relationships, association rules",
                            build: () =>
                              plannerTableAgentPayload(snapshot, selectedTable),
                          },
                        ]}
                      />
                      <Badge
                        variant={
                          selectedTable.issue_codes.length > 0
                            ? "destructive"
                            : "outline"
                        }
                      >
                        {DISPOSITION_COPY[selectedTable.disposition].label}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-muted-foreground">
                    {DISPOSITION_COPY[selectedTable.disposition].description}
                  </p>
                </div>

                {selectedTable.issue_codes.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>
                      {selectedTable.issue_codes.length} decision blocker
                      {selectedTable.issue_codes.length === 1 ? "" : "s"}
                    </AlertTitle>
                    <AlertDescription>
                      <ul className="mt-1 space-y-1">
                        {selectedTable.issue_codes.map((issue) => (
                          <li key={issue}>
                            • {issueText(issue)}
                          </li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {selectedTable.token && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium">
                      <ArrowDownToLine className="h-4 w-4 text-primary" />
                      Sharing this reaches {reach.tokens.length} related entity
                      type{reach.tokens.length === 1 ? "" : "s"}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {reach.editor} inherit editor access · {reach.viewer} are
                      capped at viewer
                    </p>
                  </div>
                )}

                {isDerived ? (
                  <Alert>
                    <Eye className="h-4 w-4" />
                    <AlertTitle>Derived view — nothing to decide</AlertTitle>
                    <AlertDescription>
                      Access to a view follows the RLS of the tables in its
                      underlying query. Views are never registered as entities
                      and never carry ownership columns.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <section className="space-y-3">
                      <div>
                        <h3 className="text-sm font-semibold">
                          Access decision
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Every base table must have exactly one primary role.
                        </p>
                      </div>
                      <div className="grid gap-2">
                        <ModeCard
                          mode="root"
                          active={mode === "root"}
                          onSelect={setMode}
                          icon={Shield}
                          title="Own access"
                          description="Direct grants; can pass access downward."
                        />
                        <ModeCard
                          mode="nested"
                          active={mode === "nested"}
                          onSelect={setMode}
                          icon={GitBranch}
                          title="Inherit + share directly"
                          description="Standalone entity that also inherits from a parent."
                        />
                        <ModeCard
                          mode="component"
                          active={mode === "component"}
                          onSelect={setMode}
                          icon={Boxes}
                          title="Part of parent"
                          description="No separate grants; always follows one parent."
                        />
                        <ModeCard
                          mode="infrastructure"
                          active={mode === "infrastructure"}
                          onSelect={setMode}
                          icon={Wrench}
                          title="Infrastructure"
                          description="Plumbing, not a user-facing entity."
                        />
                      </div>
                    </section>

                    {mode === "infrastructure" ? (
                      <div className="space-y-2">
                        <Label htmlFor="reason">
                          Why is this not an entity?
                        </Label>
                        <Textarea
                          id="reason"
                          value={reason}
                          onChange={(event) => setReason(event.target.value)}
                          placeholder="Example: sweep cursor state; no user-owned identity."
                        />
                        {selectedTable.token && (
                          <p className="text-xs text-destructive">
                            This is an active entity. Deactivate it in the
                            Entity registry before classifying it as
                            infrastructure.
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1.5">
                            <Label htmlFor="token">Entity token</Label>
                            <Input
                              id="token"
                              value={token}
                              onChange={(event) => setToken(event.target.value)}
                              disabled={Boolean(selectedTable.token)}
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label htmlFor="label">Label</Label>
                            <Input
                              id="label"
                              value={label}
                              onChange={(event) => setLabel(event.target.value)}
                            />
                          </div>
                        </div>
                        {(mode === "nested" || mode === "component") && (
                          <div className="space-y-1.5">
                            <Label>Parent relationship</Label>
                            <Select
                              value={parentChoice}
                              onValueChange={setParentChoice}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Choose a real foreign key…" />
                              </SelectTrigger>
                              <SelectContent>
                                {parentOptions.map((option) => (
                                  <SelectItem
                                    key={`${option.conname}:${option.source_columns[0]}`}
                                    value={`${option.target_token}|${option.source_columns[0]}`}
                                  >
                                    {option.target_label ?? option.target_token}{" "}
                                    via {option.source_columns.join(", ")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {parentOptions.length === 0 && (
                              <p className="text-xs text-destructive">
                                No non-plumbing foreign key points to a
                                registered parent.
                              </p>
                            )}
                            {mode === "nested" && !hasVisibility && (
                              <p className="text-xs text-destructive">
                                This table needs a visibility column before it
                                can inherit and remain directly shareable.
                              </p>
                            )}
                          </div>
                        )}
                        {(mode === "root" || mode === "nested") &&
                          !hasOwnershipColumns && (
                            <p className="text-xs text-destructive">
                              A table that owns access needs organization_id and
                              created_by columns first.
                            </p>
                          )}
                      </div>
                    )}

                    {message && (
                      <Alert
                        variant={
                          message.startsWith("Access decision")
                            ? "default"
                            : "destructive"
                        }
                      >
                        <AlertDescription>{message}</AlertDescription>
                      </Alert>
                    )}
                    <Button
                      className="w-full"
                      onClick={() => setConfirmOpen(true)}
                      disabled={decisionBlocked || saving}
                    >
                      {saving ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Apply access decision
                    </Button>
                  </>
                )}

                <section className="space-y-2 border-t border-border pt-4">
                  <h3 className="text-sm font-semibold">
                    Open the connected controls
                  </h3>
                  <Door
                    href="/administration/database/relationships/entity-types"
                    label="Entity registry"
                    detail={selectedTable.token ?? "Register after deciding"}
                  />
                  {selectedTable.token && (
                    <Door
                      href={`/administration/database/relationships/sharing?register=${encodeURIComponent(selectedTable.token)}`}
                      label="Sharing registry"
                      detail={
                        selectedTable.is_shareable
                          ? "Registered"
                          : "Not directly shareable"
                      }
                    />
                  )}
                  <Door
                    href="/administration/database/relationships/rules"
                    label="Logical association rules"
                    detail={`${snapshot.association_rules.filter((rule) => rule.source_type === selectedTable.token || rule.target_type === selectedTable.token).length} connected rules`}
                  />
                </section>

                <details className="rounded-lg border border-border p-3 text-xs">
                  <summary className="cursor-pointer font-medium">
                    Physical evidence
                  </summary>
                  <div className="mt-3 space-y-2 text-muted-foreground">
                    <p>
                      {selectedTable.columns.length} columns ·{" "}
                      {selectedTable.estimated_rows.toLocaleString()} estimated
                      rows
                    </p>
                    <p>
                      RLS {selectedTable.rls_enabled ? "enabled" : "disabled"} ·{" "}
                      {selectedTable.policy_count} policies
                    </p>
                    <p>
                      {parentOptions.length} candidate parent foreign keys ·{" "}
                      {selectedTable.is_many_to_many
                        ? "many-to-many junction candidate"
                        : "not a junction candidate"}
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {selectedTable.columns.map((column) => (
                        <Badge key={column.name} variant="outline">
                          {column.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </details>
              </div>
            ) : (
              <div className="p-6 text-sm text-muted-foreground">
                This schema has no relations.
              </div>
            )}
          </ScrollArea>
        </aside>
      </div>
      {selectedTable && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={`Apply ${mode.replace("_", " ")} access to ${selectedTable.table_name}?`}
          description="This records the table's canonical access role and rebuilds its RLS policies from that decision."
          confirmLabel="Apply decision"
          busy={saving}
          onConfirm={applyDecision}
        />
      )}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  danger = false,
}: {
  icon: typeof Eye;
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-md border border-border bg-background px-2.5 py-2",
        danger && "border-destructive/40 bg-destructive/5",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 text-muted-foreground",
          danger && "text-destructive",
        )}
      />
      <div>
        <div className="text-sm font-semibold leading-none">{value}</div>
        <div className="mt-1 text-[10px] text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch checked={checked} onCheckedChange={onChange} />
      {label}
    </label>
  );
}

function ModeCard({
  mode,
  active,
  onSelect,
  icon: Icon,
  title,
  description,
}: {
  mode: AccessMode;
  active: boolean;
  onSelect: (mode: AccessMode) => void;
  icon: typeof Shield;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(mode)}
      className={cn(
        "flex min-h-14 items-center gap-3 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent",
        active
          ? "border-primary bg-primary/5 ring-1 ring-primary/20"
          : "border-border",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground",
          active && "bg-primary text-primary-foreground",
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{title}</span>
        <span className="block text-[11px] leading-4 text-muted-foreground">
          {description}
        </span>
      </span>
    </button>
  );
}

function Door({
  href,
  label,
  detail,
}: {
  href: string;
  label: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 py-2 transition-colors hover:bg-accent"
    >
      <ExternalLink className="h-4 w-4 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium">{label}</span>
        <span className="block truncate text-[10px] text-muted-foreground">
          {detail}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}
