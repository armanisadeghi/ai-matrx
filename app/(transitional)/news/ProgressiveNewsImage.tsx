// components/ProgressiveNewsImage.tsx
import React, { Suspense } from 'react';
import Image from 'next/image';
import { ImageIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface ProgressiveNewsImageProps {
    src: string;
    alt: string;
    onError: () => void;
    priority?: boolean;
}

const ImageLoader = ({ src, alt, onError, priority = false }: ProgressiveNewsImageProps) => {
    return (
        <>
            <Image
                src={src}
                alt={alt}
                fill
                sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                onError={onError}
                priority={priority}
                loading={priority ? "eager" : "lazy"}
            />
            <div className="absolute inset-0 bg-black opacity-0 group-hover:opacity-10 transition-opacity" />
        </>
    );
};

export const ImagePlaceholder = () => (
    <div className="absolute inset-0 bg-muted flex items-center justify-center">
        <ImageIcon className="h-12 w-12 text-muted-foreground opacity-50" />
    </div>
);

export const LoadingSkeleton = () => (
    <div className="h-48 w-full">
        <Skeleton className="h-full w-full" />
    </div>
);

export const ProgressiveNewsImage = (props: ProgressiveNewsImageProps) => {
    return (
        <div className="relative w-full h-48 overflow-hidden bg-muted">
            <Suspense fallback={<LoadingSkeleton />}>
                <ImageLoader {...props} />
            </Suspense>
        </div>
    );
};
