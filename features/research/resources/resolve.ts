/**
 * RESOLUTION — bundle + manifest → the variables an agent actually receives.
 *
 * This is the only place in the system that fetches resource bodies, and the
 * only place that truncates. Both facts are deliberate:
 *
 *   * ONE fetch site means bodies are read for exactly what survived selection
 *     and the budget — never "load it all and slice later", which on a real
 *     topic would mean pulling 4.98M characters of page text to use 200k of it.
 *   * ONE truncation site means the ResolutionReport can be trusted. A silently
 *     trimmed context is the difference between "the agent read our research"
 *     and "the agent read the first third and nobody knew". Every dropped item
 *     is counted, and every reason is named.
 *
 * The budget is enforced twice, on purpose:
 *   1. PRE-FLIGHT, against the manifest's measured char counts, so we do not
 *      fetch bodies we are going to throw away.
 *   2. POST-RENDER, against the real assembled text, because rendering adds
 *      provenance headers (~200 chars per block) that the pre-flight cannot
 *      know. If that pushes us over, whole trailing blocks are dropped — never
 *      a half-cut block, which would hand the model a truncated sentence and no
 *      indication it was cut.
 */

import { estimateTokens, charsForTokenBudget } from "@/lib/tokens/estimate";
import { createResourceReference } from "@/features/agents/agent-context/resource-reference";
import {
  CATALOG,
  deriveAll,
  isDerived,
  kindDef,
  renderContextFor,
} from "./catalog";
import { applySelector, charsOf, effectiveChars } from "./selector";
import { BLOCK_SEPARATOR, type RenderContext } from "./render";
import type {
  ContextBundle,
  DropReason,
  KindResolution,
  ResourceBody,
  ResourceItem,
  ResourceKey,
  ResourceManifest,
  ResolvedBundle,
  ResolutionReport,
  SelectorLimit,
} from "./types";

/**
 * Drops the SELECTION asked for, versus drops the system imposed.
 *
 * A filter that excluded 9 pages, or a Top-10 cap that cut the 11th, did
 * exactly what the user configured — surfacing those as "your context was
 * trimmed" would fire on essentially every run and teach the user to dismiss
 * the warning that means something (a budget cut, an unloadable body). Both are
 * still counted per kind for the detail view; only involuntary ones are loud.
 */
const VOLUNTARY_DROPS = new Set<DropReason>([
  "filtered",
  "over_item_limit",
  "over_char_limit",
  "superseded",
]);

/** Fallback variable when a bundle declares no binding for a kind. */
function variableFor(bundle: ContextBundle, kind: ResourceKey): string {
  const binding = bundle.bindings.find((b) => b.kinds.includes(kind));
  if (binding) return binding.variable;
  return kindDef(kind)?.defaultVariable ?? "research_context";
}

/**
 * How a kind travels: `"context"` only when the binding asks for it AND the
 * kind is a real row the server can load (`resourceType`). A derived kind, or
 * one with no entity token, silently falls back to direct — the text still
 * reaches the agent, which beats honouring the letter of the binding by
 * sending nothing.
 */
export function deliveryFor(
  bundle: ContextBundle,
  kind: ResourceKey,
): "direct" | "context" {
  const binding = bundle.bindings.find((b) => b.kinds.includes(kind));
  if (binding?.delivery !== "context") return "direct";
  const def = kindDef(kind);
  if (!def || isDerived(def) || !def.resourceType) return "direct";
  return "context";
}

/**
 * Variables whose binding says "first kind that produces anything wins".
 * Returns variable → the kinds it covers, in the binding's declared order.
 */
function firstOnlyVariables(bundle: ContextBundle): Map<string, ResourceKey[]> {
  const out = new Map<string, ResourceKey[]>();
  for (const binding of bundle.bindings) {
    if (binding.strategy === "first") out.set(binding.variable, binding.kinds);
  }
  return out;
}

interface PlannedKind {
  kind: ResourceKey;
  variable: string;
  /** `"context"` kinds skip body fetch, rendering AND the token budget. */
  delivery: "direct" | "context";
  items: ResourceItem[];
  dropped: Partial<Record<DropReason, number>>;
  /** The selector's limits — carries `maxCharsPerItem` to the render step. */
  limit: SelectorLimit | undefined;
}

function addDrop(
  dropped: Partial<Record<DropReason, number>>,
  reason: DropReason,
  n: number,
): void {
  if (n <= 0) return;
  dropped[reason] = (dropped[reason] ?? 0) + n;
}

/**
 * Plan the resolution: which items, in what order, within the budget —
 * all from the manifest, with zero reads.
 *
 * Exported because the picker previews with the exact same planner the run
 * uses. A preview computed a different way is a preview that can lie.
 */
export function planResolution(
  manifest: ResourceManifest,
  bundle: ContextBundle,
): { planned: PlannedKind[]; budgetChars: number | null; overBudget: boolean } {
  const budgetTokens = bundle.budget?.maxTokens ?? null;
  const planned: PlannedKind[] = [];

  for (const selector of bundle.selectors) {
    const def = kindDef(selector.kind);
    if (!def) continue;
    const variable = variableFor(bundle, selector.kind);
    const delivery = deliveryFor(bundle, selector.kind);

    if (isDerived(def)) {
      // Derived kinds are a single computed block; selection does not apply.
      planned.push({
        kind: selector.kind,
        variable,
        delivery,
        items: [],
        dropped: {},
        limit: selector.limit,
      });
      continue;
    }

    const result = applySelector(manifest, selector);
    const dropped: Partial<Record<DropReason, number>> = {};
    addDrop(dropped, "filtered", result.dropped.filtered);
    addDrop(dropped, "over_item_limit", result.dropped.overItemLimit);
    addDrop(dropped, "over_char_limit", result.dropped.overCharLimit);
    planned.push({
      kind: selector.kind,
      variable,
      delivery,
      items: result.items,
      dropped,
      limit: selector.limit,
    });
  }

  if (budgetTokens === null) {
    return { planned, budgetChars: null, overBudget: false };
  }

  // Pre-flight budget walk, in bundle order: earlier selectors are the ones the
  // author considered most important, so they keep their items.
  const budgetChars = charsForTokenBudget(budgetTokens);
  let running = 0;
  let overBudget = false;
  for (const entry of planned) {
    // Context-delivered kinds inject a pointer, not text — they cost the
    // budget nothing and must never evict a direct kind's items.
    if (entry.delivery === "context") continue;
    if (entry.items.length === 0) continue;
    const kept: ResourceItem[] = [];
    for (const item of entry.items) {
      const cost = effectiveChars(item, entry.limit);
      if (running + cost > budgetChars && (kept.length > 0 || running > 0)) {
        overBudget = true;
        continue;
      }
      kept.push(item);
      running += cost;
    }
    addDrop(entry.dropped, "over_budget", entry.items.length - kept.length);
    entry.items = kept;
  }
  return { planned, budgetChars, overBudget };
}

/** Fetch bodies for every planned DB kind, one batched read per kind. */
async function fetchAll(
  planned: PlannedKind[],
): Promise<Map<ResourceKey, Map<string, ResourceBody>>> {
  const out = new Map<ResourceKey, Map<string, ResourceBody>>();
  await Promise.all(
    planned.map(async (entry) => {
      const def = kindDef(entry.kind);
      if (entry.delivery === "context") return;
      if (!def || !def.fetchBodies || entry.items.length === 0) return;
      const bodies = await def.fetchBodies(entry.items.map((i) => i.id));
      out.set(entry.kind, bodies);
    }),
  );
  return out;
}

export interface ResolveOptions {
  /** Extra variables merged in last (tone profile, user instructions…). */
  extraVariables?: Record<string, string>;
}

/**
 * Resolve a bundle against a manifest into agent-ready variables.
 *
 * The manifest is passed in rather than fetched here so a surface that already
 * loaded it (the Context Builder) resolves without a second round trip, and so
 * this function stays pure with respect to the inventory it reports on.
 */
export async function resolveBundle(
  manifest: ResourceManifest,
  bundle: ContextBundle,
  options: ResolveOptions = {},
): Promise<ResolvedBundle> {
  const ctx: RenderContext = renderContextFor(manifest);
  const derived = deriveAll(manifest, ctx);
  const { planned } = planResolution(manifest, bundle);
  const bodies = await fetchAll(planned);

  const perKind: KindResolution[] = [];
  const notes: string[] = [];
  const emptyKinds: ResourceKey[] = [];
  /** variable → blocks, in bundle order. */
  const blocksByVariable = new Map<string, string[]>();
  /** Per-turn `context` payload for `delivery: "context"` bindings. */
  const contextRefs: Record<string, unknown> = {};

  const budgetTokens = bundle.budget?.maxTokens ?? null;
  const budgetChars = budgetTokens !== null ? charsForTokenBudget(budgetTokens) : null;
  let assembledChars = 0;

  // `strategy: "first"` bindings: once one kind has filled the variable, later
  // kinds bound to it are skipped rather than appended.
  const firstOnly = firstOnlyVariables(bundle);
  const satisfied = new Set<string>();

  // A "first" binding must be evaluated in the BINDING's kind order, not the
  // selector order, so "document, else synthesis" cannot silently invert.
  const order = new Map<ResourceKey, number>();
  for (const kinds of firstOnly.values()) {
    kinds.forEach((k, i) => order.set(k, i));
  }
  const sequence = [...planned].sort((a, b) => {
    const oa = order.get(a.kind);
    const ob = order.get(b.kind);
    if (oa === undefined || ob === undefined) return 0;
    if (a.variable !== b.variable) return 0;
    return oa - ob;
  });

  for (const entry of sequence) {
    const def = kindDef(entry.kind);
    if (!def) continue;

    // Context delivery: one resource_ref per item, no bodies, no budget, no
    // "first" machinery — a pointer cannot "fill" a variable, so it neither
    // satisfies nor is superseded by one.
    if (entry.delivery === "context" && def.resourceType) {
      let n = 0;
      for (const item of entry.items) {
        n += 1;
        const key =
          entry.items.length === 1 ? entry.variable : `${entry.variable}_${n}`;
        contextRefs[key] = createResourceReference(def.resourceType, item.id);
      }
      if (entry.items.length === 0) emptyKinds.push(entry.kind);
      perKind.push({
        kind: entry.kind,
        variable: entry.variable,
        delivery: "context",
        selected: entry.items.length,
        included: entry.items.length,
        chars: 0,
        tokens: 0,
        trimmed: 0,
        dropped: entry.dropped,
      });
      if (entry.items.length > 0) {
        notes.push(
          `${def.label}: ${entry.items.length} item(s) attached as lazy context — the agent reads them only if it chooses to.`,
        );
      }
      continue;
    }

    if (firstOnly.has(entry.variable) && satisfied.has(entry.variable)) {
      addDrop(
        entry.dropped,
        "superseded",
        isDerived(def) ? 1 : entry.items.length,
      );
      perKind.push({
        kind: entry.kind,
        variable: entry.variable,
        selected: isDerived(def) ? 1 : entry.items.length,
        included: 0,
        chars: 0,
        tokens: 0,
        trimmed: 0,
        dropped: entry.dropped,
      });
      continue;
    }
    const blocks: string[] = [];
    let included = 0;
    let chars = 0;
    let trimmed = 0;

    if (isDerived(def)) {
      const text = derived.get(entry.kind) ?? "";
      if (text) {
        if (budgetChars !== null && assembledChars + text.length > budgetChars) {
          addDrop(entry.dropped, "over_budget", 1);
        } else {
          blocks.push(text);
          included = 1;
          chars = text.length;
          assembledChars += text.length;
        }
      } else {
        emptyKinds.push(entry.kind);
      }
    } else {
      const kindBodies = bodies.get(entry.kind);
      for (const item of entry.items) {
        const body = kindBodies?.get(item.id);
        // A kind with no fetchBodies renders straight from the manifest item
        // (media), so a missing body is only a problem when one was expected.
        if (def.fetchBodies && !body) {
          addDrop(entry.dropped, "body_missing", 1);
          continue;
        }
        const full = def.render
          ? def.render(item, body, ctx).trim()
          : (body?.text ?? "").trim();
        if (!full) {
          addDrop(entry.dropped, "empty_body", 1);
          continue;
        }
        // Per-item cap. A trimmed item SAYS it was trimmed, in the payload the
        // model reads — a silently shortened page is indistinguishable from a
        // page that simply ended, which is how a model comes to a confident
        // conclusion from half a document.
        const cap = entry.limit?.maxCharsPerItem;
        let text = full;
        if (cap !== undefined && cap > 0 && full.length > cap) {
          text = `${full.slice(0, cap)}\n\n[trimmed to ${cap.toLocaleString()} of ${full.length.toLocaleString()} characters by the per-item limit]`;
          trimmed += 1;
        }
        if (budgetChars !== null && assembledChars + text.length > budgetChars) {
          addDrop(entry.dropped, "over_budget", 1);
          continue;
        }
        blocks.push(text);
        included += 1;
        chars += text.length;
        assembledChars += text.length;
      }
      if (entry.items.length === 0) emptyKinds.push(entry.kind);
    }

    if (blocks.length > 0) {
      const existing = blocksByVariable.get(entry.variable) ?? [];
      existing.push(...blocks);
      blocksByVariable.set(entry.variable, existing);
      if (firstOnly.has(entry.variable)) satisfied.add(entry.variable);
    }

    perKind.push({
      kind: entry.kind,
      variable: entry.variable,
      selected: isDerived(def) ? (derived.get(entry.kind) ? 1 : 0) : entry.items.length,
      included,
      chars,
      tokens: estimateTokens(chars, def.shape),
      trimmed,
      dropped: entry.dropped,
    });
    if (trimmed > 0) {
      notes.push(
        `${def.label}: ${trimmed} item(s) shortened by the ${entry.limit?.maxCharsPerItem?.toLocaleString()}-character per-item limit`,
      );
    }

    for (const [reason, count] of Object.entries(entry.dropped)) {
      if (!count) continue;
      // Only INVOLUNTARY losses are surfaced. A filter or a Top-N cap doing its
      // job is the user's own instruction being honoured; reporting it as a loss
      // would cry wolf on every run and train the user to ignore the notice that
      // actually matters. The picker row already shows "10 of 19".
      if (VOLUNTARY_DROPS.has(reason as DropReason)) continue;
      notes.push(`${def.label}: ${count} ${dropLabel(reason as DropReason)}`);
    }
  }

  const variables: Record<string, string> = {};
  for (const [variable, blocks] of blocksByVariable) {
    variables[variable] = blocks.join(BLOCK_SEPARATOR);
  }
  for (const [name, value] of Object.entries(options.extraVariables ?? {})) {
    if (value.trim()) variables[name] = value;
  }

  const totalChars = Object.values(variables).reduce((s, v) => s + v.length, 0);
  // "Truncated" means the SYSTEM dropped something, not the selection's own
  // rules — see VOLUNTARY_DROPS.
  const truncated = perKind.some(
    (k) =>
      Object.entries(k.dropped).some(
        ([reason, n]) =>
          !VOLUNTARY_DROPS.has(reason as DropReason) && (n ?? 0) > 0,
      ) || k.trimmed > 0,
  );

  const totalTokens = perKind.reduce((s, k) => s + k.tokens, 0);
  // The planner never returns nothing: if a single item is bigger than the whole
  // budget it is kept, because "no context at all" is a worse answer than "one
  // oversized block". That case MUST surface — the caller decides whether to
  // send it, and the UI says so out loud.
  const exceedsBudget = budgetTokens !== null && totalTokens > budgetTokens;
  if (exceedsBudget) {
    notes.push(
      `Over budget: ${totalTokens.toLocaleString()} estimated tokens against a ${budgetTokens.toLocaleString()} ceiling — a single resource is larger than the whole budget.`,
    );
  }

  const report: ResolutionReport = {
    topicId: manifest.topicId,
    bundleName: bundle.name,
    totalChars,
    totalTokens,
    budgetTokens,
    truncated,
    exceedsBudget,
    perKind,
    notes,
    emptyKinds,
  };

  return { variables, contextRefs, report };
}

function dropLabel(reason: DropReason): string {
  switch (reason) {
    case "filtered":
      return "did not match the filter";
    case "over_item_limit":
      return "cut by the item limit";
    case "over_char_limit":
      return "cut by the size limit";
    case "over_budget":
      return "cut by the token budget";
    case "empty_body":
      return "had no content";
    case "body_missing":
      return "could not be loaded";
    case "superseded":
      return "not needed — an earlier resource already filled that variable";
    default:
      return "dropped";
  }
}

/**
 * Preview totals for a selection, with no reads — what the budget meter shows.
 * Uses the same planner as `resolveBundle`, so the meter and the run agree.
 */
export interface PreviewKind {
  kind: ResourceKey;
  items: number;
  chars: number;
  tokens: number;
  /** `"context"` = attached as lazy refs; costs ~0 injected tokens. */
  delivery: "direct" | "context";
  /**
   * Items the BUDGET will drop, known before anything runs.
   *
   * This is the whole point of previewing: a budget that silently eats half a
   * selection and only admits it afterwards is worse than no budget. The
   * planner already computes the drops, so the meter can name them up front.
   */
  droppedByBudget: number;
}

export interface BundlePreview {
  chars: number;
  tokens: number;
  perKind: PreviewKind[];
  /** Total items the budget will drop across every kind. */
  droppedByBudget: number;
}

export function previewBundle(
  manifest: ResourceManifest,
  bundle: ContextBundle,
): BundlePreview {
  const ctx = renderContextFor(manifest);
  deriveAll(manifest, ctx);
  const { planned } = planResolution(manifest, bundle);
  const perKind: PreviewKind[] = planned.map((entry) => {
    const def = kindDef(entry.kind);
    const derivedKind = def !== undefined && isDerived(def);
    const chars = derivedKind
      ? (manifest.rollups.get(entry.kind)?.chars ?? 0)
      : charsOf(entry.items, entry.limit);
    // Context-delivered kinds show their true size but cost ~0 injected
    // tokens — a pointer goes in the request, not the text.
    const asContext = entry.delivery === "context";
    return {
      kind: entry.kind,
      items: derivedKind ? (chars > 0 ? 1 : 0) : entry.items.length,
      chars,
      tokens: asContext ? 0 : estimateTokens(chars, def?.shape ?? "prose"),
      delivery: entry.delivery,
      droppedByBudget: entry.dropped.over_budget ?? 0,
    };
  });
  return {
    chars: perKind.reduce((s, k) => s + k.chars, 0),
    tokens: perKind.reduce((s, k) => s + k.tokens, 0),
    perKind,
    droppedByBudget: perKind.reduce((s, k) => s + k.droppedByBudget, 0),
  };
}

/** Every kind the catalog knows, for UI iteration. */
export const ALL_KINDS: ResourceKey[] = CATALOG.map((d) => d.key);
