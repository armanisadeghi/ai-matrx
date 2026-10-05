// features/scopes/service/inChunks.ts
//
// An id list in a GET url is read in chunks. One url carrying every id of a person who belongs to
// ~1000 organizations is ~38 KB and the gateway refuses it ("400 Bad Request"); a hundred ids is ~4 KB.
// Each chunk is one request; the rows come back concatenated in chunk order; the first error wins.

/** Ids per request. */
export const IN_CHUNK = 100;

export type ChunkAnswer<Row, Err> = { data: Row[] | null; error: Err | null };

export async function readInChunks<Row, Err = { message: string }>(
  ids: readonly string[],
  run: (chunk: string[]) => PromiseLike<ChunkAnswer<Row, Err>>,
): Promise<ChunkAnswer<Row, Err>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return { data: [], error: null };
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += IN_CHUNK) chunks.push(unique.slice(i, i + IN_CHUNK));
  const answers = await Promise.all(chunks.map((c) => run(c)));
  const rows: Row[] = [];
  for (const a of answers) {
    if (a.error) return { data: null, error: a.error };
    rows.push(...(a.data ?? []));
  }
  return { data: rows, error: null };
}
