// Official Component: Icon Dropdown Menu
// iOS-style dropdown menu with icon trigger and elegant menu items
'use client';

import React from 'react';
import { ChevronDown, Check, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface IconDropdownOption<T = string> {
  value: T;
  label: string;
  icon: LucideIcon;
}

interface IconDropdownMenuProps<T = string> {
  /** Array of options to display in the menu */
  options: IconDropdownOption<T>[];
  /** Currently selected value */
  value: T;
  /** Callback when selection changes */
  onValueChange: (value: T) => void;
  /** Use compact size (default: false) */
  compact?: boolean;
  /** Dropdown alignment (default: 'end') */
  align?: 'start' | 'center' | 'end';
  /** Additional className for the trigger button */
  className?: string;
  /** Width of the dropdown menu (default: 'w-48') */
  menuWidth?: string;
}

/**
 * IconDropdownMenu - Official Reusable Component
 * 
 * An elegant iOS-style dropdown menu with icon trigger.
 * Perfect for selection menus, sort controls, filter options, etc.
 * 
 * @example
 * ```tsx
 * const options = [
 *   { value: 'new', label: 'Newest', icon: Clock },
 *   { value: 'old', label: 'Oldest', icon: History },
 * ];
 * 
 * <IconDropdownMenu
 *   options={options}
 *   value={selectedValue}
 *   onValueChange={setSelectedValue}
 * />
 * ```
 */
export default function IconDropdownMenu<T extends string = string>({
  options,
  value,
  onValueChange,
  compact = false,
  align = 'end',
  className,
  menuWidth = 'w-48',
}: IconDropdownMenuProps<T>) {
  const selectedOption = options.find(opt => opt.value === value) || options[0];
  const SelectedIcon = selectedOption?.icon;

  if (!SelectedIcon) {
    console.warn('IconDropdownMenu: No valid option found');
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          icon={<SelectedIcon size={compact ? 14 : 16} />}
          variant="outline"
          className={className}
        >
          <ChevronDown size={compact ? 12 : 14} className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className={cn('rounded-2xl p-1', menuWidth)}>
        {options.map((option) => {
          const isSelected = option.value === value;
          const OptionIcon = option.icon;
          
          return (
            <DropdownMenuItem
              key={String(option.value)}
              onClick={() => onValueChange(option.value)}
              className={cn(
                "flex items-center gap-3 cursor-pointer rounded-lg py-2.5 px-3 transition-colors",
                isSelected && "bg-blue-50 dark:bg-blue-950/30"
              )}
            >
              <OptionIcon 
                size={16} 
                className={cn(
                  "flex-shrink-0",
                  isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-500 dark:text-gray-400"
                )}
              />
              <span className={cn(
                "text-sm flex-1 leading-tight",
                isSelected ? "font-medium text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
              )}>
                {option.label}
              </span>
              {isSelected && (
                <Check size={16} className="text-blue-600 dark:text-blue-400 flex-shrink-0" />
              )}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

