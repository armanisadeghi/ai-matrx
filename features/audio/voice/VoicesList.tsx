'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { listVoices } from '@/lib/cartesia/cartesiaUtils';
import { CardContent, CardHeader } from "@/components/ui/card";
import { Card, CardTitle } from "@/components/ui/card";
import { FullJsonViewer } from '@/components/ui/JsonComponents/JsonViewerComponent';
import { motion } from 'motion/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/use-toast';
import { useAiAudio } from "@/features/audio/voice/AiVoicePage";
import { AiVoice } from "@/types/aiAudioTypes";
import { useIsMobile } from "@/hooks/use-mobile";
import { FloatingActionBar } from './components/FloatingActionBar';
import { DesktopSearchBar } from './components/DesktopSearchBar';
import { FilterModal } from './components/FilterModal';
import { VoiceSelectionModal } from './components/VoiceSelectionModal';
import { cn } from '@/lib/utils';
import { matchesSearch } from '@/utils/search-scoring';

const VoicesList: React.FC = () => {
    const {
        loading,
        error,
        getOneData,
        setOneData,
        setLoading,
        setError,
    } = useAiAudio();

    const isMobile = useIsMobile();
    const [selectedVoice, setSelectedVoice] = useState<AiVoice | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] = useState("name-asc");
    const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
    const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

    const availableVoices = getOneData('availableVoices') as AiVoice[] | undefined;

    const loadVoices = useCallback(async () => {
        console.log("loadVoices function called");
        setLoading(true);
        try {
            const voicesData = await listVoices();
            const filteredVoices = voicesData.map(({ id, name, description }) => ({
                id,
                name,
                description,
            }));
            setOneData('availableVoices', filteredVoices);
        } catch (err) {
            console.error("Error in loadVoices:", err);
            setError('Failed to fetch voices.');
            toast({
                title: "Error",
                description: "Failed to fetch voices. Please try again.",
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    }, [setLoading, setOneData, setError]);

    useEffect(() => {
        if (!availableVoices || availableVoices.length < 3) {
            console.log("Fetching available voices");
            loadVoices();
        } else {
            console.log("Voices already loaded");
        }
    }, [availableVoices, loadVoices]);

    // Filter and sort voices
    const filteredVoices = useMemo(() => {
        if (!availableVoices) return [];
        
        let filtered = [...availableVoices];

        // Apply search filter
        if (searchTerm) {
            filtered = filtered.filter((voice) =>
                matchesSearch(voice, searchTerm, [
                    { get: (v) => v.name, weight: 'title' },
                    { get: (v) => v.description, weight: 'body' },
                ])
            );
        }

        // Apply sorting
        filtered.sort((a, b) => {
            if (sortBy === "name-asc") {
                return a.name.localeCompare(b.name);
            } else if (sortBy === "name-desc") {
                return b.name.localeCompare(a.name);
            }
            return 0;
        });

        return filtered;
    }, [availableVoices, searchTerm, sortBy]);

    const handleCopyId = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        navigator.clipboard.writeText(id);
        toast({
            title: "Voice ID Copied",
            description: "The voice ID has been copied to your clipboard.",
        });
    }, []);

    const handleCardClick = useCallback((voice: AiVoice) => {
        setSelectedVoice(voice);
        setIsVoiceModalOpen(true);
    }, []);

    const hasActiveFilters = sortBy !== "name-asc";

    if (loading) {
        return <div className="flex justify-center items-center h-full">
            <p className="text-primary">Loading voices...</p>
        </div>;
    }

    if (error) {
        console.log("VoicesList encountered an error:", error);
        return <div className="flex justify-center items-center h-full">
            <p className="text-red-500">{error}</p>
        </div>;
    }

    return (
        <TooltipProvider>
            <div className="space-y-8 p-4 min-h-dvh">
                {/* Desktop Search Bar */}
                {!isMobile && (
                    <DesktopSearchBar
                        searchValue={searchTerm}
                        onSearchChange={setSearchTerm}
                        onFilterClick={() => setIsFilterModalOpen(true)}
                        showFilterBadge={hasActiveFilters}
                    />
                )}

                {/* Voice Grid with mobile padding */}
                <div className={cn(
                    "grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4",
                    isMobile && "pb-24"
                )}>
                    {filteredVoices.map((voice: AiVoice) => (
                        <VoiceCard
                            key={voice.id}
                            voice={voice}
                            onCardClick={() => handleCardClick(voice)}
                            onCopyId={handleCopyId}
                        />
                    ))}
                </div>

                {filteredVoices.length === 0 && !loading && (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                        <p className="text-muted-foreground text-lg">No voices found</p>
                        <p className="text-muted-foreground text-sm mt-2">
                            Try adjusting your search or filters
                        </p>
                    </div>
                )}

                <FullJsonViewer data={availableVoices} title="All Voices Data" />

                {/* Mobile Floating Action Bar */}
                <FloatingActionBar
                    searchValue={searchTerm}
                    onSearchChange={setSearchTerm}
                    onFilterClick={() => setIsFilterModalOpen(true)}
                    showFilterBadge={hasActiveFilters}
                />

                {/* Filter Modal */}
                <FilterModal
                    isOpen={isFilterModalOpen}
                    onClose={() => setIsFilterModalOpen(false)}
                    sortBy={sortBy}
                    onSortChange={setSortBy}
                    onClearFilters={() => {
                        setSortBy("name-asc");
                        setSearchTerm("");
                    }}
                />

                {/* Voice Selection Modal */}
                {selectedVoice && (
                    <VoiceSelectionModal
                        isOpen={isVoiceModalOpen}
                        onClose={() => {
                            setIsVoiceModalOpen(false);
                            setSelectedVoice(null);
                        }}
                        voices={availableVoices || []}
                        selectedVoiceId={selectedVoice.id}
                        title={selectedVoice.name}
                    />
                )}
            </div>
        </TooltipProvider>
    );
};

interface VoiceCardProps {
    voice: AiVoice;
    onCardClick: () => void;
    onCopyId: (id: string, e: React.MouseEvent) => void;
}

const VoiceCard: React.FC<VoiceCardProps> = React.memo(({ voice, onCardClick, onCopyId }) => (
    <motion.div
        className="cursor-pointer h-full"
        whileHover={{ scale: 1.05 }}
        transition={{ type: 'spring', stiffness: 100 }}
        onClick={onCardClick}
    >
        <Card className="bg-matrx-card-background shadow-lg hover:shadow-xl transition-shadow h-full flex flex-col">
            <CardHeader>
                <CardTitle className="text-md text-foreground">{voice.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow flex flex-col justify-between">
                <p className="text-muted-foreground mb-4 text-sm line-clamp-2">{voice.description}</p>
            </CardContent>
        </Card>
    </motion.div>
));

VoiceCard.displayName = 'VoiceCard';

export default VoicesList;
