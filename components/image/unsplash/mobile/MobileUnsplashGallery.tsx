'use client';
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { useUnsplashGallery } from '@/hooks/images/useUnsplashGallery';
import { MobileImageCard } from '@/components/image/shared/MobileImageCard';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { MobileUnsplashViewer } from './MobileUnsplashViewer';
import { MobileUnsplashSearch } from './MobileUnsplashSearch';

interface MobileUnsplashGalleryProps {
    initialSearchTerm?: string;
}

export function MobileUnsplashGallery({ initialSearchTerm }: MobileUnsplashGalleryProps) {
    const {
        photos,
        loading,
        hasMore,
        selectedPhoto,
        favorites,
        handleSearch,
        loadMore,
        handlePhotoClick,
        closePhotoView,
        toggleFavorite,
        downloadImage,
        currentSortOrder,
        currentOrientation,
        currentPremiumFilter,
        sortOrderOptions,
        orientationOptions,
        premiumFilterOptions
    } = useUnsplashGallery();

    const { toast } = useToast();
    const observer = useRef<IntersectionObserver | null>(null);
    const [searchQuery, setSearchQuery] = useState(initialSearchTerm || 'ai');
    const [isSharing, setIsSharing] = useState(false);

    // Perform initial search when component mounts
    useEffect(() => {
        if (searchQuery) {
            handleSearch(searchQuery);
        }
    }, []);

    const lastPhotoElementRef = useCallback(
        (node: HTMLDivElement | null) => {
            if (loading) return;
            if (observer.current) observer.current.disconnect();
            observer.current = new IntersectionObserver((entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    loadMore();
                }
            });
            if (node) observer.current.observe(node);
        },
        [loading, hasMore, loadMore]
    );

    const handleShare = async (photo: any) => {
        try {
            const imageUrl = photo.urls.full || photo.urls.regular;
            await navigator.clipboard.writeText(imageUrl);
            setIsSharing(true);
            toast({
                title: 'Image link copied',
                description: 'The direct image URL has been copied to your clipboard.',
            });
            setTimeout(() => setIsSharing(false), 2000);
        } catch (err) {
            console.error('Failed to copy: ', err);
            toast({
                title: 'Copy failed',
                description: 'There was an issue copying the link.',
                variant: 'destructive',
            });
        }
    };

    const handleImageInfo = (photo: any) => {
        toast({
            title: 'Image Information',
            description: `Taken with ${photo.exif?.make || 'Unknown make'} ${
                photo.exif?.model || 'Unknown model'
            }, f/${photo.exif?.aperture || 'N/A'}, ${photo.exif?.exposure_time || 'N/A'}s, ISO ${photo.exif?.iso || 'N/A'}`,
        });
    };

    const handleSearchChange = (query: string, options: any = {}) => {
        setSearchQuery(query);
        handleSearch(query, options);
    };

    // Convert Unsplash photos to the format our mobile components expect
    const formatPhotoForMobile = (photo: any) => ({
        ...photo,
        description: photo.alt_description || `Photo by ${photo.user.name}`,
    });

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-foreground">
                        {searchQuery.trim() ? `Results for "${searchQuery.trim()}"` : 'Search Unsplash'}
                    </h3>
                    <p className="text-xs text-muted-foreground" aria-live="polite">
                        {loading ? 'Searching...' : `${photos.length} images loaded`}
                    </p>
                </div>
            </div>

            <MobileUnsplashSearch
                onSearch={handleSearchChange}
                loading={loading}
                initialSearchTerm={searchQuery}
                className="w-full"
                currentSortOrder={currentSortOrder}
                currentOrientation={currentOrientation}
                currentPremiumFilter={currentPremiumFilter}
                sortOrderOptions={sortOrderOptions}
                orientationOptions={orientationOptions}
                premiumFilterOptions={premiumFilterOptions}
            />
            
            <div className="grid grid-cols-2 gap-2">
                {photos.map((photo, index) => (
                    <div
                        key={photo.id}
                        ref={index === photos.length - 1 ? lastPhotoElementRef : undefined}
                    >
                        <MobileImageCard 
                            photo={{
                                id: photo.id,
                                url: photo.urls.regular,
                                description: photo.alt_description || `Photo by ${photo.user.name}`
                            }}
                            onClick={() => handlePhotoClick(photo)}
                        />
                    </div>
                ))}
            </div>
            
            {loading && (
                <div className="flex justify-center items-center h-16">
                    <Loader2 className="h-6 w-6 animate-spin text-primary"/>
                </div>
            )}
            
            <AnimatePresence>
                {selectedPhoto && (
                    <MobileUnsplashViewer
                        photos={photos}
                        initialIndex={photos.findIndex((photo) => photo.id === selectedPhoto.id)}
                        onClose={closePhotoView}
                        onDownload={downloadImage}
                        onFavorite={toggleFavorite}
                        onShare={handleShare}
                        onInfo={handleImageInfo}
                        isFavorite={(photo) => favorites.some((fav) => fav.id === photo.id)}
                        isSharing={isSharing}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
