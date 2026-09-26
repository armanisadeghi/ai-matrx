"use client";

/**
 * One catalogued item's "is it a Source yet?" cell (SOURCE-CONVERGENCE §8.6).
 *
 *   Source             — Open, to the one Source screen.
 *   Transcribing…      — until the row carries its `processed_document_id`.
 *   Not yet a Source   — the server's sentence, plus Transcribe ONLY when the
 *                        server declared that Action runnable here; otherwise
 *                        the server's reason (or nothing) — never a greyed button.
 */

import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Muted } from "@/lib/entity-list/columns";
import { sourceHref } from "@/features/sources/api/sourcesApi";
import type { VideoRow } from "../types";
import type { CatalogSourceState } from "./sourceState";

export function SourceStateCell({
    row,
    state,
    onTranscribe,
}: {
    row: VideoRow;
    state: CatalogSourceState;
    onTranscribe?: (row: VideoRow) => void;
}) {
    // The row itself opens the detail panel on click; a control inside it must not.
    const stop = (event: React.SyntheticEvent) => event.stopPropagation();

    switch (state.kind) {
        case "source":
            return (
                <span className="inline-flex items-center gap-1.5" onClick={stop}>
                    <Badge
                        variant="outline"
                        className="border-emerald-500/40 py-0 text-[11px] text-emerald-600 dark:text-emerald-400"
                    >
                        Source
                    </Badge>
                    <Link
                        href={sourceHref(state.processedDocumentId)}
                        className="text-[11px] font-medium text-primary hover:underline"
                        aria-label={`Open the Source for ${row.title}`}
                    >
                        Open
                    </Link>
                </span>
            );
        case "transcribing":
            return (
                <span className="inline-flex items-center gap-1 text-[11px] text-primary">
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                    Transcribing…
                </span>
            );
        case "not_yet": {
            const offer = state.transcribe;
            const canRun = offer.available && onTranscribe !== undefined;
            return (
                <div className="flex min-w-0 flex-col gap-0.5" onClick={stop}>
                    <div className="flex items-center gap-1.5">
                        <span
                            className="truncate text-[11px] text-muted-foreground"
                            title={state.message}
                        >
                            Not yet a Source
                        </span>
                        {canRun ? (
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-6 px-2 text-[11px]"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onTranscribe(row);
                                }}
                            >
                                Transcribe
                            </Button>
                        ) : null}
                    </div>
                    {!offer.available && offer.reason ? (
                        <span
                            className="truncate text-[11px] text-muted-foreground"
                            title={offer.reason}
                        >
                            {offer.reason}
                        </span>
                    ) : null}
                </div>
            );
        }
        case "transcribed_not_landed":
            return (
                <span
                    className="text-[11px] text-muted-foreground"
                    title="A transcript exists, but the server has not filed it as a Source yet, so there is nothing to open."
                >
                    Transcribed · not filed as a Source yet
                </span>
            );
        case "unknown":
            return <Muted>—</Muted>;
    }
}
