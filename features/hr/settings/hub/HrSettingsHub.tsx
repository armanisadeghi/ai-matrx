// features/hr/settings/hub/HrSettingsHub.tsx
//
// ROUTE 67 — THE SETTINGS HUB. A searchable index of EVERY configuration key HR
// reads, with its effective value and its ORIGIN.
//
// 🚨 ORIGIN IS THE POINT, NOT THE VALUE. "The value is 30" tells an admin nothing
// about whether changing the platform default will reach them. `origin` answers it:
// platform default, or this employer's own override. Every row carries it.
//
// 🚨 A KEY WHOSE ORIGIN IS `missing` IS A HARD ERROR NAMING THE KEY. It means
// `platform.feature_knob` defines neither a value nor a default for something HR
// reads, and §10 says a missing knob RAISES rather than falling back. The banner
// names each one out loud, because a silent fallback is how a knob becomes a
// constant that nobody can find.
//
// The table is `MatrxDataTable` — every column sorts AND filters, and the row detail
// carries the ONE `<KnobRow>` the whole lane uses, so the hub is not a second
// override implementation.

"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { hrSettingsHref } from "../../routes";
import { useHrContext } from "../../shared/useHrContext";
import { KnobRow, knobValueText } from "../components/KnobPanel";
import { useHrKnobs } from "../hooks/useHrKnobs";
import { HR_SETTINGS_TABS } from "../settings-tabs";
import type { HrPresentedKnob } from "../types";
import { HrSettingsShell } from "../HrSettingsShell";

const ORIGIN_LABEL: Record<HrPresentedKnob["origin"], string> = {
  org_override: "This employer",
  platform_default: "Platform default",
  missing: "MISSING",
};

export function HrSettingsHub() {
  const { active, orgRef } = useHrContext();
  const organizationId = active?.organization_id ?? null;
  const [overriddenOnly, setOverriddenOnly] = useState(false);

  const { knobs, isLoading, error, refresh, missing } = useHrKnobs({
    organizationId,
    overriddenOnly,
  });

  const columns: MatrxColumnDef<HrPresentedKnob>[] = [
    {
      id: "key",
      accessorKey: "key",
      header: "Setting",
      cell: (row) => (
        <span className="min-w-0">
          <span className="block text-sm font-medium capitalize text-foreground">
            {row.key.replace(/_/g, " ")}
          </span>
          <span className="block font-mono text-[0.6875rem] text-muted-foreground">
            {row.full_key}
          </span>
        </span>
      ),
    },
    {
      id: "feature",
      accessorKey: "feature",
      header: "Area",
      filter: "select",
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {row.feature.replace(/^hr\./, "").replace(/_/g, " ")}
        </span>
      ),
    },
    {
      id: "effective",
      accessorFn: (row) => knobValueText(row.effective_value),
      header: "Effective value",
      cell: (row) => (
        <span className="text-sm text-foreground">
          {knobValueText(row.effective_value)}
        </span>
      ),
    },
    {
      id: "origin",
      accessorFn: (row) => ORIGIN_LABEL[row.origin],
      header: "Where it comes from",
      filter: "select",
      cell: (row) => (
        <Badge
          variant={
            row.origin === "missing"
              ? "destructive"
              : row.origin === "org_override"
                ? "default"
                : "secondary"
          }
        >
          {ORIGIN_LABEL[row.origin]}
        </Badge>
      ),
    },
    {
      id: "platform_default",
      accessorFn: (row) => knobValueText(row.platform_default),
      header: "Platform default",
      mobileHidden: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">
          {knobValueText(row.platform_default)}
        </span>
      ),
    },
    {
      id: "basis",
      accessorKey: "basis",
      header: "Why this default",
      mobileHidden: true,
      cell: (row) => (
        <span className="text-sm text-muted-foreground">{row.basis ?? "—"}</span>
      ),
    },
  ];

  return (
    <HrSettingsShell
      section={null}
      title="HR settings"
      description="Everything this employer can decide about how HR works."
      loading={isLoading}
      error={error}
      operation="This employer's HR settings"
      onRetry={refresh}
    >
      <div className="space-y-5 p-4 sm:p-6">
        {/* 🚨 The hard error, naming every missing key */}
        {missing.length > 0 ? (
          <div
            role="alert"
            className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-4"
          >
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
              <div className="min-w-0 space-y-1">
                <h2 className="text-sm font-semibold text-foreground">
                  {missing.length === 1
                    ? "One setting HR reads is not defined anywhere"
                    : `${missing.length} settings HR reads are not defined anywhere`}
                </h2>
                <p className="text-sm text-muted-foreground">
                  The platform registry defines neither a value nor a default for the
                  keys below, so HR has nothing to read and nothing safe to write. This
                  is a configuration defect, not a setting you can fill in — a silent
                  fallback here would turn a knob into a constant nobody can find. Send
                  these key names to whoever runs the platform.
                </p>
              </div>
            </div>
            <ul className="space-y-1 pl-8">
              {missing.map((knob) => (
                <li key={knob.full_key} className="font-mono text-xs text-foreground">
                  {knob.full_key}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {/* The section index — every panel is one tap away, from here too */}
        <section className="rounded-lg border border-border bg-card">
          <h2 className="border-b border-border p-3 text-sm font-semibold text-foreground">
            Panels
          </h2>
          <ul className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
            {HR_SETTINGS_TABS.filter((tab) => tab.section !== null).map((tab) => {
              const Icon = tab.icon;
              return (
                <li key={tab.section} className="sm:border-b sm:border-border">
                  <Link
                    href={hrSettingsHref(tab.section, { org: orgRef })}
                    className="flex min-h-[3.5rem] items-start gap-3 px-3 py-3 hover:bg-accent"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-foreground">
                        {tab.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {tab.purpose}
                      </span>
                    </span>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        {/* The searchable index */}
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-foreground">
                Every configuration key
              </h2>
              <p className="text-sm text-muted-foreground">
                Open a row to change it for this employer, or to clear an override and
                follow the platform default again.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant={overriddenOnly ? "default" : "outline"}
              className="min-h-11 sm:min-h-9"
              onClick={() => setOverriddenOnly((current) => !current)}
            >
              {overriddenOnly ? "Showing overrides only" : "Show overrides only"}
            </Button>
          </div>

          <MatrxDataTable
            data={knobs}
            columns={columns}
            getRowId={(row) => row.full_key}
            isLoading={isLoading}
            pageSize={25}
            urlState={{ id: "hr-settings-keys" }}
            toolbar={{
              search: true,
              searchPlaceholder: "Search every setting by name, area or value",
            }}
            emptyState={{
              title: overriddenOnly
                ? "This employer overrides nothing"
                : "No configuration keys are registered for HR",
              description: overriddenOnly
                ? "Every setting is following the platform default. Turn the filter off to see them all."
                : "Nothing in the platform registry starts with hr. — which would mean HR has no configuration at all. Send this screen to whoever runs the platform.",
            }}
            detail={{
              title: (row) => row.key.replace(/_/g, " "),
              description: (row) => row.full_key,
              render: (row) =>
                organizationId ? (
                  <div className="p-3">
                    <KnobRow
                      knob={row}
                      organizationId={organizationId}
                      onChanged={refresh}
                    />
                  </div>
                ) : null,
            }}
          />
        </section>
      </div>
    </HrSettingsShell>
  );
}
