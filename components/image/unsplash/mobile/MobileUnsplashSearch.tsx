'use client';

import React, { useState, useEffect } from 'react';
import { SearchBar } from '@/components/image/shared/SearchBar';
import { SortOrder, ImageOrientation, PremiumFilter } from '@/hooks/images/useUnsplashGallery';
import { Button } from '@/components/ui/button';
import {
  BottomSheet,
  BottomSheetBody,
  BottomSheetHeader,
} from '@/components/official/bottom-sheet/BottomSheet';
import { Check, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MobileUnsplashSearchProps {
  initialSearchTerm?: string;
  onSearch: (query: string, options?: {
    sortOrder?: SortOrder;
    orientation?: ImageOrientation;
    premiumFilter?: PremiumFilter;
  }) => void;
  loading?: boolean;
  className?: string;
  currentSortOrder?: SortOrder;
  currentOrientation?: ImageOrientation;
  currentPremiumFilter?: PremiumFilter;
  sortOrderOptions?: SortOrder[];
  orientationOptions?: ImageOrientation[];
  premiumFilterOptions?: PremiumFilter[];
}

export function MobileUnsplashSearch({
  initialSearchTerm = '',
  onSearch,
  loading = false,
  className,
  currentSortOrder = 'latest',
  currentOrientation,
  currentPremiumFilter = 'none',
  sortOrderOptions = ['latest', 'popular', 'relevant', 'oldest'],
  orientationOptions = ['landscape', 'portrait', 'squarish'],
  premiumFilterOptions = ['mixed', 'only', 'none']
}: MobileUnsplashSearchProps) {
  // Local state for search options
  const [query, setQuery] = useState(initialSearchTerm);
  const [sortOrder, setSortOrder] = useState<SortOrder>(currentSortOrder);
  const [orientation, setOrientation] = useState<ImageOrientation>(currentOrientation);
  const [premiumFilter, setPremiumFilter] = useState<PremiumFilter>(currentPremiumFilter);
  const [sheetOpen, setSheetOpen] = useState(false);

  // Update our local state when props change
  useEffect(() => {
    setSortOrder(currentSortOrder);
    setOrientation(currentOrientation);
    setPremiumFilter(currentPremiumFilter);
  }, [currentSortOrder, currentOrientation, currentPremiumFilter]);

  // Handle search query changes
  const handleSearchChange = (newQuery: string) => {
    setQuery(newQuery);
    onSearch(newQuery, {
      sortOrder,
      orientation,
      premiumFilter
    });
  };

  // Handle sort order change with immediate feedback
  const handleSortChange = (value: string) => {
    const newSortOrder = value as SortOrder;
    setSortOrder(newSortOrder);
    onSearch(query, {
      sortOrder: newSortOrder,
      orientation,
      premiumFilter
    });
  };

  // Handle orientation change with immediate feedback
  const handleOrientationChange = (value: string) => {
    const newOrientation = value === 'any' ? undefined : value as ImageOrientation;
    setOrientation(newOrientation);
    onSearch(query, {
      sortOrder,
      orientation: newOrientation,
      premiumFilter
    });
  };

  // Handle premium filter change with immediate feedback
  const handlePremiumChange = (value: string) => {
    const newPremium = value as PremiumFilter;
    setPremiumFilter(newPremium);
    onSearch(query, {
      sortOrder,
      orientation,
      premiumFilter: newPremium
    });
  };

  const applyAndClose = () => {
    onSearch(query, {
      sortOrder,
      orientation,
      premiumFilter,
    });
    setSheetOpen(false);
  };

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center gap-2">
        <SearchBar
          onSearch={handleSearchChange}
          loading={loading}
          placeholder="Search..."
          defaultValue={query}
          className="flex-1"
          debounceTime={300}
          showClearButton={true}
          autoFocus={false}
          buttonClassName="min-w-[50px]"
        />

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => setSheetOpen(true)}
          className="h-10 w-10 flex-shrink-0"
          aria-label="Open Unsplash filters"
        >
          <SlidersHorizontal className="h-4 w-4" />
        </Button>
      </div>

      <BottomSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        title="Unsplash filters"
      >
        <BottomSheetHeader
          title="Filters"
          trailing={
            <button
              type="button"
              onClick={applyAndClose}
              className="min-h-[44px] px-1 text-[15px] text-primary active:opacity-70"
            >
              Done
            </button>
          }
        />
        <BottomSheetBody className="space-y-5 px-4 pb-5">
          <OptionGroup
            title="Sort"
            value={sortOrder}
            options={sortOrderOptions.map((option) => ({
              value: option,
              label: titleCase(option),
            }))}
            onChange={handleSortChange}
          />
          <OptionGroup
            title="Orientation"
            value={orientation || 'any'}
            options={[
              { value: 'any', label: 'Any' },
              ...orientationOptions.filter(Boolean).map((option) => ({
                value: option as string,
                label: titleCase(option as string),
              })),
            ]}
            onChange={handleOrientationChange}
          />
          <OptionGroup
            title="Premium"
            value={premiumFilter}
            options={premiumFilterOptions.map((option) => ({
              value: option,
              label: titleCase(option),
            }))}
            onChange={handlePremiumChange}
          />
        </BottomSheetBody>
      </BottomSheet>
    </div>
  );
}

function OptionGroup({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <section>
      <h3 className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="overflow-hidden rounded-xl border border-border bg-card/60">
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={cn(
                'flex min-h-[48px] w-full items-center gap-3 px-3 text-left',
                index > 0 && 'border-t border-border',
                active ? 'text-primary' : 'text-foreground',
              )}
            >
              <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
                {option.label}
              </span>
              {active ? <Check className="h-4 w-4 text-primary" /> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
