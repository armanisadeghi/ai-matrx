'use client';

import React, { useState, useRef, useEffect } from 'react';
import { tailwindColors } from '@/constants/tailwind-colors';
import { Popover, PopoverContent, PopoverTrigger } from '@ai-matrx/design-system';
import { cn } from '@/lib/utils';

export interface TailwindColorPickerProps {
  /**
   * The currently selected color (e.g., "blue", "red", "gray")
   */
  selectedColor?: string;
  
  /**
   * Callback fired when a color is selected
   */
  onColorChange: (color: string) => void;
  
  /**
   * Optional additional classes for the color square
   */
  className?: string;
  
  /**
   * The size of the color square
   */
  size?: 'sm' | 'md' | 'lg';
  
  /**
   * Custom size in pixels (overrides the size prop if provided)
   */
  customSize?: number;
  
  /**
   * Label to display inside the color square
   */
  label?: string;
}

// Helper function to determine if a color is light or dark
const isLightColor = (hexColor: string): boolean => {
  // Convert hex to RGB
  const r = parseInt(hexColor.substring(1, 3), 16);
  const g = parseInt(hexColor.substring(3, 5), 16);
  const b = parseInt(hexColor.substring(5, 7), 16);
  
  // Calculate perceived brightness using the formula
  // (0.299*R + 0.587*G + 0.114*B)
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  // If brightness > 128, color is considered light
  return brightness > 128;
};

export function TailwindColorPicker({
  selectedColor = 'Gray',
  onColorChange,
  className = '',
  size = 'md',
  customSize,
  label = 'Color'
}: TailwindColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedColorObj, setSelectedColorObj] = useState(() => {
    // Convert the selectedColor to title case for matching
    const titleCaseColor = selectedColor.charAt(0).toUpperCase() + selectedColor.slice(1).toLowerCase();
    // Find exact match first
    const exactMatch = tailwindColors.find(c => c.name === titleCaseColor);
    if (exactMatch) return exactMatch;
    // Find case-insensitive match
    const caseInsensitiveMatch = tailwindColors.find(c => 
      c.name.toLowerCase() === selectedColor.toLowerCase()
    );
    return caseInsensitiveMatch || tailwindColors.find(c => c.name === 'Gray');
  });

  // Update the selected color object when the selectedColor prop changes
  useEffect(() => {
    if (!selectedColor) return; // Skip if no color provided
    
    // Convert the selectedColor to title case for matching
    const titleCaseColor = selectedColor.charAt(0).toUpperCase() + selectedColor.slice(1).toLowerCase();
    
    // First try exact match with title case
    let colorObj = tailwindColors.find(c => c.name === titleCaseColor);
    
    // If no match, try case-insensitive match
    if (!colorObj) {
      colorObj = tailwindColors.find(c => 
        c.name.toLowerCase() === selectedColor.toLowerCase()
      );
    }
    
    if (colorObj && colorObj.name !== selectedColorObj?.name) {
      setSelectedColorObj(colorObj);
    }
  }, [selectedColor, selectedColorObj]);

  // Size variants for the color square - improved with proper padding and sizing
  const sizeClasses = {
    sm: 'w-16 h-16 text-xs p-2',
    md: 'w-20 h-20 text-sm p-2',
    lg: 'w-24 h-24 text-base p-2'
  };

  const handleColorSelect = (colorName: string) => {
    const colorObj = tailwindColors.find(c => c.name === colorName);
    if (colorObj) {
      setSelectedColorObj(colorObj);
      // Pass the color name in lowercase to ensure consistency in the application
      onColorChange(colorName.toLowerCase());
      setIsOpen(false);
    }
  };

  const getTextColorClass = (hexColor: string) => {
    return isLightColor(hexColor) ? 'text-gray-800' : 'text-white';
  };

  // Custom inline styles for custom size
  const customSizeStyle = customSize ? { 
    width: `${customSize}px`, 
    height: `${customSize}px`,
    padding: `${Math.max(8, customSize / 8)}px`
  } : {};
  
  // Determine font size for custom size - adjusted to be more proportional
  const getCustomFontSize = () => {
    if (!customSize) return {};
    // Scale font size proportionally
    if (customSize <= 32) return { fontSize: '0.7rem' }; // smaller for tiny
    if (customSize <= 48) return { fontSize: '0.8rem' }; // xs
    if (customSize <= 64) return { fontSize: '0.9rem' }; // sm
    return { fontSize: '1rem' }; // base
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center justify-center rounded-md transition-colors cursor-pointer',
            'hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-150',
            'flex-shrink-0', // Prevent shrinking
            customSize ? '' : sizeClasses[size],
            className
          )}
          style={{ 
            backgroundColor: selectedColorObj?.shades['500'],
            aspectRatio: '1/1', // Ensure square aspect ratio
            ...customSizeStyle,
            ...getCustomFontSize()
          }}
          aria-label={`Select a color, current color: ${selectedColor}`}
        >
          <span 
            className={cn(
              'font-medium text-center w-full truncate block',
              selectedColorObj ? getTextColorClass(selectedColorObj.shades['500']) : 'text-white'
            )}
          >
            {selectedColorObj?.name}
          </span>
        </button>
      </PopoverTrigger>
      
      <PopoverContent className="w-auto p-0 bg-textured border-border shadow-lg rounded-xl">
        <div className="grid grid-cols-6 gap-1 p-1">
          {tailwindColors.map((colorGroup) => (
            <div 
              key={colorGroup.name} 
              className={cn(
                "w-16 h-16 cursor-pointer flex items-center justify-center rounded-md transition-all aspect-square p-1",
                "hover:brightness-110 hover:scale-105",
                colorGroup.name === selectedColorObj?.name && "ring-2 ring-offset-2 ring-black dark:ring-white"
              )}
              style={{ backgroundColor: colorGroup.shades['500'] }}
              onClick={() => handleColorSelect(colorGroup.name)}
            >
              <span 
                className={cn(
                  "text-xs font-medium text-center w-full truncate block",
                  getTextColorClass(colorGroup.shades['500'])
                )}
              >
                {colorGroup.name}
              </span>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
} 