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
  WorkflowDriftBadge,
  WorkflowImpactBlockerCell,
  WorkflowImpactGradeCell,
} from "@/features/mandates/admin/workflow-impact-cells";
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
import { holderOfMandate } from "@/lib/supabase/mandateStorage";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAgentLineageIndex } from "@/features/agents/redux/agent-definition/selectors";
import { invalidateMandateAdminList } from "./store";
import { MandateStatusControl } from "@/features/mandates/status/MandateStatusControl";
import {
  useMandateAdminListActions,
  useMandateAdminListState,
} from "./context";
import { CODE_STATE_LABEL, FIELDS, NONE_FOUND } from "./fields";
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
  if (row.holderType === "workflow") {
    // Workflow parity: a workflow holder is a record too — named, and it opens.
    const workflowId = holderOfMandate(row.mandate).holderId;
    if (!workflowId) return <Muted>None</Muted>;
    return (
      <EntityRef
        token="workflow"
        id={workflowId}
        name={row.agentName}
        showIcon={false}
      />
    );
  }
  if (row.holderType !== "agent") {
    return <TextCell value={row.holderType} />;
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
  if (!row.defaultVerdict && row.workflowVerdicts.length > 0) {
    return <WorkflowImpactBlockerCell verdicts={row.workflowVerdicts} />;
  }
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
      {/* Workflow parity: a workflow holder that no longer fits this job. */}
      <WorkflowDriftBadge verdicts={row.workflowVerdicts} />
      {/* 🚨 A Holder saved with an unmet contract (Arman, 2026-09-25: saved,
          never blocked — and never quiet). The server's own sentence. */}
      {row.contractMismatches.length > 0 ? (
        <Badge
          variant="outline"
          className={HEALTH_CLASS["output contract unmet"]}
          title={row.contractMismatches
            .map((m) => `${m.where}: ${m.check.summary}`)
            .join("\n\n")}
          data-testid="contract-mismatch-badge"
        >
          {row.contractMismatches.length === 1
            ? "contract mismatch"
            : `${row.contractMismatches.length} contract mismatches`}
        </Badge>
      ) : null}
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
        // The label says what the click DOES from the state it is in — an
        // "Enable X" label on a switch that is already on was a lie.
        aria-label={row.isEnabled ? `Turn off ${row.name}` : `Turn on ${row.name}`}
        title={row.isEnabled ? `On — click to turn off ${row.name}` : `Off — click to turn on ${row.name}`}
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

/** Contract column: red when any Holder was saved against its contract. */
const CONTRACT_CLASS: Record<MandateAdminRow["contractCheck"], string> = {
  Mismatch: "border-rose-500/50 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  Matches: "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
  "Not checked": "text-muted-foreground",
};

function ContractCell({ row }: { row: MandateAdminRow }) {
  return (
    <Badge
      variant="outline"
      className={CONTRACT_CLASS[row.contractCheck]}
      title={
        row.contractCheck === "Mismatch"
          ? row.contractMismatches.map((m) => `${m.where}: ${m.check.summary}`).join("\n\n") ||
            "A Mandate Holder was saved that does not match this job's contract."
          : row.contractCheck === "Matches"
            ? "Every recorded contract check on this job passed."
            : "No contract check has been recorded for this job's Mandate Holders yet."
      }
    >
      {row.contractCheck}
    </Badge>
  );
}

/** One code-scan cell: still reading, unreadable, none found, or the values. */
function SourceCell({
  row,
  pick,
}: {
  row: MandateAdminRow;
  pick: (sources: NonNullable<MandateAdminRow["sources"]>) => string | string[];
}) {
  if (row.sourcesPending) return <Checking what="the code scan" />;
  if (row.sourcesFailed) {
    return (
      <span className="text-xs text-amber-700 dark:text-amber-300" title="The code scan read failed — see the notice above the list.">
        Unavailable
      </span>
    );
  }
  if (!row.sources) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title="The code scan has no reference to this key. Until every repository has a complete scan this means nobody looked — not that it is unused."
      >
        {NONE_FOUND}
      </span>
    );
  }
  const value = pick(row.sources);
  if (Array.isArray(value)) {
    return value.length > 0 ? <ListCell values={value} /> : <Muted>{NONE_FOUND}</Muted>;
  }
  return <span className="text-xs tabular-nums">{value}</span>;
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
  // THE STATUS, beside the name — draft vs active can never be missed.
  // A platform admin may change it (the list is admin-only), so the badge is
  // also the control.
  facetColumn(
    "status",
    "Status",
    120,
    (row) => (
      <MandateStatusControl
        mandateId={row.id}
        name={row.name}
        status={row.status}
        canManage
        size="sm"
      />
    ),
    { sortWords: { asc: "drafts first", desc: "active first" } },
  ),
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
          {/* key-is-the-subject: the admin list's Key column — the one place an owner ruling lets a key show (Mandate name → Feature → Key) */}
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
    (row) =>
      !row.defaultVerdict && row.workflowVerdicts.length > 0 ? (
        <WorkflowImpactGradeCell
          mandateKey={row.mandateKey}
          verdicts={row.workflowVerdicts}
        />
      ) : (
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
  facetColumn("contractCheck", "Contract", 110, (row) => <ContractCell row={row} />),
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
      <span title="The places this job serves could not be read." className="text-xs text-muted-foreground">
        Unknown
      </span>
    ) : (
      <ListCell values={row.serves} detail={row.servesDetail} />
    ),
  ),
  // ── Where the code scan finds it (fetchMandateSourceFacts; filtered and
  // sorted by the database across the whole list) ─────────────────────────
  facetColumn("declaredRepos", "Declared in", 150, (row) => (
    <SourceCell row={row} pick={(s) => s.declaredIn} />
  )),
  facetColumn("calledFrom", "Called from", 170, (row) => (
    <SourceCell row={row} pick={(s) => s.calledFrom} />
  )),
  facetColumn(
    "callSites",
    "Call sites",
    80,
    (row) => <SourceCell row={row} pick={(s) => String(s.callSites)} />,
    { sortWords: NUMBER_WORDS },
  ),
  facetColumn("languages", "Language", 120, (row) => (
    <SourceCell row={row} pick={(s) => s.languages} />
  )),
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
    "Code declaration",
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
