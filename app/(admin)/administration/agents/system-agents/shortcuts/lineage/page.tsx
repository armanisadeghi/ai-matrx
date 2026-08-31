import { redirect } from "next/navigation";

// A REAL route so the sub-tab is linkable — the tabs-law: every sub-view of a
// hub is addressable, and a person who deep-links or hand-edits the URL under
// `/shortcuts/` must land on the tab, not inside `[shortcutId]`. Without this
// file the dynamic segment swallows the slug and answers "We couldn't open this
// shortcut", which is a lie about a URL that names a tab.
//
// The canonical home stays one level up (that is what the hub's own nav links
// to and what `SystemAgentsLayoutClient` highlights), so this redirects rather
// than mounting a second copy of the page.
export default function ShortcutsTabAlias() {
  redirect("/administration/agents/system-agents/lineage");
}
