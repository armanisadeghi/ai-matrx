// route-header-layout — the pure pieces behind RouteHeader's narrow-width behaviour.
//
// Two platform guarantees every RouteHeader consumer inherits without touching its own markup:
//
//   1. ACTIONS FOLD, THEY NEVER EAT THE TITLE. `right` is flattened into its individual
//      actions (fragments are expanded; a single wrapper component stays one action). When
//      they do not all fit beside a title of `TITLE_MIN_PX`, the lowest-priority actions —
//      the leftmost, since a row's primary action sits at its trailing edge — fold into ONE
//      "…" overflow. `foldCount` is the decision.
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

/** The title never gets less than this (or its natural width, when that is smaller). */
export const TITLE_MIN_PX = 96;
/** Fallback width of an action we have never measured, and of the "…" trigger. */
export const DEFAULT_ACTION_PX = 36;

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

/**
 * How many leading actions must fold into the overflow so the rest (plus the "…"
 * trigger, when anything folds) fit in `available` px.
 */
export function foldCount(
  widths: readonly number[],
  available: number,
  overflowWidth: number = DEFAULT_ACTION_PX,
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
