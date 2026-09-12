// PrintHub — the signed-in front door for everything this platform prints.
//
// A dense, scannable index rather than a dashboard: four groups, one tile per
// printable, every tile a real anchor to a real page (THE DOOR LAW — nothing
// here names a capability it cannot open). Server Component; the only client
// island is the shell header.

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PrintHubHeader } from "./PrintHubHeader";
import { PRINT_GROUPS, printEntriesInGroup } from "./catalog";

export function PrintHub() {
    return (
        <div className="flex h-full flex-col overflow-hidden bg-textured">
            <PrintHubHeader />
            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-7xl px-3 pb-12 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-4">
                    <p className="max-w-3xl text-sm text-muted-foreground">
                        Every printable surface on the platform, in one index. Each one opens its own page with
                        real controls and a real printer — nothing here is a preview of something to come.
                    </p>

                    <div className="mt-5 flex flex-col gap-6">
                        {PRINT_GROUPS.map((group) => {
                            const entries = printEntriesInGroup(group.id);
                            if (entries.length === 0) return null;
                            return (
                                <section key={group.id}>
                                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border pb-2">
                                        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                                            <group.icon className="h-4 w-4 text-muted-foreground" />
                                            {group.label}
                                        </h2>
                                        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
                                            {group.description}
                                        </p>
                                    </div>
                                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                        {entries.map((entry) => (
                                            <Link
                                                key={entry.id}
                                                href={entry.href}
                                                className="group flex min-w-0 items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary/50 hover:bg-accent/40"
                                            >
                                                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
                                                    <entry.icon className="h-4 w-4 text-primary" />
                                                </span>
                                                <span className="min-w-0 flex-1">
                                                    <span className="flex items-center gap-1.5">
                                                        <span className="min-w-0 text-sm font-medium text-foreground">
                                                            {entry.label}
                                                        </span>
                                                        {entry.elsewhere ? (
                                                            <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                                                        ) : null}
                                                    </span>
                                                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                                                        {entry.blurb}
                                                    </span>
                                                </span>
                                            </Link>
                                        ))}
                                    </div>
                                </section>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
}
