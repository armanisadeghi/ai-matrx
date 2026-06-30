import { useState, useEffect } from 'react';

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
    fullscreen: { width: window.innerWidth, height: window.innerHeight }
} as const;

const useImageDimensions = (src: string, sizeKey: keyof typeof DEFAULT_IMAGE_SIZES = 'thumbnail-medium', customDimensions?: Partial<ImageDimensions>) => {
    const [dimensions, setDimensions] = useState<ImageDimensions>({
        width: 0,
        height: 0,
    });

    useEffect(() => {
        const img = new Image();
        img.onload = () => {
            const aspectRatio = img.width / img.height;
            const defaults = DEFAULT_IMAGE_SIZES[sizeKey];
            const width = customDimensions?.width ?? defaults.width;
            const height = customDimensions?.height ?? defaults.height;

            if (sizeKey === 'fullscreen') {
                const screenWidth = window.innerWidth;
                const screenHeight = window.innerHeight;

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

    return dimensions;
};

export default useImageDimensions;
