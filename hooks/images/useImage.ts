'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useClipboard } from '@/hooks/useClipboard';
import useDownloadImage from '@/hooks/images/useDownloadImage';

export interface ImageDimensions {
    width: number;
    height: number;
}

export const DEFAULT_IMAGE_SIZES = {
    'thumbnail-small': { width: 100, height: 100 },
    'thumbnail-medium': { width: 250, height: 250 },
    'thumbnail-large': { width: 350, height: 350 },
    'image-medium': { width: 500, height: 500 },
    'image-large': { width: 756, height: 756 },
    fullscreen: { width: 0, height: 0 } // Default to zero, will update later
} as const;

interface UseImageResult {
    isFullscreen: boolean;
    setIsFullscreen: (state: boolean) => void;
    imageRef: React.RefObject<HTMLImageElement | null>;
    handleClickOutside: (e: React.MouseEvent) => void;
    zoom: number;
    handleZoomIn: (e: React.MouseEvent) => void;
    handleZoomOut: (e: React.MouseEvent) => void;
    resetZoom: () => void;
    handleCopyImage: (e: React.MouseEvent) => void;
    handleCopyLink: (e: React.MouseEvent) => void;
    downloadImage: (e: React.MouseEvent) => void;
    dimensions: ImageDimensions;
}

export const useImage = (src: string, alt: string, sizeKey: keyof typeof DEFAULT_IMAGE_SIZES = 'thumbnail-medium', customDimensions?: Partial<ImageDimensions>): UseImageResult => {
    const [isFullscreen, setIsFullscreen] = useState(false);
    const imageRef = useRef<HTMLImageElement>(null);
    const { copyImage, copyLink } = useClipboard();
    const downloadImage = useDownloadImage(src, alt);
    const [zoom, setZoom] = useState(1);
    const [dimensions, setDimensions] = useState<ImageDimensions>({
        width: 0,
        height: 0,
    });

    // Handle image dimensions, including custom dimensions and fullscreen
    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            const aspectRatio = img.width / img.height;
            const defaultSize = DEFAULT_IMAGE_SIZES[sizeKey];
            const width = customDimensions?.width ?? defaultSize.width;
            const height = customDimensions?.height ?? defaultSize.height;

            if (sizeKey === 'fullscreen') {
                // Access window only on the client side
                const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 0;
                const screenHeight = typeof window !== 'undefined' ? window.innerHeight : 0;

                if (aspectRatio > 1) {
                    const scaledHeight = screenWidth / aspectRatio;
                    setDimensions({
                        width: screenWidth,
                        height: Math.min(scaledHeight, screenHeight),
                    });
                } else {
                    const scaledWidth = screenHeight * aspectRatio;
                    setDimensions({
                        width: Math.min(scaledWidth, screenWidth),
                        height: screenHeight,
                    });
                }
            } else if (aspectRatio > 1) {
                setDimensions({
                    width: width,
                    height: width / aspectRatio,
                });
            } else {
                setDimensions({
                    width: height * aspectRatio,
                    height: height,
                });
            }
        };
        img.src = src;

        return () => {
            img.onload = null;
        };
    }, [src, sizeKey, customDimensions]);

    // Handle full-screen with ESC key and clicking outside the image
    useEffect(() => {
        const handleKeydown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && isFullscreen) {
                setIsFullscreen(false);
            }
        };

        if (isFullscreen) {
            window.addEventListener('keydown', handleKeydown);
        }

        return () => {
            window.removeEventListener('keydown', handleKeydown);
        };
    }, [isFullscreen]);

    const handleClickOutside = (e: React.MouseEvent) => {
        if (imageRef.current && !imageRef.current.contains(e.target as Node)) {
            setIsFullscreen(false);
        }
    };

    // Zoom functionality
    const handleZoomIn = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setZoom(prevZoom => Math.min(3, prevZoom + 0.1));
    }, []);

    const handleZoomOut = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setZoom(prevZoom => Math.max(0.5, prevZoom - 0.1));
    }, []);

    const resetZoom = () => setZoom(1);

    // Image actions: copy image, copy link, and download image
    const handleCopyImage = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        await copyImage(src);
    }, [copyImage, src]);

    const handleCopyLink = useCallback(async (e: React.MouseEvent) => {
        e.stopPropagation();
        await copyLink(src);
    }, [copyLink, src]);

    return {
        isFullscreen,
        setIsFullscreen,
        imageRef,
        handleClickOutside,
        zoom,
        handleZoomIn,
        handleZoomOut,
        resetZoom,
        handleCopyImage,
        handleCopyLink,
        downloadImage,
        dimensions,
    };
};
