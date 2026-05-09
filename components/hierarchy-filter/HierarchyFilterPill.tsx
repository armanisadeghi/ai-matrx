'use client';

import { useState } from 'react';
import { Check, ChevronDown, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';

export interface FilterOption {
  id: string;
  label: string;
  sublabel?: string;
  count?: number;
}

interface HierarchyFilterPillProps {
  label: string;
  allLabel: string;
  options: FilterOption[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onNew?: () => void;
  newLabel?: string;
  disabled?: boolean;
  loading?: boolean;
  className?: string;
}

export function HierarchyFilterPill({
  label,
  allLabel,
  options,
  selectedId,
  onSelect,
  onNew,
  newLabel,
  disabled,
  loading,
  className,
}: HierarchyFilterPillProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find(o => o.id === selectedId);

  const handleSelect = (id: string) => {
    if (id === '__all__') {
      onSelect(null);
    } else {
      onSelect(id === selectedId ? null : id);
    }
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          role="combobox"
          aria-expanded={open}
          disabled={disabled || loading}
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2 rounded-full text-[11px] font-medium',
            'transition-all duration-150 outline-none',
            'disabled:opacity-40 disabled:pointer-events-none',
            selected
              ? 'matrx-shell-glass text-primary border border-primary/20'
              : 'matrx-glass-card text-muted-foreground hover:text-foreground',
            loading && 'animate-pulse',
            className,
          )}
        >
          <span className="truncate max-w-[120px]">
            {selected ? selected.label : allLabel}
          </span>
          {selected ? (
            <X
              className="h-2.5 w-2.5 shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
              }}
            />
          ) : (
            <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-40" />
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0 rounded-xl border-border/50 shadow-xl" align="start" sideOffset={6}>
        <Command>
          {options.length > 5 && (
            <CommandInput placeholder={`Search...`} className="text-base h-8 text-xs" style={{ fontSize: '16px' }} />
          )}
          <CommandList className="max-h-[240px]">
            <CommandEmpty className="py-4 text-xs">None found.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => handleSelect('__all__')}
                className="gap-2 text-xs py-1.5"
              >
                <div className={cn(
                  'flex h-3.5 w-3.5 items-center justify-center rounded-sm border',
                  !selectedId ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60',
                )}>
                  {!selectedId && <Check className="h-2.5 w-2.5" />}
                </div>
                <span className="font-medium">{allLabel}</span>
                <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
                  {options.length}
                </span>
              </CommandItem>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.label}
                  onSelect={() => handleSelect(option.id)}
                  className="gap-2 text-xs py-1.5"
                >
                  <div className={cn(
                    'flex h-3.5 w-3.5 items-center justify-center rounded-sm border',
                    selectedId === option.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border/60',
                  )}>
                    {selectedId === option.id && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <span className="truncate">{option.label}</span>
                  {option.sublabel && (
                    <span className="text-[9px] text-muted-foreground">{option.sublabel}</span>
                  )}
                  {option.count !== undefined && (
                    <span className="ml-auto text-[10px] text-muted-foreground tabular-nums shrink-0">
                      {option.count}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
            {onNew && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    value={`__new_${label}__`}
                    onSelect={() => { setOpen(false); onNew(); }}
                    className="gap-2 text-xs py-1.5 text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    <span className="font-medium">{newLabel ?? `New ${label}`}</span>
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
