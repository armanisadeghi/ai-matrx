'use client';
import React, { useRef, useCallback, useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import {
    useUnsplashGallery,
    type UnsplashPhoto,
    type SortOrder,
    type ImageOrientation,
    type PremiumFilter,
} from '@/hooks/images/useUnsplashGallery';
import { MobileImageCard } from '@/components/image/shared/MobileImageCard';
import { useToast } from '@/components/ui/use-toast';
import { Loader2 } from 'lucide-react';
import { MobileUnsplashViewer } from './MobileUnsplashViewer';
import { MobileUnsplashSearch } from './MobileUnsplashSearch';

interface MobileUnsplashGalleryProps {
    initialSearchTerm?: string;
}

export type UnsplashDisplayPhoto = UnsplashPhoto & {
    urls: { regular: string; full?: string };
    alt_description?: string | null;
    description?: string | null;
    user: { name: string };
};

function isDisplayPhoto(photo: UnsplashPhoto): photo is UnsplashDisplayPhoto {
    return (
        'urls' in photo &&
        typeof photo.urls === 'object' &&
        photo.urls !== null &&
        'regular' in photo.urls &&
        typeof photo.urls.regular === 'string' &&
        'user' in photo &&
        typeof photo.user === 'object' &&
        photo.user !== null &&
        'name' in photo.user &&
        typeof photo.user.name === 'string'
    );
}

function getPhotoCardProps(photo: UnsplashPhoto): {
    id: string;
    url: string;
    description: string;
} {
    if (!isDisplayPhoto(photo)) {
        return { id: photo.id, url: '', description: 'Photo' };
    }
    return {
        id: photo.id,
        url: photo.urls.regular,
        description: photo.alt_description ?? `Photo by ${photo.user.name}`,
    };
}

interface UnsplashExifData {
    make?: string | null;
    model?: string | null;
    aperture?: string | null;
    exposure_time?: string | null;
    iso?: number | null;
}

type UnsplashPhotoWithExif = UnsplashPhoto & { exif: UnsplashExifData };

function hasExifData(photo: UnsplashPhoto): photo is UnsplashPhotoWithExif {
    return 'exif' in photo && typeof photo.exif === 'object' && photo.exif !== null;
}

function getExifData(photo: UnsplashPhoto): UnsplashExifData | undefined {
    return hasExifData(photo) ? photo.exif : undefined;
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

    const handleShare = async (photo: UnsplashPhoto) => {
        if (!isDisplayPhoto(photo)) return;
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

    const handleImageInfo = (photo: UnsplashPhoto) => {
        const exif = getExifData(photo);
        toast({
            title: 'Image Information',
            description: `Taken with ${exif?.make || 'Unknown make'} ${
                exif?.model || 'Unknown model'
            }, f/${exif?.aperture || 'N/A'}, ${exif?.exposure_time || 'N/A'}s, ISO ${exif?.iso || 'N/A'}`,
        });
    };

    const handleSearchChange = (
        query: string,
        options: { sortOrder?: SortOrder; orientation?: ImageOrientation; premiumFilter?: PremiumFilter } = {},
    ) => {
        setSearchQuery(query);
        handleSearch(query, options);
    };

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
                            photo={getPhotoCardProps(photo)}
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
                    // See isDisplayPhoto/UnsplashDisplayPhoto above - useUnsplashGallery()
                    // declares `photos` as the minimal `UnsplashPhoto` shape, but the Unsplash
                    // search API it calls actually returns the full photo object (urls, user,
                    // description, ...) that MobileUnsplashViewer renders. Widening the hook's
                    // declared `UnsplashPhoto` type is out of this component's scope.
                    <MobileUnsplashViewer
                        photos={photos as UnsplashDisplayPhoto[]}
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
