'use client';

import React, { useRef, useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { useSelectedImages, ImageSource } from '../context/SelectedImagesProvider';
import { cn } from '@/lib/utils';
// Legacy FilePreviewSheet removed in Phase 11 — clicking an image now opens
// the source URL in a new tab. Callers that need inline rich preview should
// render @/features/files FilePreview with a fileId instead.
import { QuickImagePreview } from './QuickImagePreview';
import { EnhancedFileDetails } from '@/utils/file-operations/constants';

type SizeVariant = 'xs' | 's' | 'm' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

export interface ImagePreviewRowProps {
  size?: SizeVariant;
  className?: string;
  showRemoveButton?: boolean;
  showCount?: boolean;
  emptyText?: string;
  images?: ImageSource[];
  onRemoveImage?: (id: string) => void;
}

const sizeMap = {
  xs: {
    container: 'h-8',
    image: 'h-6 w-6',
    gap: 'gap-1',
  },
  s: {
    container: 'h-10',
    image: 'h-8 w-8',
    gap: 'gap-1.5',
  },
  m: {
    container: 'h-12',
    image: 'h-10 w-10',
    gap: 'gap-2',
  },
  lg: {
    container: 'h-16',
    image: 'h-14 w-14',
    gap: 'gap-2.5',
  },
  xl: {
    container: 'h-20',
    image: 'h-18 w-18',
    gap: 'gap-3',
  },
  '2xl': {
    container: 'h-24',
    image: 'h-22 w-22',
    gap: 'gap-3',
  },
  '3xl': {
    container: 'h-32',
    image: 'h-28 w-28',
    gap: 'gap-4',
  },
  '4xl': {
    container: 'h-40',
    image: 'h-36 w-36',
    gap: 'gap-4',
  },
  '5xl': {
    container: 'h-48',
    image: 'h-44 w-44',
    gap: 'gap-5',
  },
};

// Size map for QuickImagePreview
const previewSizeMap: Record<SizeVariant, 'sm' | 'md' | 'lg'> = {
  xs: 'sm',
  s: 'sm',
  m: 'md',
  lg: 'md',
  xl: 'lg',
  '2xl': 'lg',
  '3xl': 'lg',
  '4xl': 'lg',
  '5xl': 'lg',
};

export function ImagePreviewRow({
  size = 'm',
  className = '',
  showRemoveButton = true,
  showCount = true,
  emptyText = 'No images selected',
  images,
  onRemoveImage,
}: ImagePreviewRowProps) {
  const { selectedImages: contextImages, removeImage: contextRemoveImage } = useSelectedImages();
  
  const selectedImages = images || contextImages;
  
  const removeImage = onRemoveImage || contextRemoveImage;
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [showScrollButtons, setShowScrollButtons] = useState(false);
  // Legacy previewFile state removed in Phase 11.
  
  useEffect(() => {
    const checkScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollWidth, clientWidth } = scrollContainerRef.current;
      setShowScrollButtons(scrollWidth > clientWidth);
    };
    
    checkScroll();
    
    // Set up resize observer to check when container size changes
    const resizeObserver = new ResizeObserver(checkScroll);
    if (scrollContainerRef.current) {
      resizeObserver.observe(scrollContainerRef.current);
    }
    
    return () => {
      resizeObserver.disconnect();
    };
  }, [selectedImages]);
  
  const scroll = (direction: 'left' | 'right') => {
    if (!scrollContainerRef.current) return;
    
    const { current: container } = scrollContainerRef;
    const scrollAmount = direction === 'left' ? -200 : 200;
    
    container.scrollBy({
      left: scrollAmount,
      behavior: 'smooth'
    });
  };

  // Use QuickImagePreview for xs, s, m, and lg sizes
  const shouldUseQuickPreview = ['xs', 's', 'm', 'lg'].includes(size);
  // Determine appropriate preview size based on thumbnail size
  const previewSize = previewSizeMap[size];

  if (selectedImages.length === 0) {
    return (
      <div className={cn(
        "flex items-center justify-center text-sm text-gray-500 dark:text-gray-400 border border-dashed border-gray-300 dark:border-gray-600 rounded-md",
        sizeMap[size].container,
        className
      )}>
        {emptyText}
      </div>
    );
  }

  const handleRemoveImage = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    removeImage(id);
  };

  const handleImageClick = (image: ImageSource) => {
    if (typeof window !== "undefined") {
      window.open(image.url, "_blank", "noopener,noreferrer");
    }
  };

  const renderImage = (image: ImageSource) => {
    const imageElement = (
      <div className="relative h-full w-full">
        <img
          src={image.url}
          alt={image.metadata?.description || "Selected image"}
          className="h-full w-full object-cover"
          loading="lazy"
        />
        {showRemoveButton && (
          <button
            onClick={(e) => handleRemoveImage(e, image.id)}
            className="absolute -top-1 -right-1 bg-gray-200 dark:bg-gray-700 rounded-full p-0.5 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
            aria-label="Remove image"
          >
            <X className={cn(size === 'xs' ? 'h-2 w-2' : 'h-3 w-3')} />
          </button>
        )}
      </div>
    );

    // For smaller and medium sizes, use QuickImagePreview for hovering
    if (shouldUseQuickPreview) {
      return (
        <QuickImagePreview 
          image={image}
          position="top"
          size={previewSize}
          delay={300}
        >
          <div
            className={cn(
              "flex-shrink-0 relative rounded-md overflow-hidden cursor-pointer transition-transform hover:scale-105",
              sizeMap[size].image
            )}
            onClick={() => handleImageClick(image)}
          >
            {imageElement}
          </div>
        </QuickImagePreview>
      );
    }

    // For larger sizes, just use the regular click to open FilePreviewSheet
    return (
      <div
        className={cn(
          "flex-shrink-0 relative rounded-md overflow-hidden cursor-pointer transition-transform hover:scale-105",
          sizeMap[size].image
        )}
        onClick={() => handleImageClick(image)}
      >
        {imageElement}
      </div>
    );
  };

  return (
    <>
      <div className={cn("relative w-full", className)}>
        {showScrollButtons && (
          <>
            <button 
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-textured rounded-full shadow-md p-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Scroll left"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>
            
            <button 
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-textured rounded-full shadow-md p-1 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              aria-label="Scroll right"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </>
        )}
        
        <div
          ref={scrollContainerRef}
          className={cn(
            "flex overflow-x-auto scrollbar-hide px-1 py-1 bg-textured border-border rounded-md",
            sizeMap[size].container,
            sizeMap[size].gap
          )}
        >
          {selectedImages.map((image) => (
            <React.Fragment key={image.id}>
              {renderImage(image)}
            </React.Fragment>
          ))}
        </div>
        
        {showCount && selectedImages.length > 0 && (
          <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
            {/* read-gate-exempt: images the person selected, shown only when there are some, not a fetched count */}
            {selectedImages.length}
          </div>
        )}
      </div>

    </>
  );
} 