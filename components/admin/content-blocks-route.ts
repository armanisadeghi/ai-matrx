/**
 * The content-block deep link, in one place — no JSX, no client deps, so any
 * surface can import it without dragging `ContentBlocksManager` (a ~2.5k-line
 * client editor) into its chunk. THE FRAGMENTATION LAW: a route builder is not
 * a reason to pull an editor into a page that only wants to LINK to it.
 *
 * THE DOOR LAW: a content block is an addressable record. `?block=<uuid|block_id>`
 * selects one on load, so a surface that NAMES a block (the Kind Registry's
 * Assets tab lists the blocks demonstrating a kind) opens THAT block instead of
 * dumping the user on a list of all of them.
 *
 * `ContentBlocksManager` is the ONE consumer that reads the param; both routes
 * that render it accept the link:
 *   /administration/utilities/content-blocks
 *   /administration/agents/system-agents/content-blocks
 */

export const CONTENT_BLOCK_PARAM = "block";

/**
 * @param base  a route that renders `ContentBlocksManager`
 * @param blockRef  `skill.render_definition.id` (uuid) or its `block_id` key
 */
export function contentBlockHref(base: string, blockRef: string): string {
  return `${base}?${CONTENT_BLOCK_PARAM}=${encodeURIComponent(blockRef)}`;
}
