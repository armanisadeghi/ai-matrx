import { redirect } from "next/navigation";

/**
 * /settings/data → /trash.
 *
 * "Your data" was briefly its own page. It should never have been: /trash
 * already lists everything a person has soft-deleted, driven by the same
 * registry, and a second surface for "the same list, plus a wipe date" is
 * exactly the duplication the data-lifecycle project exists to prevent
 * (common-docs/projects/data-lifecycle-platform/{VISION,TRASH}.md).
 *
 * The route survives only as this redirect, because the weekly digest email
 * takes its link as a value and old mail keeps its URL forever. New links
 * should point at /trash directly.
 */
export default function DataLifecycleRedirect() {
  redirect("/trash");
}
