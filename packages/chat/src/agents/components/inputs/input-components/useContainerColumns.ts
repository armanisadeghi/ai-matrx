import { useMeasure } from "@/hooks/usehooks";

/**
 * Attach to a stable parent container to get its live width.
 * Pass the returned width down to CheckboxGroupInput / RadioGroupInput / SelectInput.
 *
 * @example
 * const [ref, containerWidth] = useContainerWidth();
 * return <div ref={ref}><CheckboxGroupInput containerWidth={containerWidth} ... /></div>
 */
export function useContainerWidth(): [
  (element: HTMLDivElement | null) => void,
  number,
] {
  const [ref, { width }] = useMeasure<HTMLDivElement>();
  return [ref, width ?? 0];
}

/**
 * Pure calculation: given the container width and options, returns the optimal
 * column count for a grid layout. No hooks — safe to call anywhere.
 */
export function calcCols(
  containerWidth: number,
  options: string[],
  wrap: boolean,
  compact: boolean,
): number {
  if (!wrap || options.length < 5 || containerWidth <= 0) return 1;

  const avgLen =
    options.reduce((sum, o) => sum + o.trim().length, 0) / options.length;

  // compact: text-xs (~10px/char) + checkbox (16px) + gap (8px) + padding (8px)
  // normal:  text-sm (~8px/char)  + checkbox (16px) + gap (12px) + padding (12px)
  const charPx = compact ? 10 : 8;
  const fixedPx = compact ? 32 : 40; // checkbox + spacing overhead
  const minItemWidth = avgLen * charPx + fixedPx;

  const gapPx = compact ? 4 : 6;
  const maxByWidth = Math.floor(
    (containerWidth + gapPx) / (minItemWidth + gapPx),
  );
  // compact caps at 3 cols max — items are small and dense, more gets cramped
  const maxByContent = Math.min(options.length, compact ? 3 : 4);
  return Math.max(1, Math.min(maxByWidth, maxByContent));
}
