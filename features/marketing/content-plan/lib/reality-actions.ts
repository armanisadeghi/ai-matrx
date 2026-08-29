/**
 * features/marketing/content-plan/lib/reality-actions.ts
 *
 * THE ONE confirmed way to rewrite or publish a plan node's real page.
 *
 * Both actions are offered in two places — the reality card and the pipeline
 * rail's step runners — and both are governed by the destructive/expensive
 * click law (`common-docs/policies/destructive-and-expensive-actions.md`):
 * publishing makes a page visible to the public internet, rewriting throws
 * away whatever a human has unsaved in the CMS editor. The confirmations live
 * here, not at the call sites, so the two paths cannot drift apart — the rail
 * used to fire both bare.
 */
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";

import type { NodeReality } from "../hooks/useNodeReality";

/**
 * Rewriting overwrites the CMS draft — human work included — so it is
 * confirmed wherever it is offered.
 */
export async function confirmRewritePage(reality: NodeReality): Promise<void> {
    const ok = await confirm({
        title: "Rewrite this page from the brief?",
        description:
            "The AI replaces the current draft with a fresh version written from this page's brief. Anything unsaved in the CMS editor is lost.",
        confirmLabel: "Rewrite it",
    });
    if (ok) void reality.write();
}

/** Publishing puts the page on the public internet — always confirmed. */
export async function confirmPublishPage(
    reality: NodeReality,
    pageLabel: string,
): Promise<void> {
    const ok = await confirm({
        title: "Publish this page?",
        description: `${pageLabel} becomes visible to the public immediately.`,
        confirmLabel: "Publish it",
        variant: "destructive",
    });
    if (ok) void reality.publish();
}
