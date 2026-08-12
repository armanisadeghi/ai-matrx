"use client";

import React, { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { findTab, getTabTreeNodes } from "@/features/settings/registry";
import { SettingsTabHost } from "@/features/settings/components/SettingsTabHost";
import { flattenLeaves } from "@/components/official/settings/tree/types";
import { SurfaceRuntimeProvider } from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { createSettingsScope } from "@/features/surfaces/manifests/settings.manifest";
import {
  getSliceBinding,
  parseSettingsPath,
} from "@/features/settings/slice-bindings";
import {
  ACCENT_THEME_ENUM_TEXT,
  ASSISTANT_NAME_MAX_LENGTH,
  DISPLAY_LAYOUT_FIELDS,
  LANGUAGE_PATCH_FIELDS,
  TEXT_STYLE_FIELDS,
  THEME_MODE_ENUM_TEXT,
  VOICE_EMOTION_MAX_LENGTH,
  VOICE_WAKE_WORD_MAX_LENGTH,
  isAccentTheme,
  isThemeMode,
  type EnumPatchField,
} from "@/features/settings/agent-writable-settings";
import { tabIdToHref } from "./routing";

/** One resolved write: the `useSetting` path and the value to land there. */
type PendingWrite = { path: string; value: unknown };

/**
 * Unwrap an object-valued write target's argument.
 *
 * Note the inline-tool layer already PARSES a JSON-looking argument before a
 * handler sees it, so a structured target receives a real object — never a
 * JSON string. That is why these targets accept the object directly and the
 * free-text ones say "plain text, not JSON" in their own errors.
 */
function requirePatch(
  target: string,
  value: unknown,
  accepted: readonly string[],
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(
      `${target} expects an object with any subset of these keys: ${accepted.join(" | ")}.`,
    );
  const patch = value as Record<string, unknown>;
  const unsupported = Object.keys(patch).filter((k) => !accepted.includes(k));
  if (unsupported.length > 0)
    throw new Error(
      `${target} got unsupported key(s): ${unsupported.join(", ")}. Accepted keys: ${accepted.join(" | ")}.`,
    );
  if (!accepted.some((k) => k in patch))
    throw new Error(
      `${target} needs at least one of: ${accepted.join(" | ")}.`,
    );
  return patch;
}

/**
 * Resolve every enum key in a patch against its field table. Throws on the
 * FIRST bad value and quotes the real vocabulary back, so a rejected key
 * never leaves a half-applied preference behind.
 */
function resolveEnumPatch(
  target: string,
  patch: Record<string, unknown>,
  fields: readonly EnumPatchField[],
): PendingWrite[] {
  const writes: PendingWrite[] = [];
  for (const field of fields) {
    if (!(field.key in patch)) continue;
    const next = patch[field.key];
    if (!field.guard(next))
      throw new Error(
        `${target}.${field.key} expects one of: ${field.enumText}. Got ${JSON.stringify(next)}.`,
      );
    writes.push({ path: field.path, value: next });
  }
  return writes;
}

/** Validate a plain-text field: real string, trimmed, within its bound. */
function requireText(
  target: string,
  value: unknown,
  maxLength: number,
  { allowEmpty }: { allowEmpty: boolean },
): string {
  if (typeof value !== "string")
    throw new Error(
      `${target} expects a plain text string — not JSON and not JSON-encoded. Got ${typeof value}.`,
    );
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed)
    throw new Error(`${target} expects a non-empty plain text string.`);
  if (trimmed.length > maxLength)
    throw new Error(
      `${target} must be at most ${maxLength} characters (got ${trimmed.length}).`,
    );
  return trimmed;
}

interface Props {
  /** Tab id resolved from the URL (e.g. "general.notifications"). `null` for
   *  the route's index landing. */
  tabId: string | null;
  basePath: string;
}

/**
 * Bridges the route page (which has a tab id from the URL) to the existing
 * `SettingsTabHost` (which expects a `SettingsTabDef`). All the heavy lifting
 * — Suspense, error boundary, breadcrumb, empty state — comes from
 * `SettingsTabHost`. We just resolve the id and wire breadcrumb navigation
 * back to `router.push`.
 *
 * Also the surface-runtime emitter for `matrx-user/settings`
 * (`features/surfaces/manifests/settings.manifest.ts`): active tab (from the
 * URL), the visible sections tree, the autosave flush status, and the
 * agent-writable preference block — plus the write handlers for that block.
 * This is the ONLY mount that registers the surface; the WindowPanel/drawer
 * settings shell owns no surface state and registers nothing.
 */
export function SettingsTabContentImpl({ tabId, basePath }: Props) {
  const router = useRouter();
  const store = useAppStore();
  const dispatch = useAppDispatch();
  const isAdmin = useAppSelector(selectIsAdmin);

  const treeNodes = useMemo(() => getTabTreeNodes(isAdmin), [isAdmin]);
  const activeTab = useMemo(
    () => (tabId ? (findTab(tabId) ?? null) : null),
    [tabId],
  );

  const getScope = () => {
    // Read the flush flag imperatively so the Run-time scope is live without
    // subscribing this component to every preferences write.
    const state = store.getState();
    const isSaving = state.userPreferences._meta?.isLoading ?? false;
    const activePath = activeTab
      ? tabIdToHref(basePath, activeTab.id)
      : undefined;
    // The agent-writable preferences, read straight from the slices the
    // settings controls read. Not scoped to the open tab: an agent can see
    // (and change) these from anywhere in Settings.
    const display = state.userPreferences.display;
    const textGeneration = state.userPreferences.textGeneration;
    const voice = state.userPreferences.voice;
    return createSettingsScope({
      settings_sections: flattenLeaves(treeNodes).map((leaf) => ({
        id: leaf.id,
        label: leaf.label,
        path: tabIdToHref(basePath, leaf.id),
      })),
      is_admin_view: isAdmin,
      is_saving: isSaving,
      theme_mode: state.theme.mode,
      accent_theme: display.theme,
      display_layout: {
        dashboard_layout: display.dashboardLayout,
        sidebar_layout: display.sidebarLayout,
        header_layout: display.headerLayout,
        window_mode: display.windowMode,
      },
      text_generation_style: {
        tone: textGeneration.tone,
        creativity: textGeneration.creativityLevel,
      },
      language_defaults: {
        voice: voice.language,
        text_generation: textGeneration.language,
        flashcards: state.userPreferences.flashcard.language,
      },
      assistant_name: state.userPreferences.assistant.name,
      voice_persona: {
        emotion: voice.emotion,
        wake_word: voice.wakeWord,
      },
      ...(activeTab
        ? {
            active_tab_id: activeTab.id,
            active_tab_label: activeTab.label,
            active_tab_description: activeTab.description,
            active_tab_path: activePath,
            active_tab_persistence: activeTab.persistence,
            active_tab: {
              id: activeTab.id,
              label: activeTab.label,
              description: activeTab.description ?? null,
              path: activePath as string,
              persistence: activeTab.persistence,
              requires_admin: activeTab.requiresAdmin ?? false,
            },
          }
        : {}),
    });
  };

  // ── Agent write targets (matrx-user/settings) ──────────────────────────
  // Every write lands through `useSetting`'s own seam — the SAME action the
  // user's own click on the control dispatches. Nothing here reaches past
  // the store into the persistence layer; the sync policy picks the change
  // up exactly as it does for a click.
  const applySetting = ({ path, value }: PendingWrite) => {
    const { slice, key } = parseSettingsPath(path);
    dispatch(getSliceBinding(slice).write(key, value));
  };

  /**
   * Refuse while an autosave flush is in flight — a write landing mid-flush
   * can be overwritten by the response the flush is already carrying.
   *
   * Read through `store.getState()` rather than a render closure on purpose:
   * `applySurfaceWrite` resolves these handler closures BEFORE the confirm
   * dialog is answered, so a value captured at render time can be stale by
   * the time the user clicks Apply. `getState()` is always live.
   */
  const refuseWhileSaving = (target: string) => {
    if (store.getState().userPreferences._meta?.isLoading)
      throw new Error(
        `${target} is unavailable while a settings save is in flight (is_saving is true). Wait for the save to finish and try again.`,
      );
  };

  /** Validate fully, THEN dispatch — a rejected key never half-applies. */
  const commit = (target: string, writes: PendingWrite[]) => {
    refuseWhileSaving(target);
    writes.forEach(applySetting);
  };

  const getSurfaceWriteHandlers = () => ({
    theme_mode: (value: unknown) => {
      if (!isThemeMode(value))
        throw new Error(
          `theme_mode expects one of: ${THEME_MODE_ENUM_TEXT}. Got ${JSON.stringify(value)}.`,
        );
      commit("theme_mode", [{ path: "theme.mode", value }]);
    },

    accent_theme: (value: unknown) => {
      if (!isAccentTheme(value))
        throw new Error(
          `accent_theme expects one of: ${ACCENT_THEME_ENUM_TEXT}. Got ${JSON.stringify(value)}.`,
        );
      commit("accent_theme", [
        { path: "userPreferences.display.theme", value },
      ]);
    },

    display_layout: (value: unknown) => {
      const patch = requirePatch(
        "display_layout",
        value,
        DISPLAY_LAYOUT_FIELDS.map((f) => f.key),
      );
      commit(
        "display_layout",
        resolveEnumPatch("display_layout", patch, DISPLAY_LAYOUT_FIELDS),
      );
    },

    text_generation_style: (value: unknown) => {
      const patch = requirePatch(
        "text_generation_style",
        value,
        TEXT_STYLE_FIELDS.map((f) => f.key),
      );
      commit(
        "text_generation_style",
        resolveEnumPatch("text_generation_style", patch, TEXT_STYLE_FIELDS),
      );
    },

    language_defaults: (value: unknown) => {
      const patch = requirePatch(
        "language_defaults",
        value,
        LANGUAGE_PATCH_FIELDS.map((f) => f.key),
      );
      commit(
        "language_defaults",
        resolveEnumPatch("language_defaults", patch, LANGUAGE_PATCH_FIELDS),
      );
    },

    assistant_name: (value: unknown) => {
      const name = requireText(
        "assistant_name",
        value,
        ASSISTANT_NAME_MAX_LENGTH,
        { allowEmpty: false },
      );
      commit("assistant_name", [
        { path: "userPreferences.assistant.name", value: name },
      ]);
    },

    voice_persona: (value: unknown) => {
      const patch = requirePatch("voice_persona", value, [
        "emotion",
        "wake_word",
      ]);
      const writes: PendingWrite[] = [];
      // Empty string is allowed here — it is how the user clears the field.
      if ("emotion" in patch)
        writes.push({
          path: "userPreferences.voice.emotion",
          value: requireText(
            "voice_persona.emotion",
            patch.emotion,
            VOICE_EMOTION_MAX_LENGTH,
            { allowEmpty: true },
          ),
        });
      if ("wake_word" in patch)
        writes.push({
          path: "userPreferences.voice.wakeWord",
          value: requireText(
            "voice_persona.wake_word",
            patch.wake_word,
            VOICE_WAKE_WORD_MAX_LENGTH,
            { allowEmpty: true },
          ),
        });
      commit("voice_persona", writes);
    },
  });

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/settings"
      getScope={getScope}
      getWriteHandlers={getSurfaceWriteHandlers}
      isEditable={false}
    >
      <SettingsTabHost
        activeTab={activeTab}
        treeNodes={treeNodes}
        onNavigate={(id) => router.push(tabIdToHref(basePath, id))}
      />
    </SurfaceRuntimeProvider>
  );
}

export default SettingsTabContentImpl;
