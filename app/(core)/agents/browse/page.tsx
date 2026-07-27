import { redirect } from "next/navigation";

/**
 * /agents/browse was the temporary home of the new list while it was being
 * built. It is now the standard page at /agents/all, so this only keeps old
 * links and bookmarks alive.
 */
export default function AgentsBrowseRedirect() {
  redirect("/agents/all");
}
