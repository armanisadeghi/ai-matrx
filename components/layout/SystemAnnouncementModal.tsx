'use client';

import React, { useState, useEffect } from 'react';
import { AlertCircle, AlertTriangle, Info, Megaphone, X } from 'lucide-react';
import { SystemAnnouncement, AnnouncementType } from '@/types/feedback.types';
import { useAppDispatch, useAppSelector } from '@/lib/redux/hooks';
import { setModulePreferences } from '@/lib/redux/preferences/userPreferencesSlice';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { renderAnnouncementMessage } from '@/utils/render-announcement-message';

interface SystemAnnouncementModalProps {
    announcement: SystemAnnouncement;
}

const announcementIcons: Record<AnnouncementType, React.ReactNode> = {
    info: <Info className="w-12 h-12 text-blue-500" />,
    warning: <AlertTriangle className="w-12 h-12 text-yellow-500" />,
    critical: <AlertCircle className="w-12 h-12 text-red-500" />,
    update: <Megaphone className="w-12 h-12 text-purple-500" />,
};

const announcementStyles: Record<AnnouncementType, string> = {
    info: 'border-blue-500 bg-blue-50 dark:bg-blue-950/20',
    warning: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
    critical: 'border-red-500 bg-red-50 dark:bg-red-950/20',
    update: 'border-purple-500 bg-purple-50 dark:bg-purple-950/20',
};

export default function SystemAnnouncementModal({ announcement }: SystemAnnouncementModalProps) {
    const dispatch = useAppDispatch();
    const viewedAnnouncements = useAppSelector(state => state.userPreferences.system.viewedAnnouncements);
    const [isOpen, setIsOpen] = useState(false);
    const [canClose, setCanClose] = useState(false);
    const [timeRemaining, setTimeRemaining] = useState(announcement.min_display_seconds);

    // Check if user has already viewed this announcement
    useEffect(() => {
        if (!viewedAnnouncements.includes(announcement.id)) {
            setIsOpen(true);
            // Start countdown timer
            const timer = setInterval(() => {
                setTimeRemaining(prev => {
                    if (prev <= 1) {
                        setCanClose(true);
                        clearInterval(timer);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [announcement.id, viewedAnnouncements]);

    const handleClose = async (dontShowAgain: boolean = false) => {
        if (!canClose && !dontShowAgain) return;

        setIsOpen(false);

        if (dontShowAgain) {
            // Mark this announcement as viewed. The sync engine's
            // userPreferencesPolicy debounces this change to Supabase
            // automatically (≤250ms); no explicit save dispatch needed.
            const updatedViewedAnnouncements = [...viewedAnnouncements, announcement.id];
            dispatch(setModulePreferences({
                module: 'system',
                preferences: {
                    viewedAnnouncements: updatedViewedAnnouncements,
                },
            }));
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-300">
            <Card 
                className={`
                    relative max-w-2xl w-full max-h-[90vh] overflow-y-auto
                    border-4 shadow-2xl animate-in zoom-in duration-300
                    ${announcementStyles[announcement.announcement_type]}
                `}
            >
                {/* Close button - only enabled after timer */}
                {canClose && (
                    <button
                        onClick={() => handleClose(false)}
                        className="absolute top-4 right-4 p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                        aria-label="Close"
                    >
                        <X className="w-5 h-5" />
                    </button>
                )}

                {/* Content */}
                <div className="p-8">
                    {/* Icon and Timer */}
                    <div className="flex items-start justify-between mb-6">
                        <div className="flex-shrink-0">
                            {announcementIcons[announcement.announcement_type]}
                        </div>
                        {!canClose && (
                            <div className="text-sm text-gray-600 dark:text-gray-400 font-medium">
                                Please read ({timeRemaining}s)
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">
                        {announcement.title}
                    </h2>

                    {/* Message */}
                    <div className="prose dark:prose-invert max-w-none mb-8">
                        <p className="text-lg text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                            {renderAnnouncementMessage(announcement.message)}
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 justify-end">
                        <Button
                            variant="outline"
                            onClick={() => handleClose(false)}
                            disabled={!canClose}
                            className="min-w-[120px]"
                        >
                            Close
                        </Button>
                        <Button
                            onClick={() => handleClose(true)}
                            disabled={!canClose}
                            className="min-w-[120px]"
                        >
                            Don't Show Again
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
}

