'use client';

import { readOf } from '@/components/read-state/ReadGate';
import React, { useState, useEffect, useCallback } from 'react';
import { PodcastsTable } from './PodcastsTable';
import { PodcastDetailPanel } from './PodcastDetailPanel';
import { podcastService } from '../../service';
import type { PcShow, PcEpisodeWithShow } from '../../types';

type ActiveTab = 'shows' | 'episodes';

export function PodcastsContainer() {
    const [activeTab, setActiveTab] = useState<ActiveTab>('episodes');
    const [shows, setShows] = useState<PcShow[]>([]);
    const [episodes, setEpisodes] = useState<PcEpisodeWithShow[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    // A failed read is said — never "(0)" tabs and an empty table (RC-B12 r13).
    const [loadError, setLoadError] = useState<unknown>(null);

    const [selectedShow, setSelectedShow] = useState<PcShow | null>(null);
    const [selectedEpisode, setSelectedEpisode] = useState<PcEpisodeWithShow | null>(null);
    const [isNew, setIsNew] = useState(false);
    const [panelOpen, setPanelOpen] = useState(false);

    const loadData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [fetchedShows, fetchedEpisodes] = await Promise.all([
                podcastService.fetchAllShows(),
                podcastService.fetchAllEpisodes(),
            ]);
            setShows(fetchedShows);
            setEpisodes(fetchedEpisodes);
            setLoadError(null);
        } catch (err) {
            console.error('Failed to load podcast data', err);
            setLoadError(err ?? new Error('The podcasts read failed'));
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    const openNew = () => {
        setSelectedShow(null);
        setSelectedEpisode(null);
        setIsNew(true);
        setPanelOpen(true);
    };

    const openShow = (show: PcShow) => {
        setSelectedShow(show);
        setSelectedEpisode(null);
        setIsNew(false);
        setPanelOpen(true);
    };

    const openEpisode = (episode: PcEpisodeWithShow) => {
        setSelectedEpisode(episode);
        setSelectedShow(null);
        setIsNew(false);
        setPanelOpen(true);
    };

    const closePanel = () => {
        setPanelOpen(false);
        setSelectedShow(null);
        setSelectedEpisode(null);
        setIsNew(false);
    };

    const handleShowSaved = (saved: PcShow) => {
        setShows((prev) => {
            const idx = prev.findIndex((s) => s.id === saved.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = saved;
                return next;
            }
            return [saved, ...prev];
        });
        setSelectedShow(saved);
        setIsNew(false);
    };

    const handleEpisodeSaved = (saved: PcEpisodeWithShow) => {
        setEpisodes((prev) => {
            const idx = prev.findIndex((e) => e.id === saved.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = saved;
                return next;
            }
            return [saved, ...prev];
        });
        setSelectedEpisode(saved);
        setIsNew(false);
    };

    const handleShowDeleted = (id: string) => {
        setShows((prev) => prev.filter((s) => s.id !== id));
        closePanel();
    };

    const handleEpisodeDeleted = (id: string) => {
        setEpisodes((prev) => prev.filter((e) => e.id !== id));
        closePanel();
    };

    const handleTabChange = (tab: ActiveTab) => {
        setActiveTab(tab);
        closePanel();
    };

    const selectedId = activeTab === 'shows' ? selectedShow?.id : selectedEpisode?.id;

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-4 pt-3 pb-0 border-b bg-background shrink-0">
                {(['episodes', 'shows'] as ActiveTab[]).map((tab) => (
                    <button
                        key={tab}
                        onClick={() => handleTabChange(tab)}
                        className={`px-4 py-2 text-sm font-medium rounded-t-md border-b-2 transition-colors capitalize ${
                            activeTab === tab
                                ? 'border-primary text-primary bg-primary/5'
                                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
                        }`}
                    >
                        {tab}
                        <span className="ml-2 text-xs text-muted-foreground">
                            ({loadError != null && shows.length === 0 && episodes.length === 0 ? '—' : tab === 'shows' ? shows.length : episodes.length})
                        </span>
                    </button>
                ))}
            </div>

            {/* Main content: table + optional detail panel */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Table panel */}
                <div className={`${panelOpen ? 'w-1/2' : 'w-full'} min-w-0 flex flex-col transition-all duration-200 overflow-hidden`}>
                    {/* The read's failure is the table's to say, once: the failure with
                        nothing loaded, a stale notice over rows kept from before. */}
                    <PodcastsTable
                        activeTab={activeTab}
                        shows={shows}
                        episodes={episodes}
                        isLoading={isLoading}
                        selectedId={selectedId ?? null}
                        onSelectShow={openShow}
                        onSelectEpisode={openEpisode}
                        onCreate={openNew}
                        onRefresh={loadData}
                        onDeleteShow={handleShowDeleted}
                        onDeleteEpisode={handleEpisodeDeleted}
                        read={readOf({ loading: isLoading, error: loadError }, { what: "the podcasts", onRetry: () => void loadData() })}
                    />
                </div>

                {/* Detail panel */}
                {panelOpen && (
                    <div className="w-1/2 border-l shrink-0 overflow-y-auto">
                        <PodcastDetailPanel
                            activeTab={activeTab}
                            show={activeTab === 'shows' ? selectedShow : null}
                            episode={activeTab === 'episodes' ? selectedEpisode : null}
                            isNew={isNew}
                            shows={shows}
                            onClose={closePanel}
                            onShowSaved={handleShowSaved}
                            onEpisodeSaved={handleEpisodeSaved}
                            onShowDeleted={handleShowDeleted}
                            onEpisodeDeleted={handleEpisodeDeleted}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
