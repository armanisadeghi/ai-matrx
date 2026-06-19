/**
 * random_wheel — wire contract types.
 *
 * The renderer spins a wheel of candidate labels and lands on ONE
 * (decided server-side). Three modes:
 *   - "list"  → the winner IS the answer (label + value the model provided).
 *   - "web"   → wheel lands on a seed phrase, server fetches web content for it.
 *   - "image" → wheel lands on a keyword, server fetches a stock image for it.
 *
 * Spin parameters arrive on a `tool_step` event with `data.step === "spin"`
 * under `data.metadata`. The final answer arrives on `entry.result`.
 */

export type RandomWheelMode = "list" | "web" | "image";

/** Payload carried under `data.metadata` of the `spin` tool_step event. */
export interface RandomWheelSpinMeta {
  /** The wheel faces (2–24 labels), already truncation-friendly. */
  candidates: string[];
  /** Index into `candidates` the wheel must land on. */
  winner_index: number;
  /** How long to spin, server-authoritative. 0 ⇒ no dramatize → land instantly. */
  spin_duration_ms: number;
  /** Wheel title, e.g. "Spin for a topic". */
  title: string;
  /** Which downstream behavior this spin feeds. */
  mode: RandomWheelMode;
  /** Size of the full pool the candidates were sampled from. */
  pool_size: number;
}

/** A source link returned in web mode. */
export interface RandomWheelSource {
  url: string;
  title?: string;
}

/** Stock-image payload returned in image mode. */
export interface RandomWheelImage {
  url: string;
  thumb?: string;
  photographer_name?: string;
  photographer_url?: string;
  description?: string;
}

/** The chosen winner. `value` is mode-dependent (string for web/image, anything for list). */
export interface RandomWheelChosen {
  label: string;
  value: unknown;
}

/** Shape of `entry.result` / `resultAsObject(entry)` when the spin completes. */
export interface RandomWheelResult {
  mode: RandomWheelMode;
  title: string;
  chosen: RandomWheelChosen;
  candidates: string[];
  winner_index: number;
  pool_size: number;
  display_count: number;
  spin_duration_ms: number;
  /** web/image: the chosen seed phrase (== chosen.label). */
  seed: string | null;
  /** web mode: source links. */
  sources: RandomWheelSource[] | null;
  /** image mode: the fetched image. */
  image: RandomWheelImage | null;
}

/** Everything the renderer needs to draw + animate the wheel, resolved from
 * either the live spin step event or the persisted result. */
export interface ResolvedWheel {
  candidates: string[];
  winnerIndex: number;
  spinDurationMs: number;
  title: string;
  mode: RandomWheelMode;
  poolSize: number;
}
