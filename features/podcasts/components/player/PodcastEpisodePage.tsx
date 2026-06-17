'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Music, Share2, Link as LinkIcon, ListChecks, BookOpen, ChevronRight } from 'lucide-react';
import type { PcArticle, PcEpisodeWithShow } from '../../types';
import { PodcastAudioPlayer } from './PodcastAudioPlayer';
import { EpisodeShowNotes } from './EpisodeShowNotes';
import { useShare } from '../../hooks/useShare';
import { InlineMediaRef } from '@/features/files';
import { ComingSoonBadge } from '@/components/coming-soon/ComingSoonBadge';

interface PodcastEpisodePageProps {
    episode: PcEpisodeWithShow;
    /** Published companion articles for this episode (from the route). */
    articles?: PcArticle[];
}

export function PodcastEpisodePage({ episode, articles = [] }: PodcastEpisodePageProps) {
    const blog = articles.find((a) => a.kind === 'blog') ?? null;
    const showNotes = articles.find((a) => a.kind === 'show_notes') ?? null;
    const episodeHref = `/podcast/${episode.slug ?? episode.id}`;
    const coverImage = episode.image_url ?? episode.show?.image_url ?? null;
    const thumbnailImage = episode.thumbnail_url ?? episode.show?.thumbnail_url ?? coverImage;
    const [videoFailed, setVideoFailed] = useState(false);
    const [videoSrc, setVideoSrc] = useState<string | null>(null);
    const { share, copied, fallbackDialog } = useShare();

    const coverExists = !!(episode.title || coverImage || episode.description);
    const effectiveMode = (() => {
        if (episode.display_mode === 'with_video' && episode.video_url && !videoFailed) return 'with_video';
        if ((episode.display_mode === 'with_metadata' || episode.display_mode === 'with_video') && coverExists) return 'with_metadata';
        return 'audio_only';
    })();

    useEffect(() => {
        if (effectiveMode !== 'with_video' || !episode.video_url) return;
        const id = setTimeout(() => setVideoSrc(episode.video_url!), 300);
        return () => clearTimeout(id);
    }, [effectiveMode, episode.video_url]);

    function handleShare() {
        share({
            title: episode.title,
            text: episode.description ?? `Listen to ${episode.title}`,
        });
    }

    // Reusable share button for dark backgrounds (video mode)
    const ShareButtonDark = () => (
        <button
            onClick={handleShare}
            aria-label="Share this episode"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/15 hover:bg-white/25 active:scale-95 transition-all text-white text-xs font-medium border border-white/20"
        >
            {copied
                ? <><LinkIcon className="h-3.5 w-3.5" /><span>Copied!</span></>
                : <><Share2 className="h-3.5 w-3.5" /><span>Share</span></>
            }
        </button>
    );

    // Reusable share button for light backgrounds (metadata / audio-only mode)
    const ShareButtonLight = () => (
        <button
            onClick={handleShare}
            aria-label="Share this episode"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted hover:bg-accent active:scale-95 transition-all text-muted-foreground hover:text-foreground text-xs font-medium border border-border"
        >
            {copied
                ? <><LinkIcon className="h-3.5 w-3.5" /><span>Copied!</span></>
                : <><Share2 className="h-3.5 w-3.5" /><span>Share</span></>
            }
        </button>
    );

    // ── Video mode ─────────────────────────────────────────────────────────
    if (effectiveMode === 'with_video') {
        return (
            <div className="h-full w-full relative flex flex-col overflow-hidden bg-black">
                <InlineMediaRef
                    ref={videoSrc ?? null}
                    as="video"
                    size="fill"
                    fit="cover"
                    rounded="none"
                    autoPlay
                    muted
                    loop
                    playsInline
                    controls={false}
                    preload="none"
                    fallback={null}
                    errorFallback={null}
                    onError={() => setVideoFailed(true)}
                    className="absolute inset-0"
                />
                <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/95 pointer-events-none" />

                <div className="relative z-10 h-full flex flex-col justify-end px-4 sm:px-6 pb-6 w-full">
                    <div className="mb-3 flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                            {episode.show?.title && (
                                <p className="text-white/50 text-xs font-medium uppercase tracking-widest mb-1 truncate">{episode.show.title}</p>
                            )}
                            <h1 className="text-white font-bold text-lg sm:text-2xl leading-tight line-clamp-2 break-words">{episode.title}</h1>
                            {episode.description && (
                                <p className="text-white/60 text-sm mt-1.5 leading-relaxed line-clamp-2">{episode.description}</p>
                            )}
                        </div>
                        <div className="shrink-0 pt-1">
                            <ShareButtonDark />
                        </div>
                    </div>

                    <div className="bg-black/60 backdrop-blur-xl rounded-3xl p-4 border border-white/10 shadow-2xl">
                        <PodcastAudioPlayer
                            audioUrl={episode.audio_url}
                            title={episode.title}
                            coverImageUrl={thumbnailImage ?? undefined}
                            dark
                        />
                    </div>
                </div>
                {fallbackDialog}
            </div>
        );
    }

    // ── Metadata mode ──────────────────────────────────────────────────────
    if (effectiveMode === 'with_metadata') {
        return (
            <div className="h-full w-full flex flex-col overflow-hidden bg-background">
                <div className="relative shrink-0 overflow-hidden bg-zinc-900" style={{ height: '38%' }}>
                    {coverImage ? (
                        <>
                            {/* Blurred backdrop — decorative; durable via the handler. */}
                            <InlineMediaRef
                                ref={coverImage}
                                size="fill"
                                fit="cover"
                                rounded="none"
                                fallback={null}
                                errorFallback={null}
                                className="absolute inset-0 scale-110 blur-2xl opacity-60"
                                alt=""
                            />
                            <InlineMediaRef
                                ref={coverImage}
                                size="fill"
                                fit="contain"
                                rounded="none"
                                fallbackIcon={<Music className="h-20 w-20 text-white/20" />}
                                errorFallback="icon"
                                className="relative z-10"
                                alt={episode.title}
                            />
                        </>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center">
                            <Music className="h-20 w-20 text-white/20" />
                        </div>
                    )}
                    <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-background to-transparent pointer-events-none" />
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
                    <div className="px-4 sm:px-6 pt-3 pb-4 max-w-3xl mx-auto w-full">
                        {/* Title row + share */}
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="min-w-0 flex-1">
                                {episode.show?.title && (
                                    <p className="text-xs font-semibold text-primary uppercase tracking-widest mb-0.5">{episode.show.title}</p>
                                )}
                                {episode.episode_number != null && (
                                    <p className="text-xs text-muted-foreground mb-0.5">Episode {episode.episode_number}</p>
                                )}
                                <h1 className="text-foreground font-bold text-xl sm:text-3xl leading-tight break-words">{episode.title}</h1>
                                {(episode.speakers?.length ?? 0) > 0 && (
                                    <p className="text-xs text-muted-foreground mt-1">
                                        Hosted by {episode.speakers!.map((s) => s.name).join(", ")}
                                    </p>
                                )}
                            </div>
                            <div className="shrink-0 pt-1">
                                <ShareButtonLight />
                            </div>
                        </div>

                        <div className="bg-card rounded-2xl border border-border shadow-sm p-3 mb-4">
                            <PodcastAudioPlayer
                                audioUrl={episode.audio_url}
                                title={episode.title}
                            />
                        </div>

                        {episode.description && (
                            <div>
                                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">About this episode</h2>
                                <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">{episode.description}</p>
                            </div>
                        )}

                        {showNotes && <EpisodeShowNotes article={showNotes} className="mt-5" />}

                        {/* Companion content — live links when published, else Coming soon. */}
                        <div className="mt-5 space-y-2">
                            {!showNotes && (
                                <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5">
                                    <ListChecks className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                                    <span className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
                                        Chapters &amp; show notes
                                        <ComingSoonBadge />
                                    </span>
                                </div>
                            )}
                            {blog ? (
                                <Link
                                    href={`${episodeHref}/blog`}
                                    className="flex items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-accent/40"
                                >
                                    <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                                    <span className="flex-1 text-sm font-medium text-foreground">Read the blog post</span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                                </Link>
                            ) : (
                                <div className="flex items-center gap-2.5 rounded-xl border border-dashed border-border bg-muted/20 px-3 py-2.5">
                                    <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                                    <span className="flex flex-1 items-center gap-2 text-sm text-muted-foreground">
                                        Read the blog post
                                        <ComingSoonBadge />
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                {fallbackDialog}
            </div>
        );
    }

    // ── Audio only ─────────────────────────────────────────────────────────
    return (
        <div className="h-full w-full flex flex-col justify-center overflow-hidden bg-background px-4 sm:px-6">
            <div className="flex flex-col items-center gap-4 w-full max-w-2xl mx-auto">
                <div className="w-24 h-24 rounded-3xl bg-primary/10 flex items-center justify-center shadow-lg">
                    <Music className="h-11 w-11 text-primary/50" />
                </div>
                {episode.title && (
                    <div className="flex items-center gap-2 w-full justify-center">
                        <h1 className="min-w-0 text-foreground font-bold text-xl sm:text-2xl text-center leading-snug line-clamp-2 flex-1 break-words">{episode.title}</h1>
                        <ShareButtonLight />
                    </div>
                )}
                <div className="w-full bg-card rounded-2xl border border-border shadow-sm p-3">
                    <PodcastAudioPlayer
                        audioUrl={episode.audio_url}
                        title={episode.title}
                    />
                </div>
            </div>
            {fallbackDialog}
        </div>
    );
}
