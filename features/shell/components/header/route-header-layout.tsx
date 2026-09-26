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
  /**
   * Never drawn at any width — a `hidden` file input a button opens, say. It stays
   * mounted beside the actions but is not one: it never folds, is never measured and
   * never becomes an empty box in the "…" strip (`/rag/library`, VERIFIER-25).
   */
  inert?: boolean;
}

/**
 * A component that stands for SEVERAL actions declares them (lane V25-UI-FIXES).
 * `HeaderActions` draws its actions inline on `lg+` inside a wrapper that is
 * `hidden` below `lg`; handed to RouteHeader whole, it folded as ONE action whose
 * button sat inside that hidden wrapper, so the "…" strip showed an empty box with
 * no name (`/education/flashcards` at 320px, VERIFIER-25). A component carrying this
 * static is expanded into the actions it returns — each one its own foldable item,
 * named by the label it DECLARES, never by what its DOM happens to show.
 */
export interface DeclaresRouteHeaderActions<P = never> {
  routeHeaderActions?: (props: P) => ReactNode;
}

function declaredActions(child: ReactElement): ReactNode | undefined {
  const type = child.type as unknown;
  if (typeof type !== "function" && (typeof type !== "object" || type === null)) return undefined;
  const expand = (type as DeclaresRouteHeaderActions<unknown>).routeHeaderActions;
  return typeof expand === "function" ? expand(child.props) : undefined;
}

const RESPONSIVE_DISPLAY = /^(sm|md|lg|xl|2xl|max-\w+|min-\[[^\]]+\]|@\w+):(flex|inline-flex|block|inline-block|inline|grid|inline-grid|contents|table)$/;

/**
 * A host element that is never drawn at any width: `type="hidden"`, the `hidden`
 * attribute, or a `hidden` class with no responsive display class beside it
 * (`hidden lg:flex` IS drawn, on large screens).
 */
export function isNeverDrawn(node: ReactNode): boolean {
  if (!isValidElement(node) || typeof node.type !== "string") return false;
  const props = node.props as { type?: unknown; hidden?: unknown; className?: unknown };
  if (props.type === "hidden" || props.hidden === true) return true;
  if (typeof props.className !== "string") return false;
  const classes = props.className.split(/\s+/);
  return classes.includes("hidden") && !classes.some((c) => RESPONSIVE_DISPLAY.test(c));
}

/**
 * Expand fragments (at any depth), and components that declare their actions, so each
 * real action is its own foldable item. A never-drawn node is kept, marked `inert`.
 */
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
    if (isValidElement(child)) {
      const declared = declaredActions(child);
      if (declared !== undefined) {
        out.push(...flattenActions(declared, key));
        return;
      }
    }
    out.push({
      key,
      node: isValidElement(child) ? cloneElement(child, { key }) : child,
      ...(isNeverDrawn(child) ? { inert: true } : {}),
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

interface OverflowLabelProps {
  ariaLabel?: unknown;
  tooltip?: unknown;
  label?: unknown;
}

/**
 * An action's name for the overflow strip: its `ariaLabel`, else its `tooltip`
 * (when it is a string — `tooltip={false}` opts out and is not a name), else its
 * `label`. Two icon-only actions inside the same menu — e.g. a list's copy button
 * and the page's Alchemy button — read identically at a glance (2026-09-25); this
 * is what lets `OverflowMenuItem` print the name every item already carries.
 */
export function overflowItemLabel(node: ReactNode): string | null {
  if (!isValidElement(node)) return null;
  const props = node.props as OverflowLabelProps & { "aria-label"?: unknown; title?: unknown };
  // The DECLARED name, in the order a control declares it — never read off the DOM.
  for (const name of [props.ariaLabel, props["aria-label"], props.tooltip, props.label, props.title]) {
    if (typeof name === "string" && name.trim() !== "") return name;
  }
  return null;
}

/**
 * ONE overflow-strip item, for every RouteHeader consumer: the action, plus its
 * name printed as text whenever `overflowItemLabel` finds one. A control is
 * absent or honest — inside a menu, an icon alone is neither: two copy-shaped
 * icons (a list's copy button, the page's Alchemy button) read identically at a
 * glance (2026-09-25). The label is never invented; an action with none renders
 * icon-only exactly as before.
 */
export function OverflowMenuItem({ action }: { action: FlatAction }) {
  const label = overflowItemLabel(action.node);
  return (
    <div
      data-route-header-overflow-item
      className="flex shrink-0 items-center gap-1.5 px-1"
    >
      {action.node}
      {label ? (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {label}
        </span>
      ) : null}
    </div>
  );
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
