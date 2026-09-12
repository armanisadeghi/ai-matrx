"use client";

import { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsDesignProvider } from "@/components/official/settings/SettingsDesignProvider";
import { UniversalSettingsProvider, useUniversalSettings } from "@/features/settings/universal/UniversalSettingsContext";
import { UniversalSettingsRows } from "@/features/settings/universal/UniversalSettingsPane";
import { fetchKnobOverrideCounts } from "@/lib/scoped-config/service";
import { registerDirectiveHandler } from "@/lib/client-directives/directiveRegistry";

function isOverdue(setBy: string, reviewDue: string | null): boolean {
  return setBy === "agent" && Boolean(reviewDue) && new Date(reviewDue!) < new Date();
}

function SystemKnobRows() {
  const settings = useUniversalSettings();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countError, setCountError] = useState<string | null>(null);
  const loadCounts = async () => {
    try {
      const rows = await fetchKnobOverrideCounts();
      setCounts(Object.fromEntries(rows.map((row) => [`${row.feature}.${row.key}`, row.total_count])));
      setCountError(null);
    } catch (error) {
      setCountError(error instanceof Error ? error.message : String(error));
    }
  };

  useEffect(() => {
    void loadCounts();
    return registerDirectiveHandler("settings_changed", () => {
      void loadCounts();
      settings.refresh();
    });
  }, [settings.refresh]);

  if (settings.isLoading) return <p className="text-sm text-muted-foreground">Loading knobs…</p>;
  if (settings.error) return <SettingsCallout tone="error" title="Knobs could not be read">{settings.error}</SettingsCallout>;
  const overdue = settings.knobs.filter((knob) => isOverdue(knob.set_by, knob.review_due));
  return (
    <>
      <SettingsCallout tone="info" title="Every platform limit is a typed setting">
        Each row keeps its registered default, basis, and review date. Changes refresh this register and all override counts.
      </SettingsCallout>
      {overdue.length > 0 && <p className="mt-3 flex items-center gap-2 text-sm text-amber-600"><AlertTriangle className="h-4 w-4" />{overdue.length} agent-set setting{overdue.length === 1 ? " is" : "s are"} past review.</p>}
      {countError && <SettingsCallout tone="error" title="Override counts could not be read">{countError}</SettingsCallout>}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {settings.knobs.filter((knob) => (counts[knob.full_key] ?? 0) > 0).map((knob) => <Badge key={knob.full_key} variant="secondary">{knob.label}: {counts[knob.full_key]} override{counts[knob.full_key] === 1 ? "" : "s"}</Badge>)}
      </div>
      <div className="mt-4">
        <UniversalSettingsRows knobs={settings.knobs} onChanged={() => {
          void loadCounts();
          settings.refresh();
        }} />
      </div>
    </>
  );
}

/** The system destination reuses the same typed rows as user and organization settings. */
export function FeatureKnobsPanel() {
  return <UniversalSettingsProvider target="system"><SettingsDesignProvider variant="compact"><SystemKnobRows /></SettingsDesignProvider></UniversalSettingsProvider>;
}
