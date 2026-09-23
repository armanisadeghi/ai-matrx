// features/admin/hr/jurisdiction-rules/components/JurisdictionRulesLibraryClient.tsx
//
// /administration/hr/jurisdiction-rules (SPEC-UI-IA §3.12 route 85) — the rule
// library. The canonical table retains class grouping, rule navigation and the
// JUR-SEED deep-link contract from the former hand-built table.

"use client";

import {
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scale } from "lucide-react";

import { MatrxDataTable } from "@ai-matrx/design-system/data-table";
import type { MatrxColumnDef } from "@ai-matrx/design-system/data-table/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import { useJurisdictionRulesAdminData } from "../useJurisdictionRulesAdminData";
import type { JurisdictionRule } from "../types";
import {
  CitationLine,
  FixtureSummary,
  PendingVerificationFlag,
  RuleLoadGate,
  RuleStatusBadge,
  SeedTaskChip,
  formatDateRange,
} from "./rule-chrome";
import { pushAppHref } from "@/lib/deployment/navigate";

const ALL = "__all__";

const libraryColumns: MatrxColumnDef<JurisdictionRule>[] = [
  {
    id: "rule_class_label",
    accessorKey: "rule_class_label",
    header: "Class",
    hidden: true,
  },
  {
    id: "jurisdiction",
    header: "Jurisdiction",
    accessorFn: (rule) =>
      `${rule.jurisdiction_name ?? rule.jurisdiction_key} ${rule.jurisdiction_key}`,
    cell: (rule) => (
      <div>
        <div className="font-medium text-foreground">
          {rule.jurisdiction_name ?? rule.jurisdiction_key}
          <span className="ml-1 font-mono text-xs text-muted-foreground">
            {rule.jurisdiction_key}
          </span>
        </div>
        <PendingVerificationFlag
          unverifiedKeys={rule.unverified_keys}
          producesMoney={rule.produces_money}
          className="mt-0.5"
        />
      </div>
    ),
    width: 248,
  },
  {
    id: "status",
    accessorKey: "status",
    header: "Status",
    filter: "select",
    cell: (rule) => <RuleStatusBadge status={rule.status} />,
    width: 112,
  },
  {
    id: "effective",
    header: "Effective",
    accessorFn: (rule) =>
      `${rule.effective_from ?? ""} ${rule.effective_to ?? ""}`,
    cell: (rule) => (
      <span className="whitespace-nowrap text-xs text-muted-foreground">
        {formatDateRange(rule.effective_from, rule.effective_to)}
      </span>
    ),
    width: 172,
  },
  {
    id: "version",
    accessorKey: "version",
    header: "Ver.",
    filter: "number",
    align: "right",
    cell: (rule) => (
      <span className="tabular-nums text-xs text-muted-foreground">
        {rule.version ?? "—"}
      </span>
    ),
    width: 72,
  },
  {
    id: "citation",
    header: "Citation",
    accessorFn: (rule) =>
      [rule.citation?.authority, rule.citation?.url].filter(Boolean).join(" "),
    cell: (rule) => <CitationLine citation={rule.citation} />,
    width: 260,
  },
  {
    id: "jur_seed_task",
    accessorKey: "jur_seed_task",
    header: "Seed task",
    cell: (rule) => <SeedTaskChip task={rule.jur_seed_task} />,
    width: 180,
  },
  {
    id: "fixtures",
    header: "Fixtures",
    accessorFn: (rule) => rule.fixtures.length,
    filter: "number",
    cell: (rule) => <FixtureSummary fixtures={rule.fixtures} />,
    width: 136,
  },
];

export function JurisdictionRulesLibraryClient() {
  const { load, loading, reload } = useJurisdictionRulesAdminData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusRuleId = searchParams.get("rule");

  const [classFilter, setClassFilter] = useState(ALL);
  const [jurisdictionFilter, setJurisdictionFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    if (!focusRuleId || load?.state !== "ok") return;
    rowRefs.current.get(focusRuleId)?.scrollIntoView({ block: "center" });
  }, [focusRuleId, load]);

  const gate = (
    <RuleLoadGate
      load={load}
      loading={loading}
      loadingLabel="Loading the rule library…"
    />
  );
  if (!load || load.state !== "ok") return gate;

  const { rules } = load.data;
  const classOptions = [
    ...new Map(
      rules.map((rule) => [rule.rule_class, rule.rule_class_label]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const jurisdictionOptions = [
    ...new Map(
      rules.map((rule) => [
        rule.jurisdiction_key,
        rule.jurisdiction_name ?? rule.jurisdiction_key,
      ]),
    ).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const statusOptions = [...new Set(rules.map((rule) => rule.status))].sort();
  const filteredRules = rules.filter((rule) => {
    if (classFilter !== ALL && rule.rule_class !== classFilter) return false;
    if (
      jurisdictionFilter !== ALL &&
      rule.jurisdiction_key !== jurisdictionFilter
    ) {
      return false;
    }
    return statusFilter === ALL || rule.status === statusFilter;
  });

  function wrapRuleRow(rule: JurisdictionRule, children: ReactNode) {
    if (
      !isValidElement<{
        className?: string;
        id?: string;
        ref?: Ref<HTMLTableRowElement>;
      }>(children)
    ) {
      return children;
    }
    return cloneElement(children, {
      id: rule.id,
      className: cn(
        children.props.className,
        focusRuleId === rule.id &&
          "bg-primary/10 ring-1 ring-inset ring-primary/40",
      ),
      ref: (node: HTMLTableRowElement | null) => {
        if (node) rowRefs.current.set(rule.id, node);
        else rowRefs.current.delete(rule.id);
      },
    });
  }

  const selectFilters = (
    <>
      <Select value={classFilter} onValueChange={setClassFilter}>
        <SelectTrigger className="h-8 w-[190px] text-sm">
          <SelectValue placeholder="All classes" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All classes</SelectItem>
          {classOptions.map(([slug, label]) => (
            <SelectItem key={slug} value={slug}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={jurisdictionFilter} onValueChange={setJurisdictionFilter}>
        <SelectTrigger className="h-8 w-[190px] text-sm">
          <SelectValue placeholder="All jurisdictions" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All jurisdictions</SelectItem>
          {jurisdictionOptions.map(([key, name]) => (
            <SelectItem key={key} value={key}>
              {name} ({key})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={statusFilter} onValueChange={setStatusFilter}>
        <SelectTrigger className="h-8 w-[150px] text-sm">
          <SelectValue placeholder="All statuses" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All statuses</SelectItem>
          {statusOptions.map((status) => (
            <SelectItem key={status} value={status}>
              {status}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        {filteredRules.length} of {rules.length}
      </span>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <MatrxDataTable
        urlState={{ id: "jurisdiction-rules-library", selectedRow: false }}
        data={filteredRules}
        columns={libraryColumns}
        getRowId={(rule) => rule.id}
        density="condensed"
        viewTabs={false}
        pageSize={0}
        zebra={false}
        isFetching={loading}
        detail={{ enabled: false }}
        rowWrapper={wrapRuleRow}
        getRowHref={(rule) =>
          `/administration/hr/jurisdiction-rules/${rule.id}`
        }
        onRowOpen={(rule) =>
          pushAppHref(
            router,
            `/administration/hr/jurisdiction-rules/${rule.id}`,
          )
        }
        grouping={{
          columnId: "rule_class_label",
          groupableColumnIds: [],
          rowNoun: "rule",
          renderLabel: (group) => (
            <span className="inline-flex items-center gap-1.5">
              <Scale className="h-3.5 w-3.5 text-muted-foreground" />
              {group.label}
              {group.rows[0]?.produces_money ? (
                <span className="font-normal text-muted-foreground">
                  · produces money
                </span>
              ) : null}
              <span className="font-normal text-muted-foreground">
                · {group.rows.length}
              </span>
            </span>
          ),
        }}
        emptyState={{
          title: "No rules match these filters.",
        }}
        toolbar={{
          title: "Jurisdiction rules",
          titleCount: { value: filteredRules.length, label: "rules" },
          search: true,
          searchPlaceholder: "Search class, jurisdiction, basis, authority…",
          leading: (
            <div className="flex flex-wrap items-center gap-2">
              {selectFilters}
            </div>
          ),
          refresh: { onRefresh: reload, label: "Refresh rule library" },
        }}
      />
    </div>
  );
}
