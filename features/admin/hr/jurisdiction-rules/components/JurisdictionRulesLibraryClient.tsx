// features/admin/hr/jurisdiction-rules/components/JurisdictionRulesLibraryClient.tsx
//
// /administration/hr/jurisdiction-rules (SPEC-UI-IA §3.12 route 85) — the rule
// library. Every platform employment-law rule, grouped by class, with the
// facts a superadmin needs before opening one: status, effective range,
// version, citation authority, pending-verification flag, JUR-SEED task and
// fixture counts.
//
// ?rule=<id> deep-links from the compliance exception queues: the row is
// scrolled into view and highlighted rather than the page silently landing on
// an unfiltered list.

"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Scale, Search } from "lucide-react";

import { Input } from "@ai-matrx/design-system";
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

const ALL = "__all__";

export function JurisdictionRulesLibraryClient() {
  const { load, loading } = useJurisdictionRulesAdminData();
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusRuleId = searchParams.get("rule");

  const [classFilter, setClassFilter] = useState(ALL);
  const [jurisdictionFilter, setJurisdictionFilter] = useState(ALL);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [query, setQuery] = useState("");

  const rowRefs = useRef(new Map<string, HTMLTableRowElement>());

  useEffect(() => {
    if (!focusRuleId || load?.state !== "ok") return;
    const row = rowRefs.current.get(focusRuleId);
    row?.scrollIntoView({ block: "center" });
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

  const needle = query.trim().toLowerCase();
  const visible = rules.filter((rule) => {
    if (classFilter !== ALL && rule.rule_class !== classFilter) return false;
    if (
      jurisdictionFilter !== ALL &&
      rule.jurisdiction_key !== jurisdictionFilter
    )
      return false;
    if (statusFilter !== ALL && rule.status !== statusFilter) return false;
    if (!needle) return true;
    return [
      rule.rule_class_label,
      rule.jurisdiction_name ?? "",
      rule.jurisdiction_key,
      rule.basis ?? "",
      rule.citation?.authority ?? "",
      rule.jur_seed_task ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  const groups = new Map<string, JurisdictionRule[]>();
  for (const rule of visible) {
    const bucket = groups.get(rule.rule_class_label);
    if (bucket) bucket.push(rule);
    else groups.set(rule.rule_class_label, [rule]);
  }
  const orderedGroups = [...groups.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  );

  const openRule = (id: string) =>
    router.push(`/administration/hr/jurisdiction-rules/${id}`);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search class, jurisdiction, basis, authority…"
            className="h-8 pl-7 text-sm"
          />
        </div>
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
        <Select
          value={jurisdictionFilter}
          onValueChange={setJurisdictionFilter}
        >
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
          {visible.length} of {rules.length}
        </span>
      </div>

      <div className="flex-1 overflow-auto">
        {orderedGroups.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground">
            No rules match these filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-1.5 font-medium">Jurisdiction</th>
                <th className="px-3 py-1.5 font-medium">Status</th>
                <th className="px-3 py-1.5 font-medium">Effective</th>
                <th className="px-3 py-1.5 font-medium">Ver.</th>
                <th className="px-3 py-1.5 font-medium">Citation</th>
                <th className="px-3 py-1.5 font-medium">Seed task</th>
                <th className="px-3 py-1.5 font-medium">Fixtures</th>
              </tr>
            </thead>
            {orderedGroups.map(([label, groupRules]) => (
              <tbody key={label}>
                <tr className="bg-muted/60">
                  <td
                    colSpan={7}
                    className="px-3 py-1 text-xs font-semibold text-foreground"
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5 text-muted-foreground" />
                      {label}
                      {groupRules[0]?.produces_money ? (
                        <span className="font-normal text-muted-foreground">
                          · produces money
                        </span>
                      ) : null}
                      <span className="font-normal text-muted-foreground">
                        · {groupRules.length}
                      </span>
                    </span>
                  </td>
                </tr>
                {groupRules.map((rule) => (
                  <tr
                    key={rule.id}
                    ref={(node) => {
                      if (node) rowRefs.current.set(rule.id, node);
                      else rowRefs.current.delete(rule.id);
                    }}
                    onClick={() => openRule(rule.id)}
                    className={cn(
                      "cursor-pointer border-b border-border/60 align-top hover:bg-accent/40",
                      focusRuleId === rule.id &&
                        "bg-primary/10 ring-1 ring-inset ring-primary/40",
                    )}
                  >
                    <td className="px-3 py-1.5">
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
                    </td>
                    <td className="px-3 py-1.5">
                      <RuleStatusBadge status={rule.status} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-xs text-muted-foreground">
                      {formatDateRange(rule.effective_from, rule.effective_to)}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-xs text-muted-foreground">
                      {rule.version ?? "—"}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      <CitationLine citation={rule.citation} />
                    </td>
                    <td
                      className="px-3 py-1.5"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <SeedTaskChip task={rule.jur_seed_task} />
                    </td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">
                      <FixtureSummary fixtures={rule.fixtures} />
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        )}
      </div>
    </div>
  );
}
