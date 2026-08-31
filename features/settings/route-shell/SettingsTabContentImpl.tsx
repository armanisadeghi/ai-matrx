"use client";

import React, { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useAppDispatch, useAppSelector, useAppStore } from "@/lib/redux/hooks";
import { selectIsAdmin } from "@/lib/redux/selectors/userSelectors";
import { findTab, getTabTreeNodes } from "@/features/settings/registry";
import { SettingsTabHost } from "@/features/settings/components/SettingsTabHost";
import { flattenLeaves } from "@/components/official/settings/tree/types";
import {
  SurfaceRuntimeProvider,
  getRegisteredSurfaceScopeContributions,
} from "@/features/surfaces/runtime/SurfaceRuntimeContext";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { createSettingsScope } from "@/features/surfaces/manifests/settings.manifest";
import {
  getSliceBinding,
  parseSettingsPath,
} from "@/features/settings/slice-bindings";
import { tabIdToHref } from "./routing";
import {
  createSettingsWriteHandlers,
  type PendingWrite,
} from "./write-handlers";

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
  const [isNavigationPending, startNavigation] = useTransition();

  const treeNodes = getTabTreeNodes(isAdmin);
  const activeTab = tabId ? (findTab(tabId) ?? null) : null;

  const navigate = (id: string | null) => {
    const href = id ? tabIdToHref(basePath, id) : basePath;
    startNavigation(() => router.push(href));
  };

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
    const baseScope = createSettingsScope({
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
    const contributedScope = getRegisteredSurfaceScopeContributions(
      "matrx-user/settings",
    );
    for (const name of Object.keys(contributedScope)) {
      if (name in baseScope) {
        throw new Error(
          `[settings] descendant scope contribution attempted to replace provider-owned value "${name}"`,
        );
      }
    }
    return { ...baseScope, ...contributedScope };
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

  const getSurfaceWriteHandlers = () => createSettingsWriteHandlers(commit);

  return (
    <SurfaceRuntimeProvider
      surfaceName="matrx-user/settings"
      getScope={getScope}
      getWriteHandlers={getSurfaceWriteHandlers}
      isEditable={false}
    >
      <NonEditableContextMenu
        sourceFeature="system"
        surfaceName="matrx-user/settings"
        menuVersion={1}
        getApplicationScope={getScope}
        contentSource={{ type: "raw" }}
      >
        <div className="contents">
          <SettingsTabHost
            activeTab={activeTab}
            treeNodes={treeNodes}
            onNavigate={navigate}
            navigationPending={isNavigationPending}
          />
        </div>
      </NonEditableContextMenu>
    </SurfaceRuntimeProvider>
  );
}

export default SettingsTabContentImpl;
