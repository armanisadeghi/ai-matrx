'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { Check, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

type DropdownPosition = {
    top: number;
    left: number;
    placement: 'top' | 'bottom';
    alignment: 'left' | 'right';
};

type MultiSelectDropdownProps = {
    isOpen: boolean;
    options: { value: string; label: string }[];
    selectedValues: string[];
    onOptionToggle: (value: string) => void;
    displayMode?: 'default' | 'icon';
    creatable?: boolean;
    createOptionPlaceholder?: string;
    onCreateOption?: () => void;
    inputValue: string;
    onInputChange: (value: string) => void;
    onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
    triggerRef: React.RefObject<HTMLButtonElement>;
    preferredPlacement?: 'top' | 'bottom';
};

const DROPDOWN_MIN_WIDTH = 200; // Minimum width for the dropdown
const DROPDOWN_PADDING = 8; // Padding from viewport edges

// Create a singleton portal container
let portalContainer: HTMLElement | null = null;

const getPortalContainer = (triggerElement?: HTMLElement) => {
    // If we have a trigger element, try to find if it's inside a portal/modal/sheet
    if (triggerElement) {
        // Look for common portal containers (Radix portals, custom modals, etc.)
        const portalSelectors = [
            '[data-radix-portal]', // Radix portals
            '[data-portal]', // Custom portals
            '.modal-portal', // Common modal class
            '.sheet-portal', // Common sheet class
            '[role="dialog"]', // ARIA dialog role
            '[aria-modal="true"]', // ARIA modal
            '.fixed.z-50', // Common modal/sheet pattern (Radix dialogs)
            '.fixed.z-40', // Alternative z-index
            '.fixed.z-30', // Another alternative
        ];
        
        let currentElement: HTMLElement | null = triggerElement;
        while (currentElement && currentElement !== document.body) {
            // Check if current element or any ancestor matches portal selectors
            for (const selector of portalSelectors) {
                const portalElement = currentElement.closest(selector) as HTMLElement;
                if (portalElement) {
                    // Found a portal container, create a container inside it if needed
                    let dropdownContainer = portalElement.querySelector('#multi-select-dropdown-portal') as HTMLElement;
                    if (!dropdownContainer) {
                        dropdownContainer = document.createElement('div');
                        dropdownContainer.id = 'multi-select-dropdown-portal';
                        dropdownContainer.style.position = 'relative';
                        dropdownContainer.style.zIndex = '1';
                        portalElement.appendChild(dropdownContainer);
                    }
                    return dropdownContainer;
                }
            }
            currentElement = currentElement.parentElement;
        }
    }
    
    // Fallback to document body with singleton container
    if (!portalContainer) {
        portalContainer = document.createElement('div');
        portalContainer.id = 'multi-select-dropdown-portal';
        document.body.appendChild(portalContainer);
    }
    return portalContainer;
};

const MultiSelectDropdown = React.forwardRef<HTMLDivElement, MultiSelectDropdownProps>(
    ({
        isOpen,
        options,
        selectedValues,
        onOptionToggle,
        displayMode = 'default',
        creatable = false,
        createOptionPlaceholder = 'Type to create...',
        onCreateOption,
        inputValue,
        onInputChange,
        onKeyDown,
        triggerRef,
        preferredPlacement = 'bottom'
    }, ref) => {
        const dropdownRef = React.useRef<HTMLDivElement>(null);
        const [position, setPosition] = React.useState<DropdownPosition | null>(null);

        const calculatePosition = React.useCallback(() => {
            if (!triggerRef.current || !dropdownRef.current) return;

            const triggerRect = triggerRef.current.getBoundingClientRect();
            const dropdownRect = dropdownRef.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;

            // Calculate spaces
            const spaceBelow = viewportHeight - triggerRect.bottom;
            const spaceAbove = triggerRect.top;

            // Determine width and position
            const width = Math.max(DROPDOWN_MIN_WIDTH, triggerRect.width);
            let left = triggerRect.left;
            
            // Adjust horizontal position if it would overflow
            if (left + width > viewportWidth - DROPDOWN_PADDING) {
                left = Math.max(DROPDOWN_PADDING, viewportWidth - width - DROPDOWN_PADDING);
            }

            // Determine vertical placement
            let placement: 'top' | 'bottom' = preferredPlacement;
            if (preferredPlacement === 'bottom' && spaceBelow < dropdownRect.height && spaceAbove > dropdownRect.height) {
                placement = 'top';
            } else if (preferredPlacement === 'top' && spaceAbove < dropdownRect.height && spaceBelow > dropdownRect.height) {
                placement = 'bottom';
            }

            // Calculate final top position
            const top = placement === 'bottom'
                ? triggerRect.bottom + 4
                : triggerRect.top - dropdownRect.height - 4;

            setPosition({
                top,
                left,
                placement,
                alignment: 'left'
            });
        }, [triggerRef, preferredPlacement]);

        React.useEffect(() => {
            if (!isOpen) {
                setPosition(null);
                return undefined;
            }

            // Initial position calculation with a small delay to ensure DOM is ready
            const timeoutId = setTimeout(() => {
                calculatePosition();
            }, 0);

            // Handle scroll and resize
            const handleUpdate = () => {
                calculatePosition();
            };

            window.addEventListener('scroll', handleUpdate, true);
            window.addEventListener('resize', handleUpdate);

            // Use ResizeObserver for dropdown content changes
            const observer = new ResizeObserver(handleUpdate);
            if (dropdownRef.current) {
                observer.observe(dropdownRef.current);
            }

            return () => {
                clearTimeout(timeoutId);
                window.removeEventListener('scroll', handleUpdate, true);
                window.removeEventListener('resize', handleUpdate);
                observer.disconnect();
            };
        }, [isOpen, calculatePosition]);

        if (!isOpen || typeof window === 'undefined') return null;

        const content = (
            <div
                ref={dropdownRef}
                data-multi-select-dropdown="true"
                className={cn(
                    "fixed rounded-md border bg-popover text-popover-foreground shadow-md",
                    "max-h-[300px] overflow-auto",
                    // Ensure visibility with very high z-index to appear above all modals/sheets
                    "z-[99999]"
                )}
                style={{
                    top: position?.top || 0,
                    left: position?.left || 0,
                    minWidth: DROPDOWN_MIN_WIDTH,
                    // Add a slight opacity transition for better UX
                    opacity: position ? 1 : 0,
                    visibility: position ? 'visible' : 'hidden',
                }}
            >
                {creatable && (
                    <div className="p-1 border-b">
                        <Input
                            value={inputValue}
                            onChange={(e) => onInputChange(e.target.value)}
                            placeholder={createOptionPlaceholder}
                            className="h-8"
                            onKeyDown={onKeyDown}
                        />
                    </div>
                )}
                <div className="p-1">
                    {options.map((option) => {
                        const isSelected = selectedValues.includes(option.value);
                        return (
                            <div
                                key={option.value}
                                className={cn(
                                    'relative flex items-center space-x-2 px-2 py-1.5 cursor-pointer rounded-sm',
                                    'hover:bg-accent hover:text-accent-foreground',
                                    isSelected && 'bg-accent/50'
                                )}
                                onClick={() => onOptionToggle(option.value)}
                            >
                                <div
                                    className={cn(
                                        'flex h-4 w-4 items-center justify-center border rounded',
                                        isSelected && 'bg-primary border-primary text-primary-foreground'
                                    )}
                                >
                                    {isSelected && <Check className="h-3 w-3" />}
                                </div>
                                <span>{option.label}</span>
                            </div>
                        );
                    })}
                    {creatable && inputValue.trim() && !options.length && (
                        <div
                            className="relative flex items-center space-x-2 px-2 py-1.5 cursor-pointer rounded-sm hover:bg-accent hover:text-accent-foreground"
                            onClick={onCreateOption}
                        >
                            <Plus className="h-4 w-4" />
                            <span>Create "{inputValue}"</span>
                        </div>
                    )}
                </div>
            </div>
        );

        return createPortal(content, getPortalContainer(triggerRef.current));
    }
);

MultiSelectDropdown.displayName = 'MultiSelectDropdown';

export default MultiSelectDropdown;