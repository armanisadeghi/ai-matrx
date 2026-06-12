"use client";

import React, { useState, useMemo, useCallback } from 'react';
import { motion } from 'motion/react';
import { Play, Square, Loader2, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CardContent, CardHeader } from "@/components/ui/card";
import { Card, CardTitle } from "@/components/ui/card";
import { MobileOverlayWrapper } from '@/components/official/MobileOverlayWrapper';
import { useIsMobile } from '@/hooks/use-mobile';
import { useCartesia } from '@/hooks/tts/useCartesia';
import { VoiceOptions, VoiceSpeed } from '@/lib/cartesia/cartesia.types';
import { AiVoice } from '@/types/aiAudioTypes';
import { cn } from '@/lib/utils';
import { filterAndSortBySearch } from '@/utils/search-scoring';

interface VoiceSelectionModalProps {
    isOpen: boolean;
    onClose: () => void;
    voices: AiVoice[];
    selectedVoiceId?: string;
    onSelectVoice?: (voiceId: string) => void;
    title?: string;
}

export function VoiceSelectionModal({
    isOpen,
    onClose,
    voices,
    selectedVoiceId,
    onSelectVoice,
    title = "Select Voice",
}: VoiceSelectionModalProps) {
    const isMobile = useIsMobile();
    const [searchTerm, setSearchTerm] = useState("");
    const [playingVoiceId, setPlayingVoiceId] = useState<string | null>(null);
    const [selectedTempVoiceId, setSelectedTempVoiceId] = useState(selectedVoiceId);
    
    const { sendMessage, isConnected, stopPlayback } = useCartesia();

    // Filter voices based on search
    const filteredVoices = useMemo(() => {
        if (!searchTerm) return voices;
        return filterAndSortBySearch(voices, searchTerm, [
            { get: (v) => v.name, weight: 'title' },
            { get: (v) => v.description, weight: 'body' },
        ]);
    }, [voices, searchTerm]);

    const handlePlayVoice = useCallback(async (voice: AiVoice) => {
        if (playingVoiceId === voice.id) {
            stopPlayback();
            setPlayingVoiceId(null);
            return;
        }

        if (playingVoiceId) {
            stopPlayback();
        }

        setPlayingVoiceId(voice.id);
        const voiceOptions: VoiceOptions = { mode: "id", id: voice.id };
        const transcript = `Hi. ${voice.description || "This is a sample of my voice."}`;

        try {
            await sendMessage(transcript, VoiceSpeed.NORMAL, voiceOptions);
        } catch (error) {
            console.error("Error playing voice:", error);
        } finally {
            setPlayingVoiceId(null);
        }
    }, [playingVoiceId, sendMessage, stopPlayback]);

    const handleSelectVoice = useCallback((voiceId: string) => {
        setSelectedTempVoiceId(voiceId);
        if (onSelectVoice) {
            onSelectVoice(voiceId);
            onClose();
        }
    }, [onSelectVoice, onClose]);

    const handleClose = useCallback(() => {
        if (playingVoiceId) {
            stopPlayback();
            setPlayingVoiceId(null);
        }
        setSearchTerm("");
        onClose();
    }, [playingVoiceId, stopPlayback, onClose]);

    const content = (
        <div className="flex flex-col h-full">
            {/* Search Bar */}
            <div className="p-4 border-b border-border/50 bg-background/50 backdrop-blur-sm sticky top-0 z-10">
                <Input
                    type="text"
                    placeholder="Search voices..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full"
                    autoFocus={!isMobile}
                />
                {filteredVoices.length > 0 && (
                    <p className="text-sm text-muted-foreground mt-2">
                        {filteredVoices.length} {filteredVoices.length === 1 ? 'voice' : 'voices'} found
                    </p>
                )}
            </div>

            {/* Voice Grid */}
            <div className="flex-1 overflow-y-auto p-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredVoices.map((voice) => (
                        <VoiceCard
                            key={voice.id}
                            voice={voice}
                            isPlaying={playingVoiceId === voice.id}
                            isSelected={selectedTempVoiceId === voice.id}
                            onPlay={() => handlePlayVoice(voice)}
                            onSelect={() => handleSelectVoice(voice.id)}
                            isConnected={isConnected}
                        />
                    ))}
                </div>

                {filteredVoices.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-64 text-center">
                        <p className="text-muted-foreground text-lg">No voices found</p>
                        <p className="text-muted-foreground text-sm mt-2">
                            Try adjusting your search terms
                        </p>
                    </div>
                )}
            </div>

            {/* Footer Actions (Desktop) */}
            {!isMobile && (
                <div className="p-4 border-t border-border/50 bg-background/50 backdrop-blur-sm flex justify-end gap-2">
                    <Button variant="outline" onClick={handleClose}>
                        Cancel
                    </Button>
                </div>
            )}
        </div>
    );

    if (isMobile) {
        return (
            <MobileOverlayWrapper
                isOpen={isOpen}
                onClose={handleClose}
                title={title}
                description="Browse and test available voices"
                maxHeight="xl"
            >
                {content}
            </MobileOverlayWrapper>
        );
    }

    // Desktop Modal
    if (!isOpen) return null;

    return (
        <>
            {/* Backdrop */}
            <div 
                className="fixed inset-0 bg-background/80 backdrop-blur-md z-50"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className="bg-background/95 backdrop-blur-xl rounded-3xl border border-border/50 shadow-2xl w-full max-w-6xl max-h-[85dvh] flex flex-col overflow-hidden"
                >
                    {/* Header */}
                    <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-foreground">{title}</h2>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Browse and test available voices
                            </p>
                        </div>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleClose}
                            className="h-9 w-9"
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>

                    {/* Content */}
                    {content}
                </motion.div>
            </div>
        </>
    );
}

interface VoiceCardProps {
    voice: AiVoice;
    isPlaying: boolean;
    isSelected: boolean;
    onPlay: () => void;
    onSelect: () => void;
    isConnected: boolean;
}

function VoiceCard({ voice, isPlaying, isSelected, onPlay, onSelect, isConnected }: VoiceCardProps) {
    return (
        <motion.div
            whileHover={{ scale: 1.02 }}
            transition={{ type: 'spring', stiffness: 300 }}
        >
            <Card className={cn(
                "h-full flex flex-col transition-all",
                isSelected && "ring-2 ring-primary shadow-lg"
            )}>
                <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                        <CardTitle className="text-base leading-tight">{voice.name}</CardTitle>
                        {isSelected && (
                            <Badge variant="default" className="ml-2 flex-shrink-0">
                                <Check className="h-3 w-3" />
                                Selected
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                        {voice.description || "No description available"}
                    </p>
                    
                    <div className="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={onPlay}
                            disabled={!isConnected}
                            className="flex-1"
                        >
                            {isPlaying ? (
                                <>
                                    <Square className="h-3 w-3 mr-1.5" />
                                    Stop
                                </>
                            ) : !isConnected ? (
                                <>
                                    <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                                    Loading
                                </>
                            ) : (
                                <>
                                    <Play className="h-3 w-3 mr-1.5" />
                                    Test
                                </>
                            )}
                        </Button>
                        <Button
                            variant={isSelected ? "default" : "outline"}
                            size="sm"
                            onClick={onSelect}
                            className="flex-1"
                        >
                            {isSelected ? "Selected" : "Select"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

