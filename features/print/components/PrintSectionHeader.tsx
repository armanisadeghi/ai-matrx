"use client";

// PrintSectionHeader — the ONE shell header for every `/print/*` page.
//
// The hub is the identity: a section page shows a back chevron to `/print`,
// the section's own name, and a sibling dropdown so you can move between
// printables without going back up. Callers pass contextual actions via
// `right`. There is no second header component under `/print`.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Check, ChevronDown, Printer } from "lucide-react";
import { ChevronLeftTapButton } from "@ai-matrx/tap-target/buttons";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import RouteHeader from "@/features/shell/components/header/RouteHeader";
import { PRINT_GROUPS, PRINT_SECTIONS, printEntry } from "@/features/print/hub/catalog";

export function PrintSectionHeader({
    sectionId,
    right,
}: {
    /** The `PRINT_CATALOG` id of the page rendering this header. */
    sectionId: string;
    right?: React.ReactNode;
}) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const current = printEntry(sectionId);

    return (
        <RouteHeader
            left={
                <>
                    <ChevronLeftTapButton
                        ariaLabel="Back to the print hub"
                        onClick={() => startTransition(() => router.push("/print"))}
                        disabled={isPending}
                    />
                    <DropdownMenu>
                        <DropdownMenuTrigger className="matrx-glass-thin-border inline-flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-foreground outline-none">
                            <Printer className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            <span className="max-w-[120px] truncate sm:max-w-[220px]">
                                {current?.label ?? "Print"}
                            </span>
                            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="max-h-[70vh] w-72 overflow-y-auto">
                            <DropdownMenuItem asChild>
                                <Link href="/print">All printables</Link>
                            </DropdownMenuItem>
                            {PRINT_GROUPS.map((group) => {
                                const entries = PRINT_SECTIONS.filter((entry) => entry.group === group.id);
                                if (entries.length === 0) return null;
                                return (
                                    <div key={group.id}>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuLabel className="text-[11px] uppercase tracking-wide text-muted-foreground">
                                            {group.label}
                                        </DropdownMenuLabel>
                                        {entries.map((entry) => (
                                            <DropdownMenuItem key={entry.id} asChild>
                                                <Link href={entry.href} className="flex items-center gap-2">
                                                    <entry.icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                                    <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                                                    {entry.id === sectionId ? (
                                                        <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                                                    ) : null}
                                                </Link>
                                            </DropdownMenuItem>
                                        ))}
                                    </div>
                                );
                            })}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </>
            }
            right={right}
        />
    );
}
