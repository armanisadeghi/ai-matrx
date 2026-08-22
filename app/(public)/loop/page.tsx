import { GrowthLoopGlance } from "@/features/growth-loop/public/GrowthLoopGlance";

/**
 * The above-the-fold face of the growth loop. This page is meant to END at the
 * fold on a desktop; the layout's <main> scrolls only when a viewport genuinely
 * cannot hold it.
 *
 * `h-full` (definite), NOT `min-h-full` — the child's own `min-h-full` is a
 * percentage, which collapses to auto unless this parent has a definite height.
 * Content taller than this simply overflows and <main> scrolls it.
 */
export default function LoopPage() {
  return (
    <div className="h-full bg-textured">
      <GrowthLoopGlance />
    </div>
  );
}
