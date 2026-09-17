"use client";

/**
 * ONE BOX. Paste anything, press Enter, and the catalogue is on screen.
 *
 * Arman, 2026-09-17: *"provide a youtube channel and have the system get a list
 * of all videos in seconds"*. So there is no adapter picker, no "channel or
 * playlist?" question and no two-step wizard: the server sniffs what was pasted
 * (§2) and this box shows what it decided — "we read that as a handle", "that
 * video's channel" — because a paste that silently becomes something else is
 * how people lose trust in one keystroke.
 *
 * Nothing is hidden while it works. Resolving names the channel the moment the
 * server knows it; creating says so; and the moment the Library exists the
 * person is standing on its page watching rows arrive. The pasted text is never
 * cleared on a failure — losing what someone typed is not an error message.
 */

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleAlert, Link2, Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { MediaApiError, createLibrary, resolveMediaInput } from "../api";
import { formatCompactNumber } from "../format";
import type { ResolveResult } from "../types";

type Stage =
    | { kind: "idle" }
    | { kind: "resolving" }
    | { kind: "resolved"; resolved: ResolveResult }
    | { kind: "creating"; resolved: ResolveResult }
    | { kind: "failed"; message: string; remedy: string | null };

const RESOLVED_FROM_WORDS: Record<ResolveResult["resolved_from"], string> = {
    channel_id: "read as a channel id",
    handle: "read as a handle",
    legacy_user: "read as an old-style user page",
    custom_url: "read as a custom channel address",
    playlist_id: "read as a playlist",
    video_id: "read as a video — we catalogued the channel it belongs to",
};

export function CatalogPasteBox({ autoFocus = true }: { autoFocus?: boolean }) {
    const router = useRouter();
    const dispatch = useAppDispatch();
    const inputRef = useRef<HTMLInputElement>(null);
    const [value, setValue] = useState("");
    const [stage, setStage] = useState<Stage>({ kind: "idle" });

    const busy = stage.kind === "resolving" || stage.kind === "creating";

    const submit = useCallback(async () => {
        const input = value.trim();
        if (!input || busy) return;

        setStage({ kind: "resolving" });
        let resolved: ResolveResult;
        try {
            resolved = await resolveMediaInput(dispatch, input);
        } catch (error) {
            setStage({
                kind: "failed",
                message:
                    error instanceof MediaApiError
                        ? error.message
                        : "That link could not be read. Paste a YouTube channel address, an @handle, a playlist or any video link.",
                remedy: error instanceof MediaApiError ? error.remedy : null,
            });
            return;
        }

        // Never make a second Library for something this organization already
        // has — open the one that exists (§2, `existing_library_id`).
        if (resolved.existing_library_id) {
            router.push(`/libraries/${resolved.existing_library_id}?already=1`);
            return;
        }

        setStage({ kind: "creating", resolved });
        try {
            const library = await createLibrary(dispatch, {
                input,
                adapter: resolved.adapter,
                name: resolved.title,
            });
            // `sync=1` starts the enumeration on the Library page itself, so the
            // rows appear where the person is going to read them.
            router.push(`/libraries/${library.id}?sync=1`);
        } catch (error) {
            setStage({
                kind: "failed",
                message:
                    error instanceof MediaApiError
                        ? error.message
                        : `${resolved.title} could not be saved as a Library.`,
                remedy: error instanceof MediaApiError ? error.remedy : null,
            });
        }
    }, [busy, dispatch, router, value]);

    return (
        <div className="w-full">
            <div
                className={cn(
                    "flex items-center gap-2 rounded-xl border border-border bg-card p-2 shadow-sm transition-colors",
                    "focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/20",
                    stage.kind === "failed" && "border-destructive/60",
                )}
            >
                <Link2 className="ml-2 size-5 shrink-0 text-muted-foreground" aria-hidden />
                <Input
                    ref={inputRef}
                    value={value}
                    autoFocus={autoFocus}
                    disabled={busy}
                    onChange={(event: React.ChangeEvent<HTMLInputElement>) => {
                        setValue(event.target.value);
                        if (stage.kind === "failed") setStage({ kind: "idle" });
                    }}
                    onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            void submit();
                        }
                    }}
                    aria-label="YouTube channel, handle, playlist or video link"
                    placeholder="Paste a YouTube channel, @handle, playlist or any video link"
                    className="h-11 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                />
                <Button
                    type="button"
                    size="lg"
                    className="h-11 shrink-0 gap-2"
                    disabled={!value.trim() || busy}
                    onClick={() => void submit()}
                >
                    {busy ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                        <ArrowRight className="size-4" aria-hidden />
                    )}
                    {stage.kind === "resolving"
                        ? "Finding it"
                        : stage.kind === "creating"
                          ? "Cataloguing"
                          : "Catalogue"}
                </Button>
            </div>

            <div className="mt-2 min-h-[1.5rem] px-1 text-sm" aria-live="polite">
                {stage.kind === "idle" && (
                    <span className="text-muted-foreground">
                        Every video lists in seconds, split into long videos, Shorts and live.
                    </span>
                )}

                {stage.kind === "resolving" && (
                    <span className="text-muted-foreground">Asking YouTube what that is…</span>
                )}

                {(stage.kind === "resolved" || stage.kind === "creating") && (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
                        {stage.resolved.thumbnail_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={stage.resolved.thumbnail_url}
                                alt=""
                                className="size-5 rounded-full object-cover"
                            />
                        ) : null}
                        <span className="font-medium text-foreground">
                            {stage.resolved.title}
                        </span>
                        {stage.resolved.item_count != null && (
                            <span>
                                about {formatCompactNumber(stage.resolved.item_count)} videos
                            </span>
                        )}
                        {stage.resolved.subscriber_count != null && (
                            <span>
                                · {formatCompactNumber(stage.resolved.subscriber_count)}{" "}
                                subscribers
                            </span>
                        )}
                        <span>· {RESOLVED_FROM_WORDS[stage.resolved.resolved_from]}</span>
                        <span>· saving the Library…</span>
                    </span>
                )}

                {stage.kind === "failed" && (
                    <span className="flex items-start gap-2 text-destructive">
                        <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                            {stage.message}
                            {stage.remedy ? (
                                <span className="ml-1 text-muted-foreground">
                                    ({stage.remedy.replace(/_/g, " ")})
                                </span>
                            ) : null}
                        </span>
                    </span>
                )}
            </div>
        </div>
    );
}
