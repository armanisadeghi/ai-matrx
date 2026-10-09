"use client";

import { useModelRecords } from "@ai-matrx/chat/agents/identity/model-catalog";
import { useId } from "react";
import { SettingsRow } from "../SettingsRow";
import { ModelListDropdown } from "@ai-matrx/agents/models/react";
import { useModels } from "@/features/ai-models/hooks/useModels";
import {
  selectPlatformDefaultImageModelName,
  selectPlatformDefaultTextModelName,
  type DefaultableModality,
} from "@/features/ai-models/redux/platformDefaultModel";
import { useSelector } from "react-redux";
import type { RootState } from "@/lib/redux/store";
import type { SettingsCommonProps } from "../types";

type Scope = "all" | "active" | "inactive";

/**
 * A model offered in several CLASSES (Matrx Fast, Matrx Lightning, ...) is
 * several products. A setting whose model configures a call stores the chosen
 * class beside it (`offeringId`); one that only NAMES a model passes
 * `modelOnly`. Same contract as `ModelListDropdown`.
 */
type SettingsModelClassProps =
  | {
      /** Chosen class (`ai.offering` uuid); null = the preferred class. */
      offeringId: string | null;
      onOfferingIdChange: (offeringId: string | null) => void;
      modelOnly?: never;
    }
  | {
      modelOnly: true;
      offeringId?: never;
      onOfferingIdChange?: never;
    };

export type SettingsModelPickerProps = SettingsCommonProps &
  SettingsModelClassProps & {
  /** Selected model id; null = platform default (catalog-resolved). */
  value: string | null;
  onValueChange: (value: string | null) => void;
  /**
   * Which subset of models to show.
   * - "active": only models the user has marked active (default)
   * - "inactive": only inactive models
   * - "all": every model
   */
  scope?: Scope;
  /**
   * Render a "Platform default" option (maps to null). The label names the
   * catalog-resolved default when the registry knows it. Pass the modality
   * the surface generates (default "text").
   */
  allowPlatformDefault?: boolean;
  /**
   * The words for the null option when the default is NOT the catalog's
   * primary model — e.g. image generation, where a server mandate decides and
   * naming the catalog primary would be a false sentence.
   */
  platformDefaultLabel?: string;
  defaultModality?: DefaultableModality;
  placeholder?: string;
  last?: boolean;
};

/**
 * Shared model-selection row. Wraps the AI-models registry so every settings
 * surface renders model pickers identically (no divergence across tabs).
 */
export function SettingsModelPicker({
  value,
  onValueChange,
  scope = "active",
  allowPlatformDefault = false,
  platformDefaultLabel: platformDefaultLabelOverride,
  defaultModality = "text",
  placeholder,
  last,
  offeringId,
  onOfferingIdChange,
  modelOnly: _modelOnly,
  ...rowProps
}: SettingsModelPickerProps) {
  const generatedId = useId().replace(/:/g, "");
  const id = rowProps.id ?? `settings-${generatedId}`;
  const { models } = useModels();
  // "Active" = not switched off in Settings › Models (the person's hidden list).
  const hiddenIds = useSelector(
    (state: RootState) => state.userPreferences.aiModels.inactiveModels,
  );
  // Catalog-resolved platform default (is_primary), for the null-option label.
  const platformDefaultName = useModelRecords(
    defaultModality === "image"
      ? selectPlatformDefaultImageModelName
      : selectPlatformDefaultTextModelName,
  );
  const hiddenSet = new Set(hiddenIds);

  const filtered = models.filter((m) => {
    if (scope === "active") return !hiddenSet.has(m.id);
    if (scope === "inactive") return hiddenSet.has(m.id);
    return true;
  });

  const platformDefaultLabel =
    platformDefaultLabelOverride ??
    (platformDefaultName
      ? `Platform default (${platformDefaultName})`
      : "Platform default");

  const classProps = onOfferingIdChange
    ? {
        pinnedOfferingId: offeringId,
        onOfferingPinChange: (next: string | undefined) =>
          onOfferingIdChange(next ?? null),
      }
    : { modelOnly: true as const };

  return (
    <SettingsRow {...rowProps} id={id} variant="inline" controlLayout="wide" last={last}>
      <ModelListDropdown
        id={id}
        value={value}
        onValueChange={onValueChange}
        {...classProps}
        inputModalities={[]}
        outputModalities={[defaultModality]}
        allowedModelIds={filtered.map((model) => model.id)}
        emptyOptionLabel={
          allowPlatformDefault ? platformDefaultLabel : undefined
        }
        onClear={
          allowPlatformDefault
            ? () => {
                // The platform default has no class of the person's choosing.
                onOfferingIdChange?.(null);
                onValueChange(null);
              }
            : undefined
        }
        placeholder={placeholder ?? "Choose a model"}
        disabled={rowProps.disabled}
        triggerVariant="settings"
        className="w-80 max-w-full justify-between"
      />
    </SettingsRow>
  );
}
