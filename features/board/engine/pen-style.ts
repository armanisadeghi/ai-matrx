/**
 * The pen's style while the Draw tool is active (FigJam / tldraw): the colour and weight the NEXT
 * strokes get. Per tab; a stroke already drawn keeps the style it was made with (the selection
 * toolbar restyles it).
 */
import type { ShapeColor, ShapeStyle } from "./shapes";

export type PenStyle = Required<Pick<ShapeStyle, "stroke" | "size">>;

let current: PenStyle = { stroke: "ink", size: "s" };
const listeners = new Set<() => void>();

export const getPenStyle = (): PenStyle => current;
export const subscribePenStyle = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
export function setPenStyle(patch: Partial<PenStyle>): void {
  current = { ...current, ...patch };
  for (const l of listeners) l();
}
export const PEN_DEFAULT: PenStyle = { stroke: "ink", size: "s" };
export type { ShapeColor };
