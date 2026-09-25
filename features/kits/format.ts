// features/kits/format.ts — counts said the way a person says them.

/** `count(1, "row")` → "1 row"; `count(7, "row")` → "7 rows"; irregulars via `many`. */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
