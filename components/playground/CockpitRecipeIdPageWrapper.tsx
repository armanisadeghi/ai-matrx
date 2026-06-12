'use client';

import React, { useState, useEffect } from 'react';
import CockpitRecipeIdPage from '@/components/playground/CockpitRecipeIdPage';
import { LoadingSpinner } from '@/components/ui/spinner';

interface CockpitRecipeIdPageWrapperProps {
    recipeId: string;
}

/**
 * Wrapper component that forces a complete dismount/remount cycle when the recipeId changes.
 * This ensures all hooks and state are properly cleaned up and re-initialized.
 */
export default function CockpitRecipeIdPageWrapper({ recipeId }: CockpitRecipeIdPageWrapperProps) {
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [currentRecipeId, setCurrentRecipeId] = useState(recipeId);
    const [mountedRecipeId, setMountedRecipeId] = useState<string | null>(null);

    useEffect(() => {
        if (currentRecipeId !== recipeId) {
            // Recipe ID has changed - force dismount
            setIsTransitioning(true);
            setMountedRecipeId(null);

            // Brief delay to ensure complete unmount
            const dismountTimer = setTimeout(() => {
                setCurrentRecipeId(recipeId);
                setMountedRecipeId(recipeId);
                setIsTransitioning(false);
            }, 100);

            return () => clearTimeout(dismountTimer);
        } else if (mountedRecipeId === null) {
            // Initial mount
            setMountedRecipeId(recipeId);
        }
    }, [recipeId, currentRecipeId, mountedRecipeId]);

    // Show loading state during transition
    if (isTransitioning || mountedRecipeId === null || mountedRecipeId !== recipeId) {
        return (
            <div className="h-[calc(100dvh-3rem)] lg:h-[calc(100dvh-2.5rem)] flex items-center justify-center bg-textured">
                <div className="flex flex-col items-center gap-4">
                    <LoadingSpinner size="xl" />
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        Loading recipe...
                    </p>
                </div>
            </div>
        );
    }

    // Render the actual component with a unique key to ensure React treats it as a new instance
    return <CockpitRecipeIdPage key={mountedRecipeId} recipeId={mountedRecipeId} />;
}

