// RouteHeader — the canonical three-part route header.
//
// Pass three nodes; it handles everything else:
//   - Injects into the shell header center slot via <PageHeader> (transparent,
//     no border/background — children bring their own glass).
//   - LEFT | CENTER | RIGHT are three IN-FLOW grid cells, so the center can
//     never paint over the title or the actions — not before the first
//     measurement, not in a hidden tab whose ResizeObservers are frozen.
//     (2026-09-27: the center used to be `absolute left-1/2`; a stale
//     measurement drew /agent-apps/<id>'s "Switch view" over "Fact Checker
//     Published" at 768px.) Inside its clipping cell the center is inset to the
//     symmetric slot (`total - 2 * max(left, right)`), so it still sits on the
//     header's true center and never shifts when left/right widths change.
//   - When not even the collapsed nav fits that symmetric slot, RouteModeNav
//     drops the inset (`data-route-nav-inflow`) and sits in the whole cell
//     beside the title, instead of vanishing. The title yields down to its
//     floor to make room for the nav's smallest trigger (`data-route-nav-min`).
//
//   <RouteHeader
//     left={<><BackButton /><span>{title}</span></>}
//     center={<ModeNav ... />}
//     right={<CopyButton ... />}
//   />
//
// Pairs with the `paddingTop: var(--shell-header-h)` content pattern on the
// page so the body flows seamlessly under the transparent header.
//
// Rules (enforced by convention — see the route-header skill):
//   - ONE canonical control per choice. Don't add a second control (e.g. a
//     dropdown in `left`) that duplicates a selection already owned by `center`.
//   - Header regions must NOT resize with their content. Use static labels or
//     fixed/min-w slots — never a content-sized control that shifts the layout.
//   - Tap buttons self-space (44pt touch target). Don't add gap/padding around
//     them inside a region; space only non-tap items with margins.
//
// Narrow widths (platform behaviour, inherited by every consumer — 2026-09-25):
//   - RIGHT folds. Pass actions as siblings (fragments are fine); when they do not all
//     fit beside a title of TITLE_MIN_PX, the leftmost fold into ONE "…" overflow that
//     opens them as a glass strip. Order your actions lowest-priority first, primary
//     last. A single wrapper component is one action and cannot fold — pass siblings,
//     or give the component a `routeHeaderActions` static that returns them (HeaderActions
//     does): each is then its own action, named by the label it declares. A node that is
//     never drawn (a `hidden` file input) stays mounted but is never an action.
//   - The PRIMARY (last) action stays visible — on a phone too: below 768px the other
//     actions move into the shell's ⋮ sheet, the primary stays in the row (icon-only
//     when it is a labelled tap button). On a phone a MENU is never the primary (it
//     would be a second overflow beside the ⋮): it goes to the sheet, and the primary
//     is the last non-menu action. Menus are known by identity (`isMenuAction`); a
//     page's own menu component declares `routeHeaderMenu = true`. Secondary actions fold first; then a
//     labelled tap button (`label` + `icon`) goes icon-only — caption kept as its
//     accessible name and tooltip — instead of folding into "…".
//   - LEFT always ellipsizes. Loose text inside a flex/grid host element is wrapped in a
//     truncating span (see route-header-layout.tsx), so a clipped title ends in "…".

"use client";

import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  setPhonePageActionCount,
  usePhonePageActions,
} from "./phone-page-actions";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import { MoreHorizontalTapButton } from "@ai-matrx/tap-target/buttons";
import PageHeader from "./PageHeader";
import {
  COMPACT_ACTION_PX,
  DEFAULT_ACTION_PX,
  TITLE_FLOOR_PX,
  TITLE_MIN_PX,
  ellipsizeLooseText,
  fitActions,
  flattenActions,
  iconOnlyLabel,
  isDestructiveAction,
  isMenuAction,
  OverflowMenuItem,
  overflowItemLabel,
  RESPONSIVE_DISPLAY,
  toIconOnly,
} from "./route-header-layout";

interface RouteHeaderProps {
  /** Back affordance + title/identity. Kept layout-stable (no content-sized controls). */
  left?: React.ReactNode;
  /** The canonical navigation/selection for this route's sub-views. Stays centered. */
  center?: React.ReactNode;
  /** Contextual actions, lowest priority first. Pass siblings — they fold into "…" when the row is narrow. */
  right?: React.ReactNode;
  /** Yield to any page-specific header mounted deeper in the route tree. */
  fallback?: boolean;
}

const noopSubscribe = () => () => {};

/** Breathing room an in-flow center keeps from the title and the actions. */
export const CENTER_INFLOW_GUTTER = 16;

export function centerSlotWidth(
  total: number,
  leftWidth: number,
  rightWidth: number,
): number {
  if (total <= 0) return 0;
  // Center is pinned at 50%; the nav may extend equally left/right from there.
  return Math.max(0, total - 2 * Math.max(leftWidth, rightWidth));
}

/** The left region's natural (unclipped) width, read without a paint. */
function naturalWidth(el: HTMLElement): number {
  // `maxWidth` too: the global `* { max-width: 100% }` would cap the probe at
  // the (grid-track) box it is trying to see past.
  const { width, flexShrink, maxWidth } = el.style;
  el.style.width = "max-content";
  el.style.flexShrink = "0";
  el.style.maxWidth = "none";
  const w = el.offsetWidth;
  el.style.width = width;
  el.style.flexShrink = flexShrink;
  el.style.maxWidth = maxWidth;
  return w;
}

/** Width of the left region's icon-only controls (back chevron etc.) — not title. */
function iconControlsWidth(el: HTMLElement): number {
  let total = 0;
  el.querySelectorAll<HTMLElement>("button, a, [role='button']").forEach((c) => {
    if (c.parentElement?.closest("button, a, [role='button']")) return;
    if (!c.textContent?.trim()) total += c.offsetWidth;
  });
  return total;
}

/**
 * Whether `el` (or an ancestor, up to `boundary` inclusive) is hidden at the
 * narrow width the phone sheet renders at: Tailwind's `hidden <bp>:<display>`
 * pair (e.g. `hidden sm:inline`) draws only at `<bp>` and wider — invisible on
 * every phone width — while its text still sits in `textContent` regardless
 * (2026-09-27 follow-up: ConversationRecordsChip's "Records" caption).
 */
function isHiddenAtPhoneWidth(el: HTMLElement | null, boundary: HTMLElement): boolean {
  let node = el;
  while (node) {
    const classes = typeof node.className === "string" ? node.className.split(/\s+/).filter(Boolean) : [];
    if (classes.includes("hidden") && classes.some((c) => RESPONSIVE_DISPLAY.test(c))) return true;
    if (node === boundary) break;
    node = node.parentElement;
  }
  return false;
}

/** Whether `root` renders any real word text a phone actually draws. */
function hasVisibleWords(root: HTMLElement | null): boolean {
  if (!root) return false;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? "";
    if (!/[\p{L}\p{N}]{2,}/u.test(text)) continue;
    if (!isHiddenAtPhoneWidth(n.parentElement, root)) return true;
  }
  return false;
}

/**
 * One action in the phone sheet's "This page" section: the control plus its
 * name. The declared name first (`overflowItemLabel`); a control that declares
 * none (a record's own "…" menu) is named by the accessible name it renders —
 * in a list a bare icon is neither absent nor honest.
 */
export function PhoneSheetAction({ action }: { action: ReturnType<typeof flattenActions>[number] }) {
  const declared = overflowItemLabel(action.node);
  const ref = useRef<HTMLDivElement>(null);
  const [rendered, setRendered] = useState<string | null>(null);
  useLayoutEffect(() => {
    if (declared) return;
    const control = ref.current?.querySelector<HTMLElement>("[aria-label], [title]");
    const name = control?.getAttribute("aria-label") ?? control?.getAttribute("title") ?? null;
    // Visible words already name it; a glyph ("…", "+") does not — but a
    // caption `hidden` at this width (a desktop-only `sm:inline` label) is
    // neither: it never draws here, so it never already named the row.
    const words = hasVisibleWords(ref.current);
    setRendered(words ? null : name);
  }, [declared]);
  const label = declared ?? rendered;
  return (
    <div ref={ref} data-route-header-overflow-item className="flex shrink-0 items-center gap-1.5 px-1">
      {action.node}
      {label ? <span data-phone-sheet-label className="whitespace-nowrap text-xs text-muted-foreground">{label}</span> : null}
    </div>
  );
}

/**
 * A `fallback` header is hidden (CSS) while a page-specific header is mounted;
 * its actions must then stay out of the phone sheet too, or the ⋮ would list
 * the section's actions beside the page's.
 */
function useYieldedFallback(fallback: boolean): boolean {
  const [yielded, setYielded] = useState(false);
  useEffect(() => {
    if (!fallback) return;
    const center = document.getElementById("shell-header-center");
    if (!center) return;
    const read = () =>
      setYielded(center.querySelector(':scope > [data-page-header-portal="page"]') != null);
    read();
    const observer = new MutationObserver(read);
    observer.observe(center, { childList: true });
    return () => observer.disconnect();
  }, [fallback]);
  return fallback && yielded;
}

export default function RouteHeader({
  left,
  center,
  right,
  fallback = false,
}: RouteHeaderProps) {
  // State, not a ref: the row mounts through a portal whose target is found in an
  // effect, so on RouteHeader's own first layout pass there is no row yet. A ref
  // left the measuring effect bailed out forever on pages whose actions never
  // change (nothing folded, the center never bounded).
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);
  const overflowRef = useRef<HTMLSpanElement>(null);
  const widthsRef = useRef(new Map<string, number>());
  // The center cell's inset that puts its content box on the header's true
  // center, and the cap on the title that keeps room for the nav's smallest
  // trigger. Unmeasured (null) is safe: the cells are in flow, so a stale or
  // missing measurement can only leave the nav off-center, never on top.
  const [centerPad, setCenterPad] = useState<{ left: number; right: number } | null>(null);
  const [leftMax, setLeftMax] = useState<number | null>(null);
  const [folded, setFolded] = useState(0);
  const [compactPrimary, setCompactPrimary] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);

  const flat = flattenActions(right);
  // A never-drawn node (a hidden file input a button opens) stays mounted but is not an action.
  const actions = flat.filter((a) => !a.inert);
  const inert = flat.filter((a) => a.inert);
  const leftNode = ellipsizeLooseText(left);
  const actionKeys = actions.map((a) => a.key).join("|");
  const fold = Math.min(folded, actions.length);
  const primary = actions.length > 0 ? actions[actions.length - 1] : null;
  const primaryCanCompact = primary != null && iconOnlyLabel(primary.node) != null;
  const compact = compactPrimary && primaryCanCompact;
  const isPhone = useIsMobile();
  const { host: phoneHost } = usePhonePageActions();
  const yielded = useYieldedFallback(fallback);
  // The section nav folds too (page-pass shared defects, 2026-09-27): on a
  // phone the title gets the row and the nav is the first thing in the ⋮ sheet.
  const centerToSheet = isPhone && !yielded && phoneHost != null && center != null;
  const hasCenter = Boolean(center) && !centerToSheet;

  // Latest render's inputs for the (stable) observer callback.
  const liveRef = useRef({ actions, fold, compact });
  useLayoutEffect(() => {
    liveRef.current = { actions, fold, compact };
  });

  useLayoutEffect(() => {
    if (!root) return;

    const measure = () => {
      const leftEl = leftRef.current;
      const rightEl = rightRef.current;
      const {
        actions: current,
        fold: currentFold,
        compact: currentCompact,
      } = liveRef.current;

      // Record every action currently in the row; folded ones keep their last width.
      // An icon-only primary records under its own key so its labelled width survives.
      rightEl
        ?.querySelectorAll<HTMLElement>("[data-route-header-action]")
        .forEach((el) => {
          const key = el.dataset.routeHeaderAction;
          if (!key) return;
          const slot =
            el.dataset.routeHeaderCompact != null ? `${key}#icon-only` : key;
          // A breakpoint twin (server HTML only) is not the row's real action.
          if (el.dataset.routeHeaderTwin != null) return;
          widthsRef.current.set(slot, el.offsetWidth);
        });

      // The title keeps TITLE_MIN_PX of TEXT beside any back chevron, or its
      // whole natural width when that is smaller.
      const natural = leftEl ? naturalWidth(leftEl) : 0;
      const chrome = leftEl ? iconControlsWidth(leftEl) : 0;
      const reserve = Math.min(natural, chrome + TITLE_MIN_PX);
      const floor = Math.min(natural, chrome + TITLE_FLOOR_PX);
      const overflowWidth = overflowRef.current?.offsetWidth || DEFAULT_ACTION_PX;
      const widths = current.map(
        (a) => widthsRef.current.get(a.key) ?? DEFAULT_ACTION_PX,
      );
      const last = current[current.length - 1];
      const compactWidth =
        last && iconOnlyLabel(last.node) != null
          ? (widthsRef.current.get(`${last.key}#icon-only`) ?? COMPACT_ACTION_PX)
          : undefined;
      const next = fitActions(
        widths,
        root.clientWidth - reserve,
        overflowWidth,
        root.clientWidth - floor,
        compactWidth,
      );
      if (next.fold !== currentFold) setFolded(next.fold);
      if (next.compactPrimary !== currentCompact)
        setCompactPrimary(next.compactPrimary);

      if (!hasCenter || root.clientWidth <= 0) return;
      const leftWidth = leftEl?.offsetWidth ?? 0;
      const rightWidth = rightEl?.offsetWidth ?? 0;
      const pad = { left: Math.max(0, rightWidth - leftWidth), right: Math.max(0, leftWidth - rightWidth) };
      setCenterPad((prev) => (prev?.left === pad.left && prev.right === pad.right ? prev : pad));
      // Room for the nav's smallest trigger comes out of the title, down to its floor.
      const navMin = root.querySelector<HTMLElement>("[data-route-nav-min]")?.scrollWidth ?? 0;
      setLeftMax(
        navMin > 0
          ? Math.max(floor, root.clientWidth - rightWidth - navMin - CENTER_INFLOW_GUTTER)
          : null,
      );
    };

    measure();
    // PageHeader mounts through a portal. Its first layout pass can happen
    // before the injection slot has its final width, so measure once more on
    // the next frame instead of leaving the center unmeasured.
    const frame = requestAnimationFrame(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    if (root.parentElement) ro.observe(root.parentElement);
    if (leftRef.current) ro.observe(leftRef.current);
    if (rightRef.current) ro.observe(rightRef.current);
    // A nav can mount after this effect (a center that waits for data): watch
    // the center's content so its smallest trigger still gets its room.
    let navMinEl: HTMLElement | null = null;
    const watchNav = () => {
      const next = root.querySelector<HTMLElement>("[data-route-nav-min]");
      if (next === navMinEl) return;
      if (navMinEl) ro.unobserve(navMinEl);
      navMinEl = next;
      if (navMinEl) {
        ro.observe(navMinEl);
        measure();
      }
    };
    watchNav();
    const centerEl = root.querySelector<HTMLElement>("[data-route-header-center]");
    const mo = new MutationObserver(watchNav);
    if (centerEl) mo.observe(centerEl, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      mo.disconnect();
    };
    // Re-measure when the row mounts and whenever the set of actions, the
    // fold point, or the presence of a center changes.
  }, [root, actionKeys, fold, compact, hasCenter]);

  // 🚨 ON A PHONE THE SECONDARY ACTIONS LIVE IN THE SHELL'S ⋮ (page-pass
  // shared defects, 2026-09-27): one overflow button per phone header, and the
  // title gets most of the row. They are PORTALED into the ⋮ sheet's host node,
  // so each stays mounted in this page's tree. See `phone-page-actions.ts`.
  // 🚨 THE PRIMARY (last) ACTION NEVER LEAVES THE ROW (2026-09-27): a page's
  // main action is never reachable only through a menu — "Submit all" on
  // /agents/battle, "New meeting" on /meetings. It stays, icon-only when it is
  // a labelled tap button (caption kept as its accessible name + tooltip).
  // 🚨 A MENU IS NEVER THE PRIMARY (2026-09-27): a page's own "…" / record
  // menu kept in the row sat beside the shell's ⋮ — two overflow buttons. It
  // goes to the sheet; the primary is the last action that is NOT a menu.
  const toSheet = isPhone && !yielded && phoneHost != null && actions.length > 0;
  // The action a phone keeps in the row — known without knowing it IS a
  // phone, so the server HTML can mark it (`data-route-header-phone-primary`)
  // and the pre-hydration header draws the phone row exactly.
  const phonePrimaryCandidate =
    [...actions].reverse().find((a) => !isMenuAction(a.node) && !isDestructiveAction(a.node)) ?? null;
  const phonePrimary = toSheet
    ? phonePrimaryCandidate
    : null;
  // A destructive action goes LAST in the sheet, after a divider.
  const sheetActions = toSheet
    ? [
        ...actions.filter((a) => a !== phonePrimary && !isDestructiveAction(a.node)),
        ...actions.filter((a) => a !== phonePrimary && isDestructiveAction(a.node)),
      ]
    : [];
  const owner = useId();
  useEffect(() => {
    setPhonePageActionCount(owner, sheetActions.length + (centerToSheet ? 1 : 0));
    return () => setPhonePageActionCount(owner, 0);
  }, [owner, sheetActions.length, centerToSheet]);

  const overflowActions = toSheet ? [] : actions.slice(0, fold);
  const rowActions = toSheet ? (phonePrimary ? [phonePrimary] : []) : actions.slice(fold);
  const rowPrimary = toSheet ? phonePrimary : primary;
  const serverOrHydrating = useSyncExternalStore(
    noopSubscribe,
    () => false,
    () => true,
  );
  // On a phone the kept primary is compact up front — the title keeps the row.
  const compactRow = toSheet
    ? phonePrimary != null && iconOnlyLabel(phonePrimary.node) != null
    : compact;

  return (
    <PageHeader fallback={fallback}>
      <div
        ref={setRoot}
        data-route-header-root
        className={
          hasCenter
            ? "relative grid w-full min-w-0 items-center"
            : "relative flex w-full min-w-0 items-center justify-between"
        }
        style={
          hasCenter
            ? {
                // Before the first measurement (the server HTML, and the
                // pre-hydration ghost) the center is centered by CSS alone:
                // equal side tracks that never drop below their content, so
                // the nav sits on the header's true center exactly where the
                // measured inset puts it — nothing jumps when the client takes
                // over (2026-09-27, /education/flashcards moved 270px).
                // After it: the title takes its natural width up to the cap
                // that keeps the nav's smallest trigger on screen; the center
                // takes the rest.
                gridTemplateColumns:
                  centerPad == null
                    ? "minmax(max-content, 1fr) auto minmax(max-content, 1fr)"
                    : `${leftMax != null ? `fit-content(${leftMax}px)` : "auto"} minmax(0, 1fr) auto`,
              }
            : undefined
        }
      >
        <div
          ref={leftRef}
          data-route-header-left
          // The title yields on ONE line: clipped and ellipsised, never wrapped
          // a letter per line under the actions (375px sample, 2026-09-25).
          className="relative z-10 flex min-w-0 items-center overflow-hidden whitespace-nowrap [&_h1]:truncate [&_h2]:truncate [&_svg]:shrink-0 [&>span]:min-w-0 [&>span]:truncate"
        >
          {leftNode}
        </div>
        {hasCenter ? (
          <div
            data-route-header-center
            // In flow and clipping, so it can never overdraw the flanks: its
            // width is its grid track, whatever its content asks for.
            className="flex min-w-0 items-center"
            // Zero-height and clipped only sideways: a 44px phone trigger
            // overhangs vertically instead of growing the row (the admin
            // header is 40px), while the flanks stay out of reach.
            style={{ height: 0, overflowX: "clip", overflowY: "visible" }}
          >
            <div
              // The margins narrow this box to the symmetric slot around the
              // header's true center. Margins, not padding: padding cannot
              // shrink, and a stale measurement pushed the whole cell over
              // the actions (768px, 2026-09-27). A too-wide margin is clipped.
              // An in-flow nav drops them (styles/shell.css).
              data-route-header-inset
              className="min-w-0 flex-1"
              style={{
                marginLeft: centerPad?.left ?? 0,
                marginRight: centerPad?.right ?? 0,
              }}
            >
              {center}
            </div>
          </div>
        ) : null}
        <div
          ref={rightRef}
          data-route-header-right
          // Actions never squeeze: they FOLD into "…" (see foldCount) so the
          // title keeps TITLE_MIN_PX. With `min-w-0` here a long title once
          // crushed a phone's header door to an 8px sliver (2026-09-25).
          className="relative z-10 flex shrink-0 items-center justify-end"
        >
          {inert.map((a) => a.node)}
          {centerToSheet && phoneHost
            ? createPortal(
                <div
                  data-route-header-overflow-item
                  data-route-header-phone-nav
                  className="w-full min-w-0 px-1 pb-1"
                >
                  {center}
                </div>,
                phoneHost,
              )
            : null}
          {sheetActions.length > 0 && phoneHost
            ? createPortal(
                <div data-route-header-phone-actions className="flex flex-col gap-0.5">
                  {sheetActions.map((a, i) => (
                    <Fragment key={a.key}>
                      {isDestructiveAction(a.node) && (i === 0 || !isDestructiveAction(sheetActions[i - 1]!.node)) && i > 0 ? (
                        <div role="separator" data-phone-sheet-divider className="my-1 h-px bg-border" />
                      ) : null}
                      <PhoneSheetAction action={a} />
                    </Fragment>
                  ))}
                </div>,
                phoneHost,
              )
            : null}
          {overflowActions.length > 0 ? (
            <Popover open={overflowOpen} onOpenChange={setOverflowOpen}>
              <PopoverTrigger asChild>
                <span
                  ref={overflowRef}
                  data-route-header-overflow
                  className="inline-flex shrink-0"
                >
                  <MoreHorizontalTapButton
                    ariaLabel={`${overflowActions.length} more action${overflowActions.length === 1 ? "" : "s"}`}
                  />
                </span>
              </PopoverTrigger>
              <PopoverContent
                sizing="content"
                align="end"
                sideOffset={6}
                className="p-1"
              >
                <div
                  data-route-header-overflow-strip
                  className="flex flex-wrap items-center justify-end"
                >
                  {overflowActions.map((a) => (
                    <OverflowMenuItem key={a.key} action={a} />
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : null}
          {rowActions.map((a) => {
            const iconOnly = compactRow && a === rowPrimary;
            // SERVER HTML: whether this is a phone is unknown, and on a phone a
            // labelled primary is icon-only. Draw both, chosen by the phone
            // breakpoint in CSS, so the first paint already matches the
            // hydrated row at every width (no JS measurement, no re-truncation).
            if (
              serverOrHydrating &&
              a === phonePrimaryCandidate &&
              !iconOnly &&
              iconOnlyLabel(a.node) != null
            ) {
              return (
                <Fragment key={a.key}>
                  <div
                    data-route-header-action={a.key}
                    data-route-header-twin=""
                    className="flex shrink-0 items-center max-md:hidden"
                  >
                    {a.node}
                  </div>
                  <div
                    data-route-header-action={a.key}
                    data-route-header-phone-primary=""
                    data-route-header-compact=""
                    data-route-header-twin=""
                    className="flex shrink-0 items-center md:hidden"
                  >
                    {toIconOnly(a.node)}
                  </div>
                </Fragment>
              );
            }
            return (
              <div
                key={a.key}
                data-route-header-action={a.key}
                data-route-header-phone-primary={a === phonePrimaryCandidate ? "" : undefined}
                data-route-header-compact={iconOnly ? "" : undefined}
                className="flex shrink-0 items-center"
              >
                {iconOnly ? toIconOnly(a.node) : a.node}
              </div>
            );
          })}
        </div>
      </div>
    </PageHeader>
  );
}
