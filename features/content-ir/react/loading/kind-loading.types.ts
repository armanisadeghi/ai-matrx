/**
 * The kind loading-component contract — the EARLY-KEY interface between a
 * streaming `__kind` payload and the hardcoded loading library.
 *
 * THE EARLY-KEY CONTRACT (teach emitters to send these FIRST):
 * While a kind instance streams — and especially while its schema/component
 * are still cold-fetching — the parser surfaces the region's top-level
 * SCALAR values as they arrive. The loading layer reads this default key set
 * from the envelope's early value:
 *
 *   - `title`            string — the instance's display title
 *   - `description`      string — one-line summary of the content
 *   - `loading_message`  string — what to show while the rest streams
 *                        (e.g. "Pouring your wine tasting…")
 *   - `loading_subtext`  string — secondary line under the message
 *   - `icon`             string — icon hint (a slug from ICON_HINTS; unknown
 *                        hints fall back to the component's default)
 *   - `count`            number — expected item count (drives how many
 *                        skeleton rows/cells render)
 *
 * A kind that wants a meaningful loading state should order these keys FIRST
 * in its schema/sample so they stream in before the heavy fields. All keys
 * are optional — every loader renders sensibly with none of them.
 *
 * WHICH LOADER RENDERS: `kind_definition.metadata.loading_component` names a
 * slug from the library (see kind-loading-registry.ts). Missing/unknown slug
 * → the `generic` skeleton. The library is hardcoded (zero fetch delay) and
 * intentionally light — no heavy deps, semantic tokens, Lucide only.
 */

export interface KindLoadingProps {
  /** The identified kind slug (shown as a subtle chip when no title yet). */
  kind?: string;
  title?: string;
  description?: string;
  loadingMessage?: string;
  loadingSubtext?: string;
  /** Icon hint slug (ICON_HINTS key); unknown → the loader's default. */
  icon?: string;
  /** Expected item count — clamped by each loader to a sane skeleton count. */
  count?: number;
}

/** Read the early-key set out of an envelope's (partial) root value. */
export function earlyKeysFromValue(
  value: Record<string, unknown> | null | undefined,
  kind?: string,
): KindLoadingProps {
  const v = value ?? {};
  const str = (k: string): string | undefined =>
    typeof v[k] === "string" && (v[k] as string).length > 0
      ? (v[k] as string)
      : undefined;
  const num = (k: string): number | undefined =>
    typeof v[k] === "number" && Number.isFinite(v[k] as number)
      ? (v[k] as number)
      : undefined;

  const props: KindLoadingProps = {};
  if (kind) props.kind = kind;
  const title = str("title");
  if (title) props.title = title;
  const description = str("description");
  if (description) props.description = description;
  const loadingMessage = str("loading_message");
  if (loadingMessage) props.loadingMessage = loadingMessage;
  const loadingSubtext = str("loading_subtext");
  if (loadingSubtext) props.loadingSubtext = loadingSubtext;
  const icon = str("icon");
  if (icon) props.icon = icon;
  const count = num("count");
  if (count !== undefined) props.count = count;
  return props;
}
