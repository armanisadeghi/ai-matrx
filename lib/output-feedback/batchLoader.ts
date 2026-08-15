/**
 * Coalesce per-subject loads into one query per tick.
 *
 * Every action bar asks for its own subject independently — a 200-message
 * conversation would otherwise fire 200 identical-shaped requests. This queues
 * requests for a microtask + one frame, then issues ONE `in (...)` read per
 * subject type. Callers need to know nothing about it.
 */

import { fetchOutputFeedbackForSubjects } from "./service";
import { hydrateOutputFeedback, peekOutputFeedback } from "./store";

const MAX_IDS_PER_QUERY = 200;
const BATCH_WINDOW_MS = 16;

const pending = new Map<string, Set<string>>();
const inFlight = new Map<string, Promise<void>>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(): Promise<void> {
  timer = null;
  const batches = [...pending.entries()];
  pending.clear();

  await Promise.all(
    batches.map(async ([subjectType, idSet]) => {
      const ids = [...idSet];
      for (let i = 0; i < ids.length; i += MAX_IDS_PER_QUERY) {
        const chunk = ids.slice(i, i + MAX_IDS_PER_QUERY);
        try {
          const found = await fetchOutputFeedbackForSubjects(subjectType, chunk);
          hydrateOutputFeedback(subjectType, chunk, found);
        } catch (error) {
          // Loud: swallowing this renders every thumb in the chunk as "no
          // verdict", which is indistinguishable from a real empty answer.
          // eslint-disable-next-line no-console
          console.error(
            `[output-feedback] batch load failed for ${subjectType}`,
            error,
          );
        } finally {
          for (const id of chunk) inFlight.delete(`${subjectType}:${id}`);
        }
      }
    }),
  );
}

/**
 * Request one subject. Resolves once the store holds an answer for it (a
 * record or an explicit `null`). Already-loaded and already-queued subjects
 * never issue a second request.
 */
export function loadOutputFeedback(
  subjectType: string,
  subjectId: string,
): void {
  if (peekOutputFeedback({ subjectType, subjectId }) !== undefined) return;
  const key = `${subjectType}:${subjectId}`;
  if (inFlight.has(key)) return;
  inFlight.set(key, Promise.resolve());

  const set = pending.get(subjectType) ?? new Set<string>();
  set.add(subjectId);
  pending.set(subjectType, set);

  if (timer === null) {
    timer = setTimeout(() => {
      void flush();
    }, BATCH_WINDOW_MS);
  }
}

/** Request many subjects at once (a list surface hydrating in one go). */
export function loadOutputFeedbackMany(
  subjectType: string,
  subjectIds: string[],
): void {
  for (const id of subjectIds) loadOutputFeedback(subjectType, id);
}
