// route-header-layout — the pure pieces behind RouteHeader's narrow-width behaviour.
//
// Two platform guarantees every RouteHeader consumer inherits without touching its own markup:
//
//   1. ACTIONS FOLD, THEY NEVER EAT THE TITLE. `right` is flattened into its individual
//      actions (fragments are expanded; a single wrapper component stays one action). When
//      they do not all fit beside a title of `TITLE_MIN_PX`, the lowest-priority actions —
//      the leftmost, since a row's primary action sits at its trailing edge — fold into ONE
//      "…" overflow. The primary (trailing) action never folds when it can go icon-only:
//      a labelled tap button (`label` + `icon`) drops its caption and keeps its icon, its
//      accessible name and a tooltip — the Linear / Notion / Apple phone header, where the
//      page's one primary action stays one tap away. `fitActions` is the decision.
//
//   2. A CLIPPED TITLE ALWAYS ENDS WITH AN ELLIPSIS. `text-overflow: ellipsis` cannot reach
//      loose text that sits directly inside a flex or grid container (the text becomes an
//      anonymous flex item), which is how `<span className="flex …"><Icon />Organizations</span>`
//      rendered "Organiz" with no ellipsis at 375px (2026-09-25). `ellipsizeLooseText` walks
//      the `left` tree's host elements and wraps each run of loose text in a truncating span.

import {
  Children,
  cloneElement,
  Fragment,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

/** Secondary actions fold before the title's text gets less than this. */
export const TITLE_MIN_PX = 96;
/**
 * The primary (last) action folds only when keeping it would leave the title's text
 * less than this — "Workbo…" beside a visible New beats "Workbooks" beside a "…"
 * that hides the page's one primary action.
 */
export const TITLE_FLOOR_PX = 56;
/** Fallback width of an action we have never measured, and of the "…" trigger. */
export const DEFAULT_ACTION_PX = 36;
/** Fallback width of an icon-only primary action we have never measured (a 44pt tap target). */
export const COMPACT_ACTION_PX = 44;

export interface FlatAction {
  key: string;
  node: ReactNode;
}

/** Expand fragments (at any depth) so each real action is its own foldable item. */
export function flattenActions(node: ReactNode, prefix = ""): FlatAction[] {
  const out: FlatAction[] = [];
  Children.toArray(node).forEach((child, index) => {
    const ownKey =
      isValidElement(child) && child.key != null ? String(child.key) : String(index);
    const key = prefix ? `${prefix}/${ownKey}` : ownKey;
    if (isValidElement(child) && child.type === Fragment) {
      const props = child.props as { children?: ReactNode };
      out.push(...flattenActions(props.children, key));
      return;
    }
    out.push({
      key,
      node: isValidElement(child) ? cloneElement(child, { key }) : child,
    });
  });
  return out;
}

export interface ActionFit {
  /** How many leading (lowest-priority) actions fold into the "…" overflow. */
  fold: number;
  /** Whether the primary (last) action renders icon-only instead of folding. */
  compactPrimary: boolean;
}

/**
 * Decide how the actions fit in `available` px. Secondary actions fold first; then the
 * primary goes icon-only when it can (`compactPrimaryWidth` given), and only a primary
 * that cannot go icon-only ever folds — and then only when keeping it would push the
 * title below its floor (`primaryAvailable`).
 */
export function fitActions(
  widths: readonly number[],
  available: number,
  overflowWidth: number = DEFAULT_ACTION_PX,
  /** Room when the title yields down to TITLE_FLOOR_PX to keep the primary action. */
  primaryAvailable: number = available,
  /** Width of the primary rendered icon-only; omit when the primary cannot go icon-only. */
  compactPrimaryWidth?: number,
): ActionFit {
  const n = widths.length;
  const fold = foldSecondary(widths, available, overflowWidth);
  if (fold < n || n === 0) return { fold, compactPrimary: false };
  if (compactPrimaryWidth !== undefined) return { fold: n - 1, compactPrimary: true };
  const primary = widths[n - 1] + (n > 1 ? overflowWidth : 0);
  return {
    fold: primary <= primaryAvailable ? n - 1 : n,
    compactPrimary: false,
  };
}

/** `fitActions` for a primary that cannot go icon-only — how many actions fold. */
export function foldCount(
  widths: readonly number[],
  available: number,
  overflowWidth: number = DEFAULT_ACTION_PX,
  primaryAvailable: number = available,
): number {
  return fitActions(widths, available, overflowWidth, primaryAvailable).fold;
}

interface LabelledActionProps {
  label?: unknown;
  icon?: unknown;
  ariaLabel?: unknown;
  tooltip?: unknown;
}

/**
 * The caption of an action that can go icon-only: a labelled tap button (a `label`
 * string beside an `icon`). Anything else returns null and keeps its natural shape.
 */
export function iconOnlyLabel(node: ReactNode): string | null {
  if (!isValidElement(node)) return null;
  const { label, icon } = node.props as LabelledActionProps;
  if (typeof label !== "string" || label.trim() === "" || icon == null) return null;
  return label;
}

/**
 * The same action without its caption. The caption survives as the accessible name
 * and the tooltip, so an icon-only primary is never an unlabeled icon.
 */
export function toIconOnly(node: ReactNode): ReactNode {
  const label = iconOnlyLabel(node);
  if (label == null || !isValidElement(node)) return node;
  const props = node.props as LabelledActionProps;
  return cloneElement(node as ReactElement<LabelledActionProps>, {
    label: undefined,
    ariaLabel: typeof props.ariaLabel === "string" ? props.ariaLabel : label,
    tooltip: typeof props.tooltip === "string" ? props.tooltip : label,
  });
}

function foldSecondary(
  widths: readonly number[],
  available: number,
  overflowWidth: number,
): number {
  const n = widths.length;
  let rest = widths.reduce((sum, w) => sum + w, 0);
  if (rest <= available) return 0;
  for (let fold = 1; fold <= n; fold++) {
    rest -= widths[fold - 1];
    if (rest + overflowWidth <= available) return fold;
  }
  return n;
}

const FLEX_OR_GRID = /(^|\s)(inline-)?(flex|grid)(\s|$)/;
const LOOSE_TEXT_CLASS = "min-w-0 truncate";

function isLooseText(node: ReactNode): node is string | number {
  return typeof node === "string" || typeof node === "number";
}

/**
 * Wrap every run of loose text that sits directly inside a flex/grid host element in a
 * truncating span, so the browser can ellipsize it. Only host elements (`"span"`, `"div"`,
 * …) are walked — a component's internals are its own business.
 */
export function ellipsizeLooseText(node: ReactNode): ReactNode {
  if (!isValidElement(node)) return node;
  if (node.type === Fragment) {
    const props = node.props as { children?: ReactNode };
    return cloneElement(node as ReactElement<{ children?: ReactNode }>, {
      children: Children.map(props.children, ellipsizeLooseText),
    });
  }
  if (typeof node.type !== "string") return node;

  const props = node.props as { className?: string; children?: ReactNode };
  if (props.children == null) return node;
  const isFlexOrGrid =
    typeof props.className === "string" && FLEX_OR_GRID.test(props.className);

  const kids = Children.toArray(props.children);
  const hasLooseText = kids.some(
    (k) => isLooseText(k) && String(k).trim() !== "",
  );
  if (!isFlexOrGrid || !hasLooseText) {
    const walked = kids.map((k) => ellipsizeLooseText(k));
    return cloneElement(node as ReactElement<{ children?: ReactNode }>, {
      children: walked,
    });
  }

  // Group consecutive text children into ONE span: splitting "3 schedule" + "s" into two
  // flex items would trim the whitespace at their edges.
  const grouped: ReactNode[] = [];
  let run: (string | number)[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const text = run.join("");
    grouped.push(
      text.trim() === "" ? (
        text
      ) : (
        <span
          key={`route-header-text-${grouped.length}`}
          data-route-header-text
          className={LOOSE_TEXT_CLASS}
        >
          {text}
        </span>
      ),
    );
    run = [];
  };
  for (const k of kids) {
    if (isLooseText(k)) {
      run.push(k);
    } else {
      flush();
      grouped.push(ellipsizeLooseText(k));
    }
  }
  flush();

  const className = /(^|\s)min-w-0(\s|$)/.test(props.className ?? "")
    ? props.className
    : `${props.className} min-w-0`;
  return cloneElement(
    node as ReactElement<{ className?: string; children?: ReactNode }>,
    { className, children: grouped },
  );
}
