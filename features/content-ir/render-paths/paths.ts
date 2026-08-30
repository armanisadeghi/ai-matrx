/**
 * THE RENDER PATHS — every distinct way a kind instance reaches a screen.
 *
 * 🚨 WHY THIS EXISTS (Arman, 2026-08-29):
 *
 *   "You should never cheat when showing a preview or an example… make sure
 *    the rendering is through the same exact fucking path as everywhere else
 *    it's used. And if it's rendered in multiple ways in different places,
 *    then show multiple rendering tabs so you see it as it's going to be in
 *    every single situation."
 *
 * The Preview tab used to hand a saved example straight to the component as a
 * JavaScript object: no text, no recognition, no routing decision. It was
 * structurally incapable of failing the way production fails, so on
 * 2026-08-29 it showed a perfect green render of `electronics_intake_analysis`
 * while that very kind was rendering as a key/value dump in chat. A preview
 * that cannot fail is not a preview.
 *
 * A kind does not have ONE rendering. It has these, and they can disagree:
 * the streaming ones must recognize the shape from raw characters, the reload
 * one starts from a stored value, and the direct one never routes at all.
 * Each is listed here with what is genuinely exercised and what is not, so a
 * green light never means more than it should.
 */

/** Identity of one render path. Stable — it appears in URLs and verdict rows. */
export type RenderPathId =
  | "chat_fence"
  | "chat_bare"
  | "chat_artifact"
  | "server_partial"
  | "reload"
  | "direct"
  | "loading"
  | "input";

export interface RenderPathSpec {
  id: RenderPathId;
  /** Short label for the mode selector. */
  label: string;
  /** Where in the product a reader actually meets this path. */
  where: string;
  /**
   * What this run genuinely exercises, in plain words. Shown to the user
   * verbatim. If a part is synthesized rather than live, it says so HERE —
   * that sentence is the whole anti-cheat mechanism.
   */
  exercises: string;
  /** True when the path drives the real StreamBlockAccumulator over text. */
  streams: boolean;
}

export const RENDER_PATHS: readonly RenderPathSpec[] = [
  {
    id: "chat_fence",
    label: "Chat — fenced",
    where: "An agent answers in chat with a ```json block inside prose.",
    exercises:
      "Real: the wire text is chunked and fed through StreamBlockAccumulator — the same class every chat surface runs — then rendered through SafeBlockRenderer and applyIrKindRoute. Nothing is simulated.",
    streams: true,
  },
  {
    id: "chat_bare",
    label: "Chat — structured output",
    where:
      "An agent bound to this kind's schema returns one minified JSON line with no prose. This is the shape that broke on 2026-08-29.",
    exercises:
      "Real: same accumulator and renderer as the fenced path, over the bare single-line wire a provider's structured-output mode produces.",
    streams: true,
  },
  {
    id: "chat_artifact",
    label: "Chat — inside an artifact",
    where:
      "The artifact system wraps the answer in an <artifact> tag with a Canvas to open in.",
    exercises:
      "Real: the accumulator's attr-XML body path. The block keeps the artifact renderer by design — what is checked here is that the envelope still attaches, which is what every selector reads.",
    streams: true,
  },
  {
    id: "server_partial",
    label: "Server-closed partial",
    where:
      "Run pages and workflows, where Python closes partial JSON and ships an __ir_partial event instead of the browser parsing it.",
    exercises:
      "Real rendering: the event goes through the production resolveProvisionalKindRender and applyIrKindRoute. SYNTHESIZED input: the partial event is built here in the browser, not received from the server — so this checks the render half, not the server's detector.",
    streams: false,
  },
  {
    id: "reload",
    label: "Reloaded from a record",
    where:
      "Reopening a saved conversation or artifact: the value comes from the database, already parsed, and nothing streams.",
    exercises:
      "Real: a complete envelope is built from the stored value and routed through applyIrKindRoute exactly as a rehydrated message is. No recognition-from-text happens on this path in production either, so none happens here.",
    streams: false,
  },
  {
    id: "direct",
    label: "Direct object",
    where:
      "Window panels, instance pages, and admin surfaces that already hold the value.",
    exercises:
      "Real: KindInstanceRender, the same component those surfaces mount. This path never parses text — in production or here — so a green light here says nothing about chat.",
    streams: false,
  },
  {
    id: "loading",
    label: "Loading state",
    where:
      "The instant the kind is identified mid-stream, before its component resolves.",
    exercises:
      "Real: the kind's declared loading component, resolved through the production loading-slug resolver.",
    streams: false,
  },
  {
    id: "input",
    label: "Input form",
    where:
      "Anywhere a person fills this shape in rather than reading it — the role=input component.",
    exercises:
      "Real: the input-role component the resolver returns for this kind, or the generic structured form when none is registered.",
    streams: false,
  },
] as const;

export function renderPathSpec(id: RenderPathId): RenderPathSpec {
  const found = RENDER_PATHS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown render path "${id}"`);
  return found;
}

/**
 * The verdict for ONE path — what the reader would actually get.
 *
 * `reachedRealComponent` is the only line that matters for "does this shape
 * work here", and it is deliberately NOT "a component row exists". It is what
 * the route returned on this run.
 */
export interface RenderPathVerdict {
  /** The block type applyIrKindRoute settled on (or the mount for non-routed paths). */
  resolvedAs: string;
  /** The kind's own component rendered — not the generic key/value floor. */
  reachedRealComponent: boolean;
  /** The envelope's final kindState, when this path produces one. */
  kindState: string | null;
  /** Why the generic floor was used, when it was. */
  fallbackReason: string | null;
  /** Free-form problems worth showing beside the render. */
  notes: string[];
}
