"use client";

/**
 * What an organization-authored component may and may not do, shown WHERE IT IS
 * AUTHORED — above the code editor, on both the Studio and the admin registry
 * (they render the same tab).
 *
 * It is collapsed by default and open in one click: an author who knows the
 * rules should not scroll past them every time, and an author who does not
 * should never have to be told where they are written down. The rows come from
 * `sandbox-authoring-rules.ts`, which is the same declaration the sandbox
 * enforces — so this panel cannot drift into describing a boundary that moved.
 */

import { ShieldCheck } from "lucide-react";

import {
    SANDBOX_AUTHORING_RULES,
    SANDBOX_HEIGHT_NOTE,
} from "@/features/content-ir/studio/sandbox-authoring-rules";

export default function SandboxAuthoringRules() {
    return (
        <details className="shrink-0 border-b border-border bg-card">
            <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-xs font-medium text-foreground">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                What this component may and may not do
                <span className="font-normal text-muted-foreground">
                    — it renders in an isolated frame
                </span>
            </summary>
            <div className="space-y-3 px-3 pb-3 pt-1">
                <p className="max-w-3xl text-xs text-muted-foreground">
                    A component written here runs inside its own frame, so it
                    cannot reach the page around it, the network, or the signed-in
                    session. Everything below is enforced while it renders — none
                    of it is a convention.
                </p>
                <ul className="grid gap-2 md:grid-cols-2">
                    {SANDBOX_AUTHORING_RULES.map((rule) => (
                        <li
                            key={rule.topic}
                            className="rounded-md border border-border bg-background p-2.5"
                        >
                            <p className="text-xs font-medium text-foreground">
                                {rule.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">
                                    You can:{" "}
                                </span>
                                {rule.allowed}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">
                                    You cannot:{" "}
                                </span>
                                {rule.forbidden}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">
                                    If you do:{" "}
                                </span>
                                {rule.consequence}
                            </p>
                        </li>
                    ))}
                </ul>
                <p className="max-w-3xl text-xs text-muted-foreground">
                    {SANDBOX_HEIGHT_NOTE}
                </p>
            </div>
        </details>
    );
}
