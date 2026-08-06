/**
 * Vendored from @uidotdev/usehooks v2.4.1 (MIT — see ./LICENSE).
 *
 * Only the four hooks this repo actually uses are here. The upstream package was a
 * `github:uidotdev/usehooks` dependency, which made `pnpm install` require raw GitHub
 * (codeload.github.com) and therefore fail in any environment whose egress allows the
 * npm registry but not GitHub. Upstream was last published 2023-10-23 and the pinned
 * commit was byte-identical to the registry's 2.4.1, so nothing was lost by copying.
 *
 * Do not re-add the dependency. Change these files directly instead.
 */
export { useDebounce } from "./useDebounce";
export { useWindowSize, type WindowSize } from "./useWindowSize";
export { useMeasure, type Measurements } from "./useMeasure";
export { useLongPress, type LongPressEvent, type LongPressOptions, type LongPressFns } from "./useLongPress";
