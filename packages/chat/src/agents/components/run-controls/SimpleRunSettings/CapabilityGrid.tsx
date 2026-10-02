'use client';

/**
 * CapabilityGrid
 *
 * 2×3 grid of selectable "what can this AI do for me?" cards. Shows the
 * label + one-line pitch + tagline. Never shows the underlying model name.
 *
 * Pure presentation — the parent owns the selected id and the onChange
 * handler so the grid can be swapped into any surface (popover, drawer,
 * full page) without carrying state with it.
 */

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  CAPABILITIES,
  ACCENT_CLASSES,
  type Capability,
} from './capabilities';

export interface CapabilityGridProps {
  value: Capability['id'];
  onChange: (id: Capability['id']) => void;
  className?: string;
}

export function CapabilityGrid({ value, onChange, className }: CapabilityGridProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Choose the kind of AI"
      className={cn(
        'grid grid-cols-2 gap-2',
        className,
      )}
    >
      {CAPABILITIES.map((cap) => (
        <CapabilityCard
          key={cap.id}
          capability={cap}
          selected={cap.id === value}
          onSelect={() => onChange(cap.id)}
        />
      ))}
    </div>
  );
}

function CapabilityCard({
  capability,
  selected,
  onSelect,
}: {
  capability: Capability;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = capability.icon;
  const accent = ACCENT_CLASSES[capability.accent];

  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        'relative flex flex-col items-start gap-1.5 rounded-lg border bg-card p-3 text-left transition-all',
        'hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? cn('ring-2 ring-offset-1 ring-offset-background border-transparent', accent.ringSelected)
          : 'border-border',
      )}
    >
      {/* Check pill in the corner — shows at a glance what's selected. */}
      {selected && (
        <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-foreground text-background">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}

      <div className={cn('flex h-7 w-7 items-center justify-center rounded-md', accent.tile)}>
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span className="text-sm font-semibold text-foreground truncate">
            {capability.label}
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-2">
          {capability.description}
        </p>
      </div>

      <span className={cn('mt-auto text-[10px] font-medium uppercase tracking-wide', accent.text)}>
        {capability.tagline}
      </span>
    </button>
  );
}
