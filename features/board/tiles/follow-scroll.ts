/**
 * Follow-to-bottom for many streaming tiles without layout thrash.
 *
 * Each tile that wants to glide to its newest text enqueues its scroller.
 * Once per animation frame the queue READS every scrollHeight, then WRITES
 * every scroll position. Interleaving the two per tile (read → write → read…)
 * forces a synchronous layout for every tile; on a 100-stream board that was
 * the single largest main-thread cost.
 */

const queue = new Map<HTMLElement, boolean>();
let frame: number | null = null;

function flush() {
  frame = null;
  const jobs = [...queue];
  queue.clear();
  const targets = jobs.map(([el]) => el.scrollHeight - el.clientHeight);
  jobs.forEach(([el, smooth], i) => {
    el.scrollTo({ top: targets[i], behavior: smooth ? "smooth" : "auto" });
  });
}

export function followToBottom(el: HTMLElement, smooth: boolean): void {
  queue.set(el, smooth);
  if (frame === null) frame = requestAnimationFrame(flush);
}
