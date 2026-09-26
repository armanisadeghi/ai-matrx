// features/rich-document/actions/provider.ts
//
// Rich-document's actions as ONE provider of the Alchemy action registry
// (Matrx Alchemy ALC-15, LIST A1). This file replaces the app's own registry
// (`actions/registry.ts`, deleted): handler modules still call
// `registerAction(...)` at import time, but what they register is this
// provider's list, and every eligibility answer comes from the package's one
// pure pass (`computeEligibility` over a ClickTarget) — never a second copy.
//
//   • Duplicate ids are REFUSED (the old registry silently overwrote — R12).
//     Next.js fast refresh re-runs a handler module in development, so there a
//     re-registration replaces the entry with a console warning; in tests and
//     production a duplicate throws `DuplicateActionError`.
//   • `disabled` becomes ABSENT (chair ruling R1): a row the person cannot use
//     right now is not drawn.
//   • `writesSource` becomes `writes: [RICH_DOCUMENT_SOURCE_TARGET]`: absent
//     on a read-only source (the target declares nothing writable).
//   • Icons become KEYS resolved by the host's icon port
//     (components/agent-copy/alchemy-icon-keys.ts registers each component).
//   • MENU_STRUCTURE's named submenus ("Save as", "Copy as", …) become the
//     action's `section`, so every layout keeps today's groupings by name.

import {
  DuplicateActionError,
  computeEligibility,
  createClickTarget,
  type Action,
  type ActionProvider,
  type ClickTarget,
  type Eligibility,
} from "@ai-matrx/alchemy/actions";
import type { WriteTarget } from "@ai-matrx/alchemy/declare";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";
import { MENU_STRUCTURE } from "../variants/shared/menuStructure";
import { resolveActionLabel } from "./utils";
import type {
  RichDocumentAction,
  RichDocumentActionContext,
  RichDocumentActionId,
} from "../types";

export const RICH_DOCUMENT_PROVIDER_ID = "rich-document";

/** The write target every source adapter serves (edit, delete, regenerate, fork…). */
export const RICH_DOCUMENT_SOURCE_TARGET = "rich_document_source";

const SOURCE_WRITE_TARGET: WriteTarget = {
  name: RICH_DOCUMENT_SOURCE_TARGET,
  label: "This content",
  description: "The record the content came from, changed through its source adapter.",
  valueType: "document",
  mode: "entity",
};

/** Insertion order = registration order = the stable display order within a section. */
const ACTIONS = new Map<string, RichDocumentAction>();
const listeners = new Set<() => void>();

/** Register an action at module load. A duplicate id is refused. */
export function registerAction(action: RichDocumentAction): void {
  if (ACTIONS.has(action.id)) {
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[rich-document] action "${action.id}" re-registered (fast refresh) — replaced.`,
      );
    } else {
      throw new DuplicateActionError(action.id, RICH_DOCUMENT_PROVIDER_ID, RICH_DOCUMENT_PROVIDER_ID);
    }
  }
  ACTIONS.set(action.id, action);
  for (const l of [...listeners]) l();
}

/** Get one action by ID. Returns undefined if unregistered. */
export function getAction(
  id: RichDocumentActionId | string,
): RichDocumentAction | undefined {
  return ACTIONS.get(id);
}

/** Get all registered actions. */
export function getAllActions(): RichDocumentAction[] {
  return Array.from(ACTIONS.values());
}

// ── Section + order from the existing menu hierarchy ─────────────────────────

const PLACEMENT = (() => {
  const map = new Map<string, { order: number; section?: { id: string; label: string; icon?: string } }>();
  MENU_STRUCTURE.forEach((section, sectionIndex) => {
    section.actionIds.forEach((id, index) => {
      const order = sectionIndex * 100 + index;
      if (section.submenu === null) {
        map.set(id, { order });
      } else {
        const icon = section.icon ? registerAlchemyIcon(section.icon) : undefined;
        map.set(id, {
          order,
          section: {
            id: `rd:${section.submenu.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
            label: section.submenu,
            ...(icon ? { icon } : {}),
          },
        });
      }
    });
  });
  return map;
})();

/** Two ids for one act: only the canonical row is offered when both are present. */
const MENU_ALIASES: Record<string, string> = {
  "regenerate-latest": "regenerate-response",
};

// ── The click target a rich-document host builds ────────────────────────────

export interface RichDocumentTargetHost {
  kind: "rich-document";
  /** Render-time context: labels, visibility, toggle state. */
  ctx: RichDocumentActionContext;
  /** Click-time context factory: what handlers run against (live content). */
  getCtx: () => RichDocumentActionContext;
  /** This host's own actions (the `actions.extra` prop). */
  extra: readonly RichDocumentAction[];
}

function hostOf(target: ClickTarget): RichDocumentTargetHost | null {
  const host = target.host as RichDocumentTargetHost | undefined;
  return host && host.kind === "rich-document" ? host : null;
}

/** THE ClickTarget for a rich-document context. */
export function richDocumentClickTarget(
  ctx: RichDocumentActionContext,
  options: {
    getCtx?: () => RichDocumentActionContext;
    exclude?: readonly string[];
    extra?: readonly RichDocumentAction[];
  } = {},
): ClickTarget {
  const readOnly = Boolean(ctx.source.readOnly);
  const host: RichDocumentTargetHost = {
    kind: "rich-document",
    ctx,
    getCtx: options.getCtx ?? (() => ctx),
    extra: options.extra ?? [],
  };
  return createClickTarget({
    readOnly,
    writable: readOnly ? [] : [SOURCE_WRITE_TARGET],
    excludedActionIds: options.exclude ?? [],
    organizationId: ctx.organizationId,
    auth: { authenticated: ctx.isAuthenticated, admin: ctx.isAdmin, creator: ctx.isCreator },
    payloadKinds: ["markdown"],
    host,
  });
}

// ── RichDocumentAction → Action ─────────────────────────────────────────────

function eligibleFor(rd: RichDocumentAction, target: ClickTarget): Eligibility {
  const host = hostOf(target);
  if (!host) return { status: "absent" };
  const ctx = host.ctx;
  if (rd.supportedSources !== "*" && !rd.supportedSources.includes(ctx.source.type)) {
    return { status: "absent" };
  }
  if (rd.visible && !rd.visible(ctx)) return { status: "absent" };
  // R1: a row the person cannot use right now is absent, never greyed.
  const disabled = rd.disabled?.(ctx);
  if (disabled === true || (typeof disabled === "object" && disabled !== null)) {
    return { status: "absent" };
  }
  return { status: "available" };
}

const converted = new WeakMap<RichDocumentAction, Action>();

export function toAlchemyAction(rd: RichDocumentAction): Action {
  const cached = converted.get(rd);
  if (cached) return cached;
  const place = PLACEMENT.get(rd.id);
  const ctxOf = (t: ClickTarget) => hostOf(t)?.ctx;
  const action: Action = {
    id: rd.id,
    provider: RICH_DOCUMENT_PROVIDER_ID,
    label: (t) => {
      const ctx = ctxOf(t);
      return ctx ? resolveActionLabel(rd.label, ctx) : typeof rd.label === "string" ? rd.label : rd.id;
    },
    icon: registerAlchemyIcon(rd.icon),
    ...(rd.iconColor ? { iconTone: rd.iconColor } : {}),
    ...(rd.stateIcon
      ? {
          stateIcon: (t: ClickTarget) => {
            const ctx = ctxOf(t);
            const live = ctx ? rd.stateIcon?.(ctx) : null;
            return live ? { icon: registerAlchemyIcon(live.icon), ...(live.spin ? { spin: true } : {}) } : null;
          },
        }
      : {}),
    category: rd.category,
    order: place?.order ?? 10_000 + (rd.order ?? 0),
    placement: rd.renderSlot ?? "overflow",
    ...(place?.section ? { section: place.section } : {}),
    ...(rd.requiresAuth ? { requiresAuth: true } : {}),
    ...(rd.writesSource ? { writes: [RICH_DOCUMENT_SOURCE_TARGET] } : {}),
    ...(rd.preserveSelection ? { preserveSelection: true } : {}),
    ...(rd.active
      ? {
          pressed: (t: ClickTarget) => {
            const ctx = ctxOf(t);
            return ctx ? Boolean(rd.active?.(ctx)) : false;
          },
        }
      : {}),
    ...(rd.subscribe
      ? {
          subscribe: (onChange: () => void, t: ClickTarget) => {
            const ctx = ctxOf(t);
            return ctx && rd.subscribe ? rd.subscribe(onChange, ctx) : () => undefined;
          },
        }
      : {}),
    eligible: (t) => eligibleFor(rd, t),
    run: async (t) => {
      const host = hostOf(t);
      if (!host) return;
      // Handlers own their toasts, dialogs and receipts (as before).
      await rd.run(host.getCtx());
    },
  };
  converted.set(rd, action);
  return action;
}

function candidates(target: ClickTarget): RichDocumentAction[] {
  const host = hostOf(target);
  if (!host) return [];
  const all = [...ACTIONS.values(), ...host.extra.filter((a) => !ACTIONS.has(a.id))];
  const present = new Set(all.map((a) => a.id));
  return all.filter((a) => {
    const canonical = MENU_ALIASES[a.id];
    return !(canonical && present.has(canonical));
  });
}

/** The provider registered into the app's Alchemy action registry. */
export const richDocumentActionProvider: ActionProvider = {
  id: RICH_DOCUMENT_PROVIDER_ID,
  tier: "T0",
  declaredIds: () => [...ACTIONS.keys()],
  actions: (target) => candidates(target).map(toAlchemyAction),
};

/** Re-render hook for hosts: the list changed (a handler module loaded). */
export function subscribeRichDocumentActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The actions eligible for a context — synchronously, through the package's
 * ONE eligibility pass. Used where a host needs the list during render (the
 * remote-surface spec snapshot, the code-block bridge, the parity tests).
 * A host extra whose id collides with a built-in is refused (the built-in wins).
 */
export function resolveActions(
  ctx: RichDocumentActionContext,
  options?: {
    exclude?: (RichDocumentActionId | string)[];
    extra?: RichDocumentAction[];
  },
): RichDocumentAction[] {
  const target = richDocumentClickTarget(ctx, {
    exclude: options?.exclude ?? [],
    extra: options?.extra ?? [],
  });
  return candidates(target)
    .filter((rd) => computeEligibility(toAlchemyAction(rd), target, { authResumable: false }).status === "available")
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return (a.order ?? 0) - (b.order ?? 0);
    });
}
