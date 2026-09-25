"use client";

// Users & Access › Limits & Knobs › Feature knobs — the SYSTEM destination of
// the universal settings editor, mounted here rather than re-implemented
// (`UniversalSettingsProvider target="system"` + `UniversalSettingsRows`, the
// same rows the personal and organization destinations render).
//
// 🚨 WHY THIS PANEL EXISTS AT ALL, AND WHAT IT MAY ADD. It is a register: ~880
// rows an operator arrives at knowing a KEY ("orchestration.loop_guard.*") and
// nothing else. So it adds exactly three register affordances on top of the
// editor — a search box over the shared matcher, a deep link to one key, and
// the agent-review banner — and NOTHING that duplicates a row's behaviour. The
// key and the origin sentence now print on the row itself, inside the shared
// `KnobOverrideRow`, so every destination inherits them (law 5).

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsNavigationSearch } from "@/components/official/settings/navigation/SettingsFlatNavigation";
import { SettingsDesignProvider } from "@/components/official/settings/SettingsDesignProvider";
import { UniversalSettingsProvider, useUniversalSettings } from "@/features/settings/universal/UniversalSettingsContext";
import { UniversalSettingsRows } from "@/features/settings/universal/UniversalSettingsPane";
import { knobMatchesControlSearch } from "@/features/settings/search/controlSearch";
import { fetchKnobOverrideCounts } from "@/lib/scoped-config/service";
import { registerDirectiveHandler } from "@/lib/client-directives/directiveRegistry";
import { replaceAddressWithoutNavigating } from "@/lib/url-state/addressWithoutNavigating";

/** `?knob=<feature.key>` — what a mandate page or a doc links a knob by. */
const KNOB_PARAM = "knob";

function isOverdue(setBy: string, reviewDue: string | null): boolean {
  return setBy === "agent" && reviewDue !== null && new Date(reviewDue) < new Date();
}

function SystemKnobRows() {
  const settings = useUniversalSettings();
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkedKey = searchParams?.get(KNOB_PARAM)?.trim() ?? "";
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [countError, setCountError] = useState<string | null>(null);
  const [countRequest, requestCountRefresh] = useState(0);
  // A deep link ARRIVES as a search: the operator lands on the one row, and the
  // box holds the key so they can widen it (drop `.failure_threshold` to see
  // the whole guard) instead of being stuck in a filter they cannot see.
  const [query, setQuery] = useState(deepLinkedKey);
  const [syncedDeepLink, setSyncedDeepLink] = useState(deepLinkedKey);
  if (syncedDeepLink !== deepLinkedKey) {
    setSyncedDeepLink(deepLinkedKey);
    setQuery(deepLinkedKey);
  }

  useEffect(() => {
    let current = true;
    void fetchKnobOverrideCounts().then(
      (rows) => {
        if (!current) return;
        setCounts(Object.fromEntries(rows.map((row) => [`${row.feature}.${row.key}`, row.total_count])));
        setCountError(null);
      },
      (error: unknown) => {
        if (!current) return;
        setCountError(error instanceof Error ? error.message : String(error));
      },
    );
    const unregister = registerDirectiveHandler("settings_changed", () => {
      requestCountRefresh((value) => value + 1);
      settings.refresh();
    });
    return () => {
      current = false;
      unregister();
    };
  }, [countRequest, settings.refresh]);

  // React Compiler is on — no hand-rolled memo.
  const matching = settings.knobs.filter((knob) => knobMatchesControlSearch(knob, query));

  if (settings.isLoading) return <p className="text-sm text-muted-foreground">Loading knobs…</p>;
  if (settings.error) return <SettingsCallout tone="error" title="Knobs could not be read">{settings.error}</SettingsCallout>;
  const overdue = settings.knobs.filter((knob) => isOverdue(knob.set_by, knob.review_due));
  const trimmed = query.trim();

  const clearSearch = () => {
    setQuery("");
    // Clearing the box must also drop the deep link, or the next render
    // re-seeds the query from the URL and the box refills itself.
    if (deepLinkedKey) {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      next.delete(KNOB_PARAM);
      const suffix = next.toString();
      replaceAddressWithoutNavigating(suffix ? `?${suffix}` : "?");
    }
  };

  return (
    <>
      <SettingsCallout tone="info" title="Every platform limit is a typed setting">
        Each row keeps its registered default, basis, and review date. Changes refresh this register and all override counts.
      </SettingsCallout>
      {overdue.length > 0 && <p className="mt-3 flex items-center gap-2 text-sm text-amber-600"><AlertTriangle className="h-4 w-4" />{overdue.length} agent-set setting{overdue.length === 1 ? " is" : "s are"} past review.</p>}
      {countError && <SettingsCallout tone="error" title="Override counts could not be read">{countError}</SettingsCallout>}
      <div className="relative mt-4">
        <SettingsNavigationSearch
          value={query}
          onValueChange={(value) => {
            setQuery(value);
            if (value.trim() === "") clearSearch();
          }}
          label="Search by key, name or description"
        />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {trimmed
          ? `${matching.length} of ${settings.knobs.length} settings match “${trimmed}”.`
          : `${settings.knobs.length} settings registered. Search a key such as orchestration.loop_guard to narrow the list.`}
      </p>
      {trimmed !== "" && matching.length === 0 && (
        <SettingsCallout tone="warning" title="No setting matches that search">
          Nothing in the register matches “{trimmed}”. Keys look like
          feature.key — try a shorter fragment such as loop_guard.
        </SettingsCallout>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        {matching.filter((knob) => (counts[knob.full_key] ?? 0) > 0).map((knob) => <Badge key={knob.full_key} variant="secondary">{knob.label}: {counts[knob.full_key]} override{counts[knob.full_key] === 1 ? "" : "s"}</Badge>)}
      </div>
      <div className="mt-4">
        <UniversalSettingsRows knobs={matching} overrideCounts={counts} onChanged={() => {
          requestCountRefresh((value) => value + 1);
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
