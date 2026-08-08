import type { ParsedSnapshotFingerprint } from "@/features/marketing/lib/snapshot-content";

/**
 * Duplicate-content clustering over capture-time snapshot fingerprints
 * (`web.snapshot.extracted.fingerprint`). Pure functions — the data fetch
 * lives in `features/marketing/data/inspection-queries.ts` and the UI in
 * `components/crawls/DuplicateClustersPanel.tsx`.
 *
 * Exact duplicates share `exactSha256` (identical normalized text). Near
 * duplicates are connected components over pairs whose 64-bit simhashes agree
 * on at least `minSimilarity` percent of bits — Screaming Frog's default
 * threshold is 90%, i.e. hamming distance ≤ 6 of 64.
 */

export interface FingerprintPageRow {
  snapshotId: string;
  pageId: string;
  url: string;
  wordCount: number | null;
  fingerprint: ParsedSnapshotFingerprint | null;
}

export const DUPLICATE_SIMILARITY_OPTIONS = [100, 95, 90, 85, 80] as const;
/** Screaming Frog's near-duplicate default. */
export const DEFAULT_DUPLICATE_SIMILARITY = 90;

function popcount32(value: number): number {
  let v = value - ((value >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Hamming distance between two fixed-width 16-hex-char simhash values. */
export function simhashHamming(a: string, b: string): number {
  const aHi = parseInt(a.slice(0, 8), 16);
  const aLo = parseInt(a.slice(8), 16);
  const bHi = parseInt(b.slice(0, 8), 16);
  const bLo = parseInt(b.slice(8), 16);
  return popcount32((aHi ^ bHi) >>> 0) + popcount32((aLo ^ bLo) >>> 0);
}

/** Bit-agreement similarity of two simhashes as a 0–100 percentage. */
export function simhashSimilarity(a: string, b: string): number {
  return ((64 - simhashHamming(a, b)) / 64) * 100;
}

export interface DuplicateCluster {
  /** Stable identity — exact hash for exact clusters, member ids for near. */
  key: string;
  kind: "exact" | "near";
  /** Minimum pairwise similarity across the cluster, percent (100 = exact). */
  similarity: number;
  pages: FingerprintPageRow[];
}

export interface DuplicateClusterReport {
  exact: DuplicateCluster[];
  near: DuplicateCluster[];
  /** Rows carrying a comparable fingerprint. */
  fingerprinted: number;
  /** Captured rows with no fingerprint (pre-fingerprint crawl, empty text). */
  withoutFingerprint: number;
  /** Distinct pages involved in at least one cluster. */
  duplicatePages: number;
}

/**
 * Build exact + near duplicate clusters.
 *
 * Near clustering runs over one representative per exact-hash group (so a
 * 50-copy boilerplate page is one node, not 1,225 pairs) and only compares
 * equal fingerprint versions. Components must span at least two DISTINCT
 * exact-hash groups — otherwise they are already reported as exact.
 */
export function buildDuplicateClusters(
  rows: FingerprintPageRow[],
  minSimilarity: number = DEFAULT_DUPLICATE_SIMILARITY,
): DuplicateClusterReport {
  const fingerprinted = rows.filter((row) => row.fingerprint !== null);
  const withoutFingerprint = rows.length - fingerprinted.length;

  const byExact = new Map<string, FingerprintPageRow[]>();
  for (const row of fingerprinted) {
    const fingerprint = row.fingerprint;
    if (!fingerprint) continue;
    const key = `${fingerprint.version}:${fingerprint.exactSha256}`;
    const group = byExact.get(key);
    if (group) group.push(row);
    else byExact.set(key, [row]);
  }

  const exact: DuplicateCluster[] = [...byExact.entries()]
    .filter(([, pages]) => pages.length > 1)
    .map(([key, pages]) => ({
      key,
      kind: "exact" as const,
      similarity: 100,
      pages: sortPages(pages),
    }))
    .sort(clusterOrder);

  // One representative per exact group; union-find over qualifying pairs.
  const groups = [...byExact.values()];
  const maxHamming = Math.floor(((100 - minSimilarity) / 100) * 64);
  const parent = groups.map((_, index) => index);
  const find = (index: number): number => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== root) {
      const next = parent[index];
      parent[index] = root;
      index = next;
    }
    return root;
  };
  for (let a = 0; a < groups.length; a += 1) {
    const fa = groups[a][0].fingerprint;
    if (!fa) continue;
    for (let b = a + 1; b < groups.length; b += 1) {
      const fb = groups[b][0].fingerprint;
      if (!fb || fb.version !== fa.version) continue;
      if (simhashHamming(fa.simhash64, fb.simhash64) <= maxHamming) {
        parent[find(a)] = find(b);
      }
    }
  }
  const components = new Map<number, number[]>();
  for (let index = 0; index < groups.length; index += 1) {
    const root = find(index);
    const members = components.get(root);
    if (members) members.push(index);
    else components.set(root, [index]);
  }
  const near: DuplicateCluster[] = [...components.values()]
    .filter((members) => members.length > 1)
    .map((members) => {
      let similarity = 100;
      for (let a = 0; a < members.length; a += 1) {
        for (let b = a + 1; b < members.length; b += 1) {
          const fa = groups[members[a]][0].fingerprint;
          const fb = groups[members[b]][0].fingerprint;
          if (fa && fb) {
            similarity = Math.min(
              similarity,
              simhashSimilarity(fa.simhash64, fb.simhash64),
            );
          }
        }
      }
      const pages = sortPages(members.flatMap((index) => groups[index]));
      return {
        key: pages.map((page) => page.snapshotId).join("|"),
        kind: "near" as const,
        similarity,
        pages,
      };
    })
    .sort(clusterOrder);

  const duplicatePages = new Set(
    [...exact, ...near].flatMap((cluster) =>
      cluster.pages.map((page) => page.pageId),
    ),
  ).size;

  return {
    exact,
    near,
    fingerprinted: fingerprinted.length,
    withoutFingerprint,
    duplicatePages,
  };
}

function sortPages(pages: FingerprintPageRow[]): FingerprintPageRow[] {
  return [...pages].sort((a, b) => a.url.localeCompare(b.url));
}

function clusterOrder(a: DuplicateCluster, b: DuplicateCluster): number {
  return b.pages.length - a.pages.length || a.key.localeCompare(b.key);
}
