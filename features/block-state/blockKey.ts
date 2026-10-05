// features/block-state/blockKey.ts
//
// Block identity (binding ruling B5): the block's own DECLARED id → a
// FINGERPRINT of its content → its ORDINAL among blocks of that kind. A block
// whose neighbours were edited keeps its state; a block whose own content
// changed starts empty (it is a different block, never silently re-bound).

/** FNV-1a 32-bit over a string, base36 — stable, tiny, no crypto needed. */
export function fingerprintOf(value: unknown): string | null {
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value) ?? "";
  } catch {
    return null;
  }
  if (!text) return null;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export interface BlockIdentity {
  kind: string;
  declaredId?: string | null;
  fingerprint?: string | null;
  ordinal?: number | null;
}

/** The stable key within the record, or null when nothing identifies the block yet. */
export function blockKeyFor({ kind, declaredId, fingerprint, ordinal }: BlockIdentity): string | null {
  const id = declaredId?.trim();
  if (id) return `${kind}:id:${id}`;
  if (fingerprint) return `${kind}:fp:${fingerprint}`;
  if (typeof ordinal === "number") return `${kind}:${ordinal}`;
  return null;
}
