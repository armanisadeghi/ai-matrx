/**
 * Deterministic PRNG (mulberry32) for chunk-boundary fuzzing. Seeded so a
 * failing chunking pattern reproduces exactly — never Math.random in tests.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Split text into random-size chunks (1..maxChunk) using the seeded PRNG. */
export function chunkText(
  text: string,
  seed: number,
  maxChunk = 7,
): string[] {
  const random = seededRandom(seed);
  const chunks: string[] = [];
  let index = 0;
  while (index < text.length) {
    const size = 1 + Math.floor(random() * maxChunk);
    chunks.push(text.slice(index, index + size));
    index += size;
  }
  return chunks;
}
