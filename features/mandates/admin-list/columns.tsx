"use client";

// features/mandates/admin-list/columns.tsx
//
// The admin mandate list's column registry. Default order (owner's ruling):
// Mandate → Feature → Key → every column the old console shows except Goal →
// Customized by, then the origin/type columns. Everything else is declared
// `defaultHidden` and one click away in the column picker — nothing is
// removed. Filter/sort values come from ./fields.ts, the one reader.

import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/lib/toast";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import {
  DATE_FILTER_OPTIONS,
  DATE_SORT_WORDS,
  Muted,
  TextCell,
  timeCell,
  type EntityColumnSpec,
} from "@/lib/entity-list/columns";
import { COVERAGE_META } from "@/features/mandates/coverage";
import {
  HEALTH_CLASS,
  HEALTH_HINT,
  agentHref,
} from "@/features/mandates/admin/mandate-health";
import {
  ImpactBlockerCell,
  ImpactGradeCell,
} from "@/features/mandates/admin/impact-cells";
import {
  MandateInputsCell,
  MandateOutputCell,
} from "@/features/mandates/admin/mandate-contract-cells";
import { updateMandateDefinition } from "@/features/mandates/admin/service";
import {
  CreateSystemTwinButton,
  LineageChip,
  RebindToTwinButton,
} from "@/features/mandates/admin/mandate-actions";
import { ShieldCheck } from "lucide-react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentLineageIndex } from "@/features/agents/redux/agent-definition/selectors";
import { invalidateMandateAdminList } from "./store";
import {
  useMandateAdminListActions,
  useMandateAdminListState,
} from "./context";
import { CODE_STATE_LABEL, FIELDS } from "./fields";
import type { MandateAdminRow } from "./types";

type Spec = EntityColumnSpec<MandateAdminRow>;

const NUMBER_WORDS = { asc: "fewest first", desc: "most first" };

function facetColumn(
  id: string,
  label: string,
  width: number,
  cell: (row: MandateAdminRow) => React.ReactNode,
  extra: Partial<Spec> = {},
): Spec {
  return {
    id,
    label,
    facet: id,
    formatFacetValue: FIELDS[id]?.label,
    ...extra,
    column: {
      id,
      header: label,
      filter: "select",
      width,
      cell,
      ...(extra.column ?? {}),
    },
  };
}

/** A cell whose server report has not landed yet — honest, never blank or guessed. */
function Checking({ what }: { what: string }) {
  return (
    <span
      className="text-xs text-muted-foreground animate-pulse"
      title={`Still reading ${what} from the server — this fills in on its own.`}
    >
      Checking…
    </span>
  );
}

function HolderCell({ row }: { row: MandateAdminRow }) {
  if (row.holderType !== "agent") {
    return <span className="text-xs">Workflow</span>;
  }
  if (!row.agentId) return <Muted>None</Muted>;
  return (
    <EntityRef
      token="agent"
      id={row.agentId}
      name={row.agentName}
      href={agentHref(row.agentId, row.agentType)}
      showIcon={false}
    />
  );
}

function BlockerCell({ row }: { row: MandateAdminRow }) {
  const actions = useMandateAdminListActions();
  return (
    <ImpactBlockerCell
      verdict={row.defaultVerdict}
      busy={actions?.advancing ?? true}
      onAdvanceAnyway={(verdict) => actions?.advanceAnyway(verdict)}
    />
  );
}

/**
 * THE CONSOLE'S HEALTH CELL, carried over: a detected problem ships with its
 * fix in place — never a red badge that tells the admin to go find the answer.
 * The fix buttons are the console's own (../admin/mandate-actions.tsx), by
 * import; a save reloads the list and the server reports it reads.
 */
function HealthCell({ row }: { row: MandateAdminRow }) {
  const lineageIndex = useAppSelector(selectAgentLineageIndex);
  const twin = row.agentId ? (lineageIndex[row.agentId]?.systemTwin ?? null) : null;
  const reload = () => invalidateMandateAdminList(true);
  // The code declarations decide the worst health a row can have, so until
  // they land no health is a verdict yet — say so rather than show "ok".
  if (row.factsPending.codeTruth) return <Checking what="the code declarations" />;
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      onClick={(event) => event.stopPropagation()}
    >
      <Badge
        variant="outline"
        className={HEALTH_CLASS[row.health]}
        title={HEALTH_HINT[row.health]}
      >
        {row.health === "not a system agent" ? "NOT a system agent" : row.health}
      </Badge>
      {row.health === "code ↔ agent drift" && row.codeTruth && (
        <span className="basis-full text-[10px] leading-tight text-rose-600">
          code: {row.codeTruth.code_variables.join(", ") || "none"}
          {" · "}agent:{" "}
          {row.codeTruth.bound_agent?.declared_variables.join(", ") || "none"}
        </span>
      )}
      {row.health === "not a system agent" && twin && (
        <>
          <LineageChip label="system twin" agent={twin} Icon={ShieldCheck} />
          <RebindToTwinButton
            mandate={row.mandate}
            twin={twin}
            currentAgentId={row.agentId}
            codeTruth={row.codeTruth}
            onSaved={reload}
          />
        </>
      )}
      {row.health === "not a system agent" && !twin && row.agentId && (
        <CreateSystemTwinButton
          mandate={row.mandate}
          agentId={row.agentId}
          agentName={row.agentName}
          codeTruth={row.codeTruth}
          onSaved={reload}
        />
      )}
    </div>
  );
}

function InputsCell({ row }: { row: MandateAdminRow }) {
  const { offersByProvision } = useMandateAdminListState();
  return (
    <MandateInputsCell
      compact
      row={row}
      offeredValues={
        row.provisionKey ? offersByProvision.get(row.provisionKey) : undefined
      }
    />
  );
}

function EnabledCell({ row }: { row: MandateAdminRow }) {
  return (
    <div onClick={(e) => e.stopPropagation()} className="inline-flex">
      <Switch
        aria-label={`Enable ${row.name}`}
        checked={row.isEnabled}
        onCheckedChange={(enabled) => {
          // The write fires the mandate cache bus; the page reloads on it.
          updateMandateDefinition(row.id, { is_enabled: enabled })
            .then(() =>
              toast.success(`${row.name} ${enabled ? "enabled" : "disabled"}.`),
            )
            .catch((error: unknown) =>
              toast.error(
                `Update failed: ${error instanceof Error ? error.message : String(error)}`,
              ),
            );
        }}
      />
    </div>
  );
}

function ListCell({ values, detail }: { values: string[]; detail?: string[] }) {
  if (values.length === 0) return <Muted>—</Muted>;
  const text = values.join(", ");
  return (
    <span
      className="block truncate text-xs"
      title={detail && detail.length > 0 ? detail.join("\n") : text}
    >
      {text}
    </span>
  );
}

export const ADMIN_MANDATE_COLUMNS: Spec[] = [
  {
    id: "name",
    label: "Mandate",
    locked: true,
    phone: "title",
    column: {
      id: "name",
      accessorKey: "name",
      header: "Mandate",
      filter: "text",
      width: 220,
      cell: (row) => (
        <span className="block truncate font-medium" title={row.name}>
          {row.name}
        </span>
      ),
    },
  },
  facetColumn("featureLabel", "Feature", 150, (row) => (
    <TextCell value={row.featureLabel} />
  )),
  {
    id: "mandateKey",
    label: "Key",
    column: {
      id: "mandateKey",
      accessorKey: "mandateKey",
      header: "Key",
      filter: "text",
      width: 230,
      cell: (row) => (
        <span
          className="block truncate font-mono text-[11px] text-muted-foreground"
          title={row.mandateKey}
        >
          {row.mandateKey}
        </span>
      ),
    },
  },
  facetColumn("agentName", "Mandate Holder", 210, (row) => (
    <HolderCell row={row} />
  )),
  facetColumn("pinText", "Pin", 80, (row) => (
    <Badge variant={row.pinText === "Latest" ? "secondary" : "outline"}>
      {row.pinText}
    </Badge>
  )),
  facetColumn("coverage", "Coverage", 110, (row) => {
    if (!row.coverage) {
      return row.factsPending.coverage ? (
        <Checking what="coverage" />
      ) : (
        <Muted>—</Muted>
      );
    }
    const meta = COVERAGE_META[row.coverage];
    return (
      <Badge
        variant="outline"
        className={meta.toneClassName}
        title={row.coverageDetail ?? meta.description}
      >
        {row.coverage === "orange" ? "Fallback" : meta.label}
      </Badge>
    );
  }),
  facetColumn(
    "impactGrade",
    "Grade",
    120,
    (row) => (
      <ImpactGradeCell
        mandateKey={row.mandateKey}
        defaultVerdict={row.defaultVerdict}
        bindingVerdicts={row.bindingVerdicts}
        ungraded={row.ungraded}
      />
    ),
  ),
  facetColumn("impactBlocker", "Blocker", 190, (row) => (
    <BlockerCell row={row} />
  )),
  facetColumn("health", "Health", 190, (row) => <HealthCell row={row} />),
  {
    id: "inputSummary",
    label: "Inputs",
    column: {
      id: "inputSummary",
      header: "Inputs",
      filter: "text",
      width: 280,
      cell: (row) => <InputsCell row={row} />,
    },
  },
  facetColumn("outputSummary", "Output", 200, (row) => (
    <MandateOutputCell compact row={row} />
  )),
  facetColumn(
    "overridesCount",
    "Bindings",
    80,
    (row) => (
      <span className="text-xs tabular-nums">{row.overridesCount}</span>
    ),
    { sortWords: NUMBER_WORDS },
  ),
  facetColumn("customizedBy", "Customized by", 170, (row) => (
    <ListCell values={row.customizedBy} />
  )),
  facetColumn(
    "origin",
    "Origin",
    80,
    (row) => (
      <Badge variant="outline" title={row.origin === "code" ? "Declared in code" : "Database only"}>
        {row.origin === "code" ? "Code" : "Soft"}
      </Badge>
    ),
  ),
  facetColumn("serves", "Serves", 150, (row) =>
    row.serves.length === 0 ? (
      <span title="Shortcut, surface and app links could not be read." className="text-xs text-muted-foreground">
        Unknown
      </span>
    ) : (
      <ListCell values={row.serves} detail={row.servesDetail} />
    ),
  ),
  facetColumn("defaultState", "Default", 110, (row) => (
    <span
      className="text-xs"
      title={row.fallbackKey ? `Fallback: ${row.fallbackKey}` : undefined}
    >
      {row.defaultState}
    </span>
  )),
  {
    id: "isEnabled",
    label: "Enabled",
    column: {
      id: "isEnabled",
      header: "Enabled",
      filter: "boolean",
      align: "center",
      width: 80,
      cell: (row) => <EnabledCell row={row} />,
    },
  },
  {
    id: "updatedAt",
    label: "Updated",
    sortWords: DATE_SORT_WORDS,
    column: {
      id: "updatedAt",
      header: "Updated",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 100,
      cell: (row) => timeCell(row.updatedAt),
    },
  },
  {
    id: "id",
    label: "ID",
    column: {
      id: "id",
      accessorKey: "id",
      header: "ID",
      filter: "text",
      cellKind: "uuid",
      width: 110,
    },
  },
  // ── Available, off by default ───────────────────────────────────────────
  facetColumn(
    "codeState",
    "Code",
    110,
    (row) => (
      <span className="text-xs">{CODE_STATE_LABEL[row.codeState]}</span>
    ),
    { defaultHidden: true },
  ),
  facetColumn(
    "declaredIn",
    "Declared in",
    150,
    (row) =>
      row.declaredIn ? (
        <span className="block truncate text-xs" title={row.declaredFile ?? undefined}>
          {row.declaredIn}
        </span>
      ) : (
        <Muted>None</Muted>
      ),
    { defaultHidden: true },
  ),
  facetColumn(
    "backsCount",
    "Backs",
    70,
    (row) => <span className="text-xs tabular-nums">{row.backsCount}</span>,
    { defaultHidden: true, sortWords: NUMBER_WORDS },
  ),
  facetColumn(
    "fallbackKey",
    "Fallback",
    200,
    (row) =>
      row.fallbackKey ? (
        <span className="block truncate font-mono text-[11px]">{row.fallbackKey}</span>
      ) : (
        <Muted>None</Muted>
      ),
    { defaultHidden: true },
  ),
  facetColumn(
    "homeLabel",
    "Owner",
    140,
    (row) => <TextCell value={row.homeLabel} />,
    { defaultHidden: true },
  ),
  {
    id: "goal",
    label: "Goal",
    defaultHidden: true,
    column: {
      id: "goal",
      header: "Goal",
      filter: "text",
      width: 280,
      cell: (row) => <TextCell value={row.goal} />,
    },
  },
  {
    id: "createdAt",
    label: "Created",
    defaultHidden: true,
    sortWords: DATE_SORT_WORDS,
    column: {
      id: "createdAt",
      header: "Created",
      filter: "select",
      filterOptions: DATE_FILTER_OPTIONS,
      width: 100,
      cell: (row) => timeCell(row.createdAt),
    },
  },
];
