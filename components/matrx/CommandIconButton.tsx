import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ai-matrx/design-system';
import { Input } from '@ai-matrx/design-system';

export type CommandOption = {
  value: string;
  label: string;
};

interface CommandIconButtonProps {
  icon: React.ComponentType<{ size?: number }>;
  options: CommandOption[];
  onSelect: (option: CommandOption) => void;
  size?: number;
  title?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  hoverBgClass?: string;
  initialState?: boolean;
  useInternalState?: boolean;
  isActive?: boolean;
}

const CommandIconButton: React.FC<CommandIconButtonProps> = ({
  icon: Icon,
  options,
  onSelect,
  size = 22,
  title,
  className,
  disabled = false,
  ariaLabel,
  searchPlaceholder = 'Search...',
  noResultsText = 'No results found.',
  hoverBgClass = 'hover:bg-current/10',
  initialState = false,
  useInternalState = false,
  isActive,
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [internalState, setInternalState] = useState(initialState);

  // Determine if we should use internal or external state
  const active = useInternalState ? internalState : isActive;

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    
    const searchLower = search.toLowerCase().trim();
    return options.filter(option => 
      option.label.toLowerCase().includes(searchLower)
    );
  }, [options, search]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          disabled={disabled}
          aria-label={ariaLabel || title}
          title={title}
          className={cn(
            "relative inline-flex items-center justify-center",
            "p-1.5 rounded-md transition-colors",
            "text-muted-foreground cursor-pointer",
            hoverBgClass,
            disabled && "opacity-50 cursor-not-allowed",
            active && "text-primary",
            className
          )}
        >
          <Icon size={size} />
        </button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-64 p-0 bg-elevation1 rounded-md border-2 border-elevation3" 
        align="end"
      >
        <Command className="bg-elevation1" shouldFilter={false}>
          <div className="relative">
            <Input 
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm pr-8"
            />
            <Search className="h-4 w-4 absolute right-2 top-1/2 transform -translate-y-1/2 text-muted-foreground pointer-events-none opacity-50" />
          </div>
          <CommandEmpty className="text-sm py-2 px-2">{noResultsText}</CommandEmpty>
          <CommandGroup className="max-h-60 overflow-auto">
            {filteredOptions.map((option) => (
              <CommandItem
                key={option.value}
                value={option.value}
                onSelect={() => {
                  onSelect(option);
                  if (useInternalState) {
                    setInternalState(!internalState);
                  }
                  setOpen(false);
                }}
                className="text-ellipsis overflow-hidden hover:bg-primary hover:text-primary-foreground"
              >
                <span className="truncate">{option.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default CommandIconButton;