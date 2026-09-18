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

/**
 * WHAT THIS BOX ACCEPTS — named once, used everywhere below.
 *
 * All four source adapters now work end to end. aidream migration 0874 widened
 * `media.source_library`'s adapter CHECK to admit blog_feed and slide_deck, so the
 * two that could previously resolve-but-not-save now save. Verified live on
 * 2026-09-17 before this copy changed: The Tim Ferriss Show, 886 episodes; Seth's
 * Blog, 10,563 posts.
 *
 * 🚨 THIS LIST IS NOT A WISH. Nothing is named here that the server cannot
 * actually catalogue — a paste that resolves and then fails at insert is the
 * screen promising something it cannot do. If an adapter is ever taken out of
 * service, its words come out of these two strings in the same change.
 */
const ACCEPTED_INPUTS_LABEL =
    "YouTube channel, handle, playlist or video link; a podcast name, Apple Podcasts link or RSS feed; a blog, Substack or Medium address; or a SlideShare or Speaker Deck profile";
const ACCEPTED_INPUTS_PLACEHOLDER =
    "Paste a YouTube channel, a podcast name or feed, a blog or Substack, or a SlideShare profile";

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
                        : `That could not be read. Paste a ${ACCEPTED_INPUTS_LABEL}.`,
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
            // NEVER NAVIGATE TO AN ID WE DO NOT HAVE. A response shape that
            // drifts (an envelope where a row was promised) used to send people
            // to `/libraries/undefined`, which is a 404 wearing the costume of
            // a Library. If the id is missing the Library may well exist, so
            // say exactly that and send them to the list rather than pretending
            // nothing was created.
            if (!library?.id) {
                setStage({
                    kind: "failed",
                    message: `${resolved.title} was sent to the server, but it did not return an address for the new Library, so we cannot open it. Reload this page — if it is in your list, it was saved.`,
                    remedy: null,
                });
                return;
            }
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
            {/*
              * IT IS A REAL FORM, SO ENTER IS THE BROWSER'S JOB AND NOT OURS.
              * This box used to be a bare <div> with an `onKeyDown` that
              * compared `event.key === "Enter"` — which works right up until
              * something upstream hands React a key event it does not
              * recognize, and then the one instruction on the screen ("paste
              * and press Enter") silently does nothing. A <form> with a
              * `type="submit"` button gets implicit submission from the
              * browser itself, which is also what puts "Go" on an iOS keyboard
              * and what a screen reader announces. The keydown handler stays as
              * well: both roads lead to the same `submit()`, and `busy` makes a
              * double fire a no-op.
              */}
            <form
                onSubmit={(event: React.FormEvent<HTMLFormElement>) => {
                    event.preventDefault();
                    void submit();
                }}
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
                        // Belt as well as braces: the form's implicit
                        // submission already covers Enter. This only matters
                        // for a composed/synthesised key event that never
                        // reaches the browser's default action.
                        if (event.key === "Enter" && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            void submit();
                        }
                    }}
                    aria-label={ACCEPTED_INPUTS_LABEL}
                    placeholder={ACCEPTED_INPUTS_PLACEHOLDER}
                    className="h-11 border-0 bg-transparent text-base shadow-none focus-visible:ring-0"
                />
                <Button
                    type="submit"
                    size="lg"
                    className="h-11 shrink-0 gap-2"
                    disabled={!value.trim() || busy}
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
            </form>

            <div className="mt-2 min-h-[1.5rem] px-1 text-sm" aria-live="polite">
                {stage.kind === "idle" && (
                    <span className="text-muted-foreground">
                        Everything in it lists in seconds — every video, episode,
                        post or deck, with its dates and lengths.
                    </span>
                )}

                {stage.kind === "resolving" && (
                    <span className="text-muted-foreground">Working out what that is…</span>
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
