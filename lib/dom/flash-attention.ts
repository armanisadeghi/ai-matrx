/**
 * "Look here" — the one primitive for drawing a person's eye to an element a
 * surface has just taken them to.
 *
 * Navigation that lands you somewhere without saying WHERE is barely
 * navigation: if the destination is already on screen, or the page merely
 * shifted a little, a successful jump is indistinguishable from a dead button.
 * (Exactly how `/shapes/[kind]`'s Edit action read: it scrolled to a panel
 * that was already visible, so pressing it looked broken.)
 *
 * So the move is always the same pair — put it in view, then say "this one":
 * a primary ring that fades in, breathes, and fades out. Animation only, no
 * layout: `box-shadow` and nothing else, so flashing a thing never nudges the
 * page around it.
 *
 * Reach for this instead of hand-rolling a ring — a second attention cue that
 * looks different teaches people two things. The CSS lives with the other
 * keyframes in `app/globals.css` (`attention-ring` / `.matrx-attention-ring`),
 * and honours `prefers-reduced-motion` by holding a static ring instead.
 */

const ATTENTION_CLASS = "matrx-attention-ring";

/** Matches `--animate-attention-ring` in `app/globals.css` (1.8s, once). */
const ATTENTION_MS = 1800;

const timers = new WeakMap<HTMLElement, number>();

/**
 * Flash the attention ring on an element. Safe to call repeatedly — a second
 * call restarts the animation rather than stacking timers, so an impatient
 * double-press re-fires the cue instead of cancelling it early.
 */
export function flashAttention(el: HTMLElement | null | undefined): void {
  if (!el || typeof window === "undefined") return;

  const pending = timers.get(el);
  if (pending !== undefined) {
    window.clearTimeout(pending);
    el.classList.remove(ATTENTION_CLASS);
    // Force a reflow so removing and re-adding the class actually restarts the
    // animation instead of the browser collapsing both into a no-op.
    void el.offsetWidth;
  }

  el.classList.add(ATTENTION_CLASS);
  timers.set(
    el,
    window.setTimeout(() => {
      el.classList.remove(ATTENTION_CLASS);
      timers.delete(el);
    }, ATTENTION_MS),
  );
}

/**
 * Bring an element into view AND flash it — the complete "I took you here"
 * gesture, and what almost every caller actually wants.
 *
 * `behavior` defaults to `"smooth"`; force `"auto"` where the jump must be
 * guaranteed (smooth scrolling a nested container is dropped entirely on a
 * rAF-starved page — see `features/surfaces/utils/locate-on-page.ts`).
 */
export function revealAndFlash(
  el: HTMLElement | null | undefined,
  options: { behavior?: ScrollBehavior; block?: ScrollLogicalPosition } = {},
): void {
  if (!el) return;
  el.scrollIntoView({
    behavior: options.behavior ?? "smooth",
    block: options.block ?? "start",
  });
  flashAttention(el);
}
