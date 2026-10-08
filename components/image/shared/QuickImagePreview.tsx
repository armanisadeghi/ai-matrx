'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ImageSource } from '../context/SelectedImagesProvider';

interface QuickImagePreviewProps {
  children: React.ReactNode;
  image: ImageSource;
  delay?: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
  size?: 'sm' | 'md' | 'lg';
}

const sizeMap = {
  sm: { width: 150, height: 100 },
  md: { width: 200, height: 150 },
  lg: { width: 250, height: 180 },
};

export function QuickImagePreview({
  children,
  image,
  delay = 500,
  position = 'top',
  size = 'md',
}: QuickImagePreviewProps) {
  const [showPreview, setShowPreview] = useState(false);
  const [previewPosition, setPreviewPosition] = useState({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const calculatePosition = () => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const { width: previewWidth, height: previewHeight } = sizeMap[size];
    
    // Get viewport dimensions
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let x = 0;
    let y = 0;
    
    // Calculate base position with offsets
    switch (position) {
      case 'top':
        x = rect.left + rect.width / 2;
        // Add horizontal offset to avoid cursor overlap
        x += 20; 
        // Ensure preview doesn't go off-screen
        x = Math.min(Math.max(previewWidth / 2 + 10, x), viewportWidth - previewWidth / 2 - 10);
        y = rect.top - 20; // Additional vertical offset
        break;
      case 'bottom':
        x = rect.left + rect.width / 2;
        // Add horizontal offset to avoid cursor overlap
        x += 30;
        // Ensure preview doesn't go off-screen
        x = Math.min(Math.max(previewWidth / 2 + 10, x), viewportWidth - previewWidth / 2 - 10);
        y = rect.bottom + 20; // Additional vertical offset
        break;
      case 'left':
        x = rect.left - previewWidth / 2 - 20; // Additional horizontal offset
        y = rect.top + rect.height / 2;
        // Add vertical offset to avoid cursor overlap
        y -= 15;
        break;
      case 'right':
        x = rect.right + previewWidth / 2 + 20; // Additional horizontal offset
        y = rect.top + rect.height / 2;
        // Add vertical offset to avoid cursor overlap
        y -= 15;
        break;
    }
    
    // Adjust for screen boundaries
    if (position === 'top' && y - previewHeight < 0) {
      // If it would go off the top of the screen, flip to bottom
      y = rect.bottom + 20;
      position = 'bottom' as 'bottom';
    } else if (position === 'bottom' && y + previewHeight > viewportHeight) {
      // If it would go off the bottom of the screen, flip to top
      y = rect.top - 20;
      position = 'top' as 'top';
    }
    
    setPreviewPosition({ x, y });
  };

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      calculatePosition();
      setShowPreview(true);
    }, delay);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setShowPreview(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      
      <AnimatePresence>
        {showPreview && (
          <div className="fixed top-0 left-0 w-full h-0 overflow-visible pointer-events-none z-[9999]">
            {/* Outer box owns placement (translate); the motion child owns scale/y so they never fight over `transform`. */}
            <div
              className="absolute"
              style={{
                width: sizeMap[size].width,
                left: `${previewPosition.x}px`,
                top: `${previewPosition.y}px`,
                transform: `translate(-50%, ${position === 'bottom' ? '0' : '-100%'})`,
              }}
            >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: position === 'bottom' ? -10 : 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: position === 'bottom' ? -10 : 10 }}
              transition={{ duration: 0.15 }}
              className="relative shadow-lg rounded-lg overflow-hidden bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700"
            >
              <div className="p-1">
                <div className="relative overflow-hidden rounded">
                  <img
                    src={image.url}
                    alt={image.metadata?.description || 'Preview'}
                    className="w-full h-auto object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect width='18' height='18' x='3' y='3' rx='2' ry='2'/%3E%3Ccircle cx='9' cy='9' r='2'/%3E%3Cpath d='m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21'/%3E%3C/svg%3E";
                      target.className = "w-12 h-12 text-gray-400 mx-auto";
                    }}
                  />
                </div>
                
                {image.metadata?.title && (
                  <p className="mt-1 text-xs text-center text-gray-600 dark:text-gray-400 truncate">
                    {image.metadata.title}
                  </p>
                )}
              </div>
              
              {position === 'top' && (
                <div className="absolute left-1/2 top-full w-4 h-4 bg-white dark:bg-zinc-800 border-b border-r border-zinc-200 dark:border-zinc-700 transform rotate-45 -translate-y-2 -translate-x-1/2"></div>
              )}
              
              {position === 'bottom' && (
                <div className="absolute left-1/2 bottom-full w-4 h-4 bg-white dark:bg-zinc-800 border-t border-l border-zinc-200 dark:border-zinc-700 transform rotate-45 translate-y-2 -translate-x-1/2"></div>
              )}
            </motion.div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
} 