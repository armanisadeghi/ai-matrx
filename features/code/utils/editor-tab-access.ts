import type { EditorFile } from "../types";

const READ_ONLY_TAB_PREFIXES = ["git-diff:", "auto-stash-diff:"] as const;

/**
 * Read-only is a tab invariant, not just a Monaco presentation option.
 * Prefix coverage protects historical Git virtual tabs that predate the
 * explicit field, so Save can never misroute their virtual paths to a sandbox.
 */
export function isReadOnlyEditorTab(
  tab: Pick<EditorFile, "id" | "readOnly"> | null | undefined,
): boolean {
  return Boolean(
    tab?.readOnly ||
    (tab && READ_ONLY_TAB_PREFIXES.some((prefix) => tab.id.startsWith(prefix))),
  );
}
