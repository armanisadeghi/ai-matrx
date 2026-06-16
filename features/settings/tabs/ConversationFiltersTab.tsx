"use client";

/**
 * ConversationFiltersTab — per-surface defaults for the conversation source
 * filter (which `source_feature` provenance a history surface shows by
 * default). Lets the user curate, per surface (Chat, Code workspace, …),
 * exactly which features appear without opening the filter tree every time.
 *
 * Reads/writes the whole `conversationFilters.surfaces` record through ONE
 * `useSetting` binding (the settings binding only supports `module.preference`
 * depth, so per-surface keys are merged in-tab). A surface with no override
 * falls back to its registry default.
 */

import { Filter, ListFilter, RotateCcw } from "lucide-react";
import { SettingsSubHeader } from "@/components/official/settings/layout/SettingsSubHeader";
import { SettingsSection } from "@/components/official/settings/layout/SettingsSection";
import { SettingsCallout } from "@/components/official/settings/layout/SettingsCallout";
import { SettingsMultiSelect } from "@/components/official/settings/primitives/SettingsMultiSelect";
import { SettingsSwitch } from "@/components/official/settings/primitives/SettingsSwitch";
import { SettingsButton } from "@/components/official/settings/primitives/SettingsButton";
import type { SettingsOption } from "@/components/official/settings/types";
import { useSetting } from "../hooks/useSetting";
import type { ConversationFilterSurfacePref } from "@/lib/redux/preferences/userPreferencesSlice";
import {
  EMPTY_SOURCE_KEY,
  FEATURE_META,
  FILTERABLE_SURFACES,
  getSurfaceDefault,
} from "@/features/agents/redux/conversation-history/source-registry";

/** Feature options for the multi-select — every known feature, minus the
 * empty sentinel (which is its own switch). */
const FEATURE_OPTIONS: SettingsOption[] = Object.entries(FEATURE_META)
  .filter(([key]) => key !== EMPTY_SOURCE_KEY)
  .map(([key, meta]) => ({ value: key, label: meta.label, icon: meta.icon }))
  .sort((a, b) => a.label.localeCompare(b.label));

export default function ConversationFiltersTab() {
  const [surfaces, setSurfaces] = useSetting<
    Record<string, ConversationFilterSurfacePref>
  >("userPreferences.conversationFilters.surfaces");

  const surfaceMap = surfaces ?? {};

  const effectivePref = (surfaceId: string): ConversationFilterSurfacePref =>
    surfaceMap[surfaceId] ?? getSurfaceDefault(surfaceId);

  const updateSurface = (
    surfaceId: string,
    patch: Partial<ConversationFilterSurfacePref>,
  ) => {
    const next = { ...effectivePref(surfaceId), ...patch };
    setSurfaces({ ...surfaceMap, [surfaceId]: next });
  };

  const resetSurface = (surfaceId: string) => {
    const next = { ...surfaceMap };
    delete next[surfaceId];
    setSurfaces(next);
  };

  return (
    <>
      <SettingsSubHeader
        title="Conversation filters"
        description="Choose which surfaces' conversations each history view shows by default. The in-app filter still lets you reach everything else any time."
        icon={Filter}
      />

      <SettingsCallout tone="info">
        These are the <strong>defaults</strong> a surface opens with. You can
        always widen or narrow the view on the fly with the filter button in
        the history sidebar — these settings just decide where it starts.
      </SettingsCallout>

      {FILTERABLE_SURFACES.map((surface) => {
        const pref = effectivePref(surface.id);
        const overridden = surface.id in surfaceMap;
        return (
          <SettingsSection
            key={surface.id}
            title={surface.label}
            icon={ListFilter}
            description={surface.description}
          >
            <SettingsMultiSelect
              label="Show features"
              description={
                pref.includeFeatures.length === 0
                  ? "Nothing selected — this surface shows every conversation."
                  : "Only conversations from these features show by default."
              }
              value={pref.includeFeatures}
              onValueChange={(value) =>
                updateSurface(surface.id, { includeFeatures: value })
              }
              options={FEATURE_OPTIONS}
              placeholder="Show everything"
              modified={overridden}
            />
            <SettingsSwitch
              label="Include generic / system conversations"
              description="Conversations with no recorded source (automations, scripted runs)."
              checked={pref.includeEmptySource}
              onCheckedChange={(checked) =>
                updateSurface(surface.id, { includeEmptySource: checked })
              }
            />
            <SettingsButton
              label="Reset to default"
              description="Restore this surface to the built-in default filter."
              actionLabel="Reset"
              actionIcon={RotateCcw}
              kind="outline"
              onClick={() => resetSurface(surface.id)}
              disabled={!overridden}
              last
            />
          </SettingsSection>
        );
      })}
    </>
  );
}
