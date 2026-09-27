/**
 * THE HEADER NEVER OVERDRAWS THE ROUTE'S OWN CONTROLS.
 *
 * The shell header is one flex row: `[hamburger] [center: the route's header]
 * [right set: optional chips + Search/Agents/Canvas/Inbox]`. The right set is
 * `flex-shrink: 0`; the center is `flex: 1; min-width: 0` (so a long title can
 * ellipse on a phone instead of stretching the shell). The consequence: when the
 * right set grows, the center is squeezed BELOW its content's width and the
 * route's controls spill out of the center box — underneath the right set.
 *
 * THE LIVE DEFECT (2026-09-27, agent builder at 1024px): the "Choose
 * organization" chip (158px) squeezed `/agents/<id>/build`'s header to 646px
 * while its content needed 677px, so the builder's Menu — and, once the agent
 * was dirty, its Save button — sat under the chip. A person on a laptop-width
 * window could not save. At 1440px there was room, so nobody saw it.
 *
 * THE RULE: the route's controls outrank the shell's optional text. Anything in
 * the right set may mark its words `data-header-compact-label`; while the center
 * overflows, the header carries `data-header-crowded` and `styles/shell.css`
 * hides those words, leaving each control as its icon (still named by its
 * `aria-label`/`title`, still one click away). The decision is re-made on every
 * size or content change: un-crowd, measure, re-crowd — synchronously, so the
 * row never paints the wrong state and never oscillates.
 *
 * If compacting is not enough, the header carries `data-header-overdrawn` and
 * the console says which route and by how much — never a silent overlap.
 *
 * SELF-CONTAINED ON PURPOSE: the layout gate
 * (`features/shell/layout-gate/header-never-overdraws-route-controls.spec.ts`)
 * ships this exact function into a real Chromium via `toString()`, so it may
 * reference nothing outside its own body.
 */
export function installHeaderCrowdingGuard(header: HTMLElement): () => void {
  const center = header.querySelector<HTMLElement>(".shell-header-center");
  const right = header.querySelector<HTMLElement>("[data-header-right-set]");
  if (!center) return () => {};

  let warnedFor = "";
  let frame = 0;

  // The worst spill anywhere in the route header: an in-flow box that runs past
  // the right edge of the box that holds it — the center itself, or any box
  // inside it. The inner case is a route header squeezed INSIDE its own row:
  // `/agents/<id>/surfaces` wraps AgentHeader in `flex-1 min-w-0` between its
  // column toggles, so at 1024px the builder's Menu slid under "Hide surface
  // details" while the center as a whole still fit. Measured from rects, not
  // `scrollWidth`: an absolutely placed badge hanging off a button is designed,
  // not a spill, and `scrollWidth` rounds (a 2.4px spill on /agents/<id>/latest
  // already put the Menu's edge under the chip). Boxes that clip on purpose
  // (`truncate`, scrollers) hold their own overflow and are skipped.
  const overflowOf = () => {
    let worst = 0;
    const clipped = new Set<Element>();
    // In-flow boxes laid out by `holder`, looking through `display: contents`
    // wrappers (the portal roots are exactly that).
    const boxesOf = (holder: Element): Element[] =>
      [...holder.children].flatMap((child) => {
        const style = getComputedStyle(child);
        if (style.display === "contents") return boxesOf(child);
        if (style.display === "none" || style.position === "absolute" || style.position === "fixed") return [];
        return [child];
      });
    const holders = [center, ...center.querySelectorAll<HTMLElement>("*")];
    for (const holder of holders) {
      // Inside a box that clips, nothing can paint over a neighbour.
      if (holder.parentElement && clipped.has(holder.parentElement)) {
        clipped.add(holder);
        continue;
      }
      if (holder !== center && getComputedStyle(holder).overflowX !== "visible") {
        clipped.add(holder);
        continue;
      }
      if (!(holder instanceof HTMLElement) || holder.clientWidth === 0) continue;
      const edge = holder.getBoundingClientRect().right;
      for (const box of boxesOf(holder)) {
        const rect = box.getBoundingClientRect();
        if (rect.width === 0) continue;
        worst = Math.max(worst, rect.right - edge);
      }
    }
    return worst > 0.5 ? Math.ceil(worst) : 0;
  };

  const evaluate = () => {
    frame = 0;
    // Un-crowd first so the measurement answers "does it fit with the words?"
    // — the only way to ever give the words back after a window widens.
    header.removeAttribute("data-header-crowded");
    header.removeAttribute("data-header-overdrawn");
    if (overflowOf() <= 0) return;
    header.setAttribute("data-header-crowded", "");
    const still = overflowOf();
    if (still <= 0) return;
    header.setAttribute("data-header-overdrawn", String(still));
    const key = `${location.pathname}@${window.innerWidth}`;
    if (warnedFor !== key) {
      warnedFor = key;
      console.warn(
        `[shell-header] OVERDRAWN: the route header on ${location.pathname} needs ${still}px more than the shell leaves it at ${window.innerWidth}px, even with the header's optional labels hidden — its right-most controls sit under the header's right set. Remedy: give that route header a compact layout below this width (see features/shell/components/header/header-crowding.ts).`,
      );
    }
  };

  const schedule = () => {
    if (frame) return;
    frame = requestAnimationFrame(evaluate);
  };

  const resize = new ResizeObserver(schedule);
  resize.observe(header);
  if (right) resize.observe(right);

  // The center's own box is sized by the flex row, not by its content, so a
  // route header that grows (a Save button appearing, a label changing, a web
  // font or an avatar finishing loading) never resizes it — watch the content
  // itself: DOM changes via the MutationObserver, and the size of every element
  // in the route header via the ResizeObserver (re-collected on each change;
  // observing an element twice is a no-op).
  const observeContent = () => {
    for (const el of center.querySelectorAll("*")) resize.observe(el);
  };
  const mutation = new MutationObserver(() => {
    observeContent();
    schedule();
  });
  mutation.observe(center, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["class", "style", "hidden"],
  });

  observeContent();
  evaluate();

  return () => {
    if (frame) cancelAnimationFrame(frame);
    resize.disconnect();
    mutation.disconnect();
    header.removeAttribute("data-header-crowded");
    header.removeAttribute("data-header-overdrawn");
  };
}
