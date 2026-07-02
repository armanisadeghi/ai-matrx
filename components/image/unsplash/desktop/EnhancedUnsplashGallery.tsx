'use client';
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { useUnsplashGallery, type SortOrder, type ImageOrientation, type PremiumFilter } from '@/hooks/images/useUnsplashGallery';
import { DesktopImageCard } from '../../shared/DesktopImageCard';
import { EnhancedImageViewer } from './EnhancedImageViewer';
import { useToast } from '@/components/ui/use-toast';
import EmptyStateCard from '@/components/official/cards/EmptyStateCard';
import { ImageOff, Loader2 } from 'lucide-react';
import { UnsplashSearch } from '../UnsplashSearch';

export interface Photo {
    id: string;
    alt_description?: string;
    description?: string | null;
    links: {
        html: string;
        download_location: string;
    };
    user: {
        name: string;
    };
    urls: {
        regular: string;
        thumb: string;
        full?: string;
        raw?: string;
    };
    exif?: {
        make?: string;
        model?: string;
        aperture?: string;
        exposure_time?: string;
        iso?: number;
    };
}

export interface EnhancedUnsplashGalleryProps {
    initialSearchTerm?: string;
}

export function EnhancedUnsplashGallery({ initialSearchTerm }: EnhancedUnsplashGalleryProps) {
    const {
        photos,
        loading,
        hasMore,
        selectedPhoto,
        relatedPhotos,
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

    const [viewMode, setViewMode] = useState<'grid' | 'natural'>('grid');
    const { toast } = useToast();
    const observer = useRef<IntersectionObserver | null>(null);
    const [searchQuery, setSearchQuery] = useState(initialSearchTerm || 'ai');
    const [isSharing, setIsSharing] = useState(false);

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

    const handleShare = async (photo: Photo) => {
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

    const handleImageInfo = (photo: Photo) => {
        toast({
            title: 'Image Information',
            description: `Taken with ${photo.exif?.make || 'Unknown make'} ${
                photo.exif?.model || 'Unknown model'
            }, 
                    f/${photo.exif?.aperture || 'N/A'}, 
                    ${photo.exif?.exposure_time || 'N/A'}s, 
                    ISO ${photo.exif?.iso || 'N/A'}`,
        });
    };

    const handleSearchChange = (
        query: string,
        options: { sortOrder?: SortOrder; orientation?: ImageOrientation; premiumFilter?: PremiumFilter } = {},
    ) => {
        setSearchQuery(query);
        handleSearch(query, options);
    };

    const handleViewModeChange = (mode: 'grid' | 'natural') => {
        setViewMode(mode);
    };

    const displayQuery = searchQuery.trim();
    const resultTitle = displayQuery ? `Results for "${displayQuery}"` : 'Search Unsplash';
    const resultCountLabel = loading ? '...' : `${photos.length}`;
    const resultUnitLabel = photos.length === 1 ? 'image loaded' : 'images loaded';
    const showEmptyState = !loading && photos.length === 0;

    useEffect(() => {
        handleSearch(searchQuery);
    }, []);

    return (
        <div className="w-full space-y-4">
            <section className="w-full space-y-2">
                <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-foreground">
                            {resultTitle}
                        </h3>
                    </div>
                    <div
                        className="shrink-0 flex items-center gap-2 rounded-md border border-border/80 bg-card/55 px-3 py-1.5 text-right shadow-sm"
                        aria-live="polite"
                    >
                        <div className="text-base font-semibold leading-none text-foreground">
                            {resultCountLabel}
                        </div>
                        <div className="text-[10px] font-medium uppercase text-muted-foreground">
                            {loading ? 'Searching' : resultUnitLabel}
                        </div>
                    </div>
                </div>
                <UnsplashSearch
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
                    viewMode={viewMode}
                    onViewModeChange={handleViewModeChange}
                />
            </section>

            {showEmptyState ? (
                <div className="rounded-md border border-dashed border-border/80 bg-card/30">
                    <EmptyStateCard
                        title="No images loaded"
                        description="Try a different search term or adjust the filters to find Unsplash images."
                        icon={ImageOff}
                    />
                </div>
            ) : (
                <div className={`grid grid-cols-1 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 ${viewMode === 'natural' ? 'items-start' : ''}`}>
                    {photos.map((photo, index) => (
                        <div
                            key={`${photo.id}-${index}`}
                            ref={index === photos.length - 1 ? lastPhotoElementRef : undefined}
                        >
                            <DesktopImageCard 
                                photo={photo} 
                                onClick={() => handlePhotoClick(photo)}
                                viewMode={viewMode}
                            />
                        </div>
                    ))}
                </div>
            )}

            {loading && (
                <div className="flex justify-center items-center h-24">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
            )}

            <AnimatePresence>
                {selectedPhoto && (
                    // useUnsplashGallery() declares `photos` as `UnsplashPhoto[]` (a minimal
                    // {id, tags?, links.download_location} shape), but the Unsplash search API
                    // it actually calls returns the full `Basic` photo object (urls, user,
                    // links.html, exif, ...) - see unsplash-js's methods/photos/types.d.ts and
                    // hooks/images/useUnsplashGallery.ts's `setPhotos(result.response.results)`.
                    // The hook's declared type is narrower than its real return data; `Photo`
                    // here models the real shape. Widening `UnsplashPhoto` is an out-of-scope
                    // hook fix - tracked as a decision brief rather than papered over with `any`.
                    <EnhancedImageViewer
                        photos={photos as Photo[]}
                        initialIndex={photos.findIndex((photo) => photo.id === selectedPhoto.id)}
                        onClose={closePhotoView}
                        onDownload={downloadImage}
                        onFavorite={toggleFavorite}
                        onShare={handleShare}
                        onInfo={handleImageInfo}
                        isFavorite={(photo) => favorites.some((fav) => fav.id === photo.id)}
                        onRelatedPhotoClick={handlePhotoClick}
                        loadMorePhotos={loadMore}
                        isSharing={isSharing}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
