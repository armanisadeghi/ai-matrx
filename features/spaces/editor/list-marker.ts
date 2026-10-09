// features/spaces/editor/list-marker.ts — C4: Notion's numbered-list marker by depth (1. → a. → i.). Pure; the
// editor (numbering.ts) and the first paint (static-body.tsx) both draw with it.

function alpha(n: number): string {
  let s = "";
  for (let k = n; k > 0; k = Math.floor((k - 1) / 26)) s = String.fromCharCode(97 + ((k - 1) % 26)) + s;
  return s;
}

function roman(n: number): string {
  const table: Array<[number, string]> = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];
  let out = "";
  let k = n;
  for (const [v, r] of table) {
    while (k >= v) {
      out += r;
      k -= v;
    }
  }
  return out;
}


/** The marker of the `index`-th (1-based) item of a numbered list nested `depth` numbered lists deep. */
export function listMarker(index: number, depth: number): string {
  const level = ((depth % 3) + 3) % 3;
  return `${level === 0 ? index : level === 1 ? alpha(index) : roman(index)}.`;
}

