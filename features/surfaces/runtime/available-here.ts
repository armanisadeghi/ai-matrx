"use client";

/**
 * WHAT IS AVAILABLE HERE — the disclosure half of the requirement law.
 *
 * 🚨 THE LAW (THE-MODEL law 3, "Availability = capability"): an item is
 * offered on a surface iff every surface value it consumes has a READ PATH
 * here — key-existence, never value-population. Phase 6.7 made the CONTEXT
 * MENU obey that rule (`features/context-menu-v3/model/requirement-gate.ts`).
 * It did not make the rule VISIBLE anywhere: the surface disclosure section
 * (census #16) and the Surface Context window (census #52) both showed the
 * declared contract and said nothing about what the contract makes possible.
 *
 * This module is that missing half, and it is deliberately NOT a second gate.
 * It calls the SAME pure functions the menu calls — `buildAvailableKeys` +
 * `decideOffer` — so "what the menu will offer" and "what these two windows
 * say is available" can never disagree. A divergence here would be worse than
 * the silence it replaces.
 *
 * IDENTITY IS STORAGE-POSITION-DEPENDENT, and this module says so out loud.
 * With `SHORTCUT_STORAGE_CUTOVER` OFF the rows are `agent.shortcut` rows and
 * carry NO mandate identity, so a per-row coverage badge (the second clause of
 * census #16) has nothing to key on. Rather than render an empty badge column
 * that reads as "covered", the count of identity-less rows is reported as
 * `withoutMandateIdentity` and the consumers state it in words. When the
 * switch flips, `mandate_key` arrives on the same rows and the badge becomes
 * buildable with no change here.
 */

import { useCallback, useEffect, useMemo } from "react";

import {
  buildAvailableKeys,
  decideOffer,
  requirementsOf,
  type GateableItem,
  type OfferRefusal,
} from "@/features/context-menu-v3/model/requirement-gate";
import { BASELINE_VALUE_NAMES } from "@/features/surfaces/manifests/_baseline.manifest";
import { getManifest } from "@/features/surfaces/manifests/registry";
import { useSurfaceConfig } from "@/features/surfaces/hooks/useSurfaceConfig";
import type { MenuConfig } from "@/features/surfaces/config/namespace-registry";
import { useLiveSurfaceScope } from "@/features/surfaces/runtime/useLiveSurfaceScope";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllShortcutsArray } from "@/features/agents/redux/agent-shortcuts/selectors";
import { fetchUnifiedMenu } from "@/features/agents/redux/agent-shortcuts/thunks";
import type { AgentShortcutRecord } from "@/features/agents/redux/agent-shortcuts/types";

/** One item the requirement gate says this surface can run. */
export interface AvailableHereItem {
  id: string;
  label: string;
  /** The surface values it consumes — all of which resolve here, by definition. */
  requirements: string[];
  /**
   * The mandate behind the row, when the active storage carries one. Null on
   * every row while `SHORTCUT_STORAGE_CUTOVER` is OFF — see the file header.
   */
  mandateKey: string | null;
}

/** One item the gate REFUSED, with the reason — for the admin inspector. */
export interface UnavailableHereItem extends AvailableHereItem {
  refusal: OfferRefusal;
}

export interface AvailableHereResult {
  /** Every surface value name with a read path here (baseline ∪ declared ∪ live). */
  availableKeys: ReadonlySet<string>;
  /** Items the gate offers on this surface, sorted by label. */
  available: AvailableHereItem[];
  /** Items the gate refuses here, with why. Sorted by label. */
  unavailable: UnavailableHereItem[];
  /**
   * How many OFFERED rows carry no mandate identity on the active storage.
   * Non-zero is the honest statement that per-row coverage cannot be shown
   * yet, not a silent omission.
   */
  withoutMandateIdentity: number;
  /** True once the menu rows have been asked for at least once. */
  loaded: boolean;
  refresh: () => void;
}

/**
 * The pure decision. Exported for tests and for any consumer that already has
 * the rows and the keys in hand.
 */
export function selectAvailableHere(args: {
  items: readonly (GateableItem & {
    label?: string | null;
    isActive?: boolean | null;
    mandateKey?: string | null;
  })[];
  surfaceName: string | null;
  availableKeys: ReadonlySet<string>;
  excludedItemIds?: ReadonlySet<string>;
}): {
  available: AvailableHereItem[];
  unavailable: UnavailableHereItem[];
  withoutMandateIdentity: number;
} {
  const available: AvailableHereItem[] = [];
  const unavailable: UnavailableHereItem[] = [];

  for (const item of args.items) {
    if (item.isActive === false) continue;
    const row: AvailableHereItem = {
      id: item.id,
      label: item.label?.trim() || item.id,
      requirements: requirementsOf(item).sort(),
      mandateKey: item.mandateKey ?? null,
    };
    const decision = decideOffer(item, {
      surfaceName: args.surfaceName,
      availableKeys: args.availableKeys,
      excludedItemIds: args.excludedItemIds,
    });
    if (decision.offered) available.push(row);
    else unavailable.push({ ...row, refusal: decision.refusal });
  }

  const byLabel = (a: AvailableHereItem, b: AvailableHereItem) =>
    a.label.localeCompare(b.label);
  available.sort(byLabel);
  unavailable.sort(byLabel);

  return {
    available,
    unavailable,
    withoutMandateIdentity: available.filter((r) => !r.mandateKey).length,
  };
}

/**
 * The hook both disclosure surfaces use.
 *
 * COST: it reads the shortcut slice that the Agents menu already populates and
 * dispatches `fetchUnifiedMenu` only when that slice is empty. The thunk is
 * single-flight and scope-keyed, so a menu open and a context-window open
 * resolve to ONE request.
 */
export function useAvailableHere(args: {
  surfaceName: string | null;
  enabled?: boolean;
}): AvailableHereResult {
  const { surfaceName, enabled = true } = args;
  const dispatch = useAppDispatch();
  const shortcuts = useAppSelector(selectAllShortcutsArray) as
    | AgentShortcutRecord[]
    | undefined;

  const live = useLiveSurfaceScope({ enabled, surfaceName });

  const refresh = useCallback(() => {
    if (!enabled) return;
    void dispatch(fetchUnifiedMenu({ scope: "user", scopeId: null }));
  }, [dispatch, enabled]);

  const rowCount = shortcuts?.length ?? 0;
  useEffect(() => {
    if (!enabled || rowCount > 0) return;
    refresh();
  }, [enabled, rowCount, refresh]);

  // Same three sources, same order, as `useContextMenuActions` — the KEY SET
  // is the dependency, never the scope object (rebuilt every sample).
  const scopeKeySignature = Object.keys(live.scope).sort().join("|");
  const availableKeys = useMemo(
    () =>
      buildAvailableKeys({
        baselineValueNames: BASELINE_VALUE_NAMES,
        declaredValueNames: surfaceName
          ? getManifest(surfaceName)?.values.map((v) => v.name)
          : undefined,
        runtimeScopeKeys: scopeKeySignature.split("|").filter(Boolean),
      }),
    [surfaceName, scopeKeySignature],
  );

  const { getNamespace } = useSurfaceConfig(
    surfaceName ?? "matrx-unregistered/available-here",
  );
  const menuConfig = getNamespace<MenuConfig>("menu");
  const excludedItemIds = useMemo(
    () => new Set(menuConfig?.excludedItemIds ?? []),
    [menuConfig],
  );

  const decided = useMemo(
    () =>
      selectAvailableHere({
        items: shortcuts ?? [],
        surfaceName,
        availableKeys,
        excludedItemIds,
      }),
    [shortcuts, surfaceName, availableKeys, excludedItemIds],
  );

  return {
    availableKeys,
    available: decided.available,
    unavailable: decided.unavailable,
    withoutMandateIdentity: decided.withoutMandateIdentity,
    loaded: rowCount > 0,
    refresh,
  };
}
