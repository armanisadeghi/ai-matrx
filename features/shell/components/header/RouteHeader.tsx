// RouteHeader — the canonical three-part route header.
//
// Pass three nodes; it handles everything else:
//   - Injects into the shell header center slot via <PageHeader> (transparent,
//     no border/background — children bring their own glass).
//   - Lays the three regions out on a 3-column grid `[auto_1fr_auto]`: LEFT and
//     RIGHT take their natural width first (they're the app's identity + actions),
//     and CENTER gets the BOUNDED leftover (`1fr`, `min-w-0`). The center can
//     therefore never exceed its share or squeeze the sides — a class of layout
//     bug this primitive kills. A responsive center (see RouteModeNav) measures
//     that leftover and collapses full → icons → menu to always fit.
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

import PageHeader from "./PageHeader";

interface RouteHeaderProps {
  /** Back affordance + title/identity. Kept layout-stable (no content-sized controls). */
  left?: React.ReactNode;
  /** The canonical navigation/selection for this route's sub-views. Stays centered. */
  center?: React.ReactNode;
  /** Contextual actions. Tap buttons self-space; overflow into "…" only when non-redundant. */
  right?: React.ReactNode;
}

export default function RouteHeader({ left, center, right }: RouteHeaderProps) {
  return (
    <PageHeader>
      <div className="grid grid-cols-[auto_1fr_auto] items-center w-full gap-2">
        <div className="flex items-center min-w-0">{left}</div>
        <div className="flex items-center justify-center min-w-0">{center}</div>
        <div className="flex items-center justify-end min-w-0">{right}</div>
      </div>
    </PageHeader>
  );
}
