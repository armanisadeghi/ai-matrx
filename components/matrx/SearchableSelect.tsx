import React, { useState, useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@ai-matrx/design-system';

export type Option = {
  value: string;
  label: string;
};

interface SearchableSelectProps {
  options: Option[];
  value?: string;
  onChange: (value: Option) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  noResultsText?: string;
  className?: string;
}

const SearchableSelect: React.FC<SearchableSelectProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search...',
  noResultsText = 'No results found.',
  className = '',
}) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedOption = options.find(option => option.value === value);

  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    
    const searchLower = search.toLowerCase().trim();
    return options.filter(option => 
      option.label.toLowerCase().includes(searchLower)
    );
  }, [options, search]);

  return (
    <div className="w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            role="combobox"
            aria-expanded={open}
            className={`w-full min-w-0 bg-elevation1 rounded-md p-2 text-sm inline-flex items-center justify-between border-2 border-elevation3 ${className}`}
          >
            <span className="truncate text-sm">
              {selectedOption ? selectedOption.label : placeholder}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          sizing="content"
          className="p-0 bg-popover text-popover-foreground rounded-md border border-border shadow-md"
          align="start"
        >
          <Command className="bg-popover text-popover-foreground" shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={search}
              onValueChange={setSearch}
              className="text-sm"
            />
            {/* INSIDE A CommandList (lane HANDOVER, 2026-09-27): cmdk finds its items for the arrow
                keys, Enter and the first-item highlight through the list; with no list there were
                none, so typing filtered the options and Enter chose nothing. */}
            <CommandList>
              <CommandEmpty className="text-sm py-2 px-2">{noResultsText}</CommandEmpty>
              <CommandGroup className="max-h-60 overflow-auto">
                {/* onSelect, not a click on an inner div (lane HANDOVER, 2026-09-27): the div's click
                    was the only way to choose, so arrow keys and Enter highlighted an option and
                    chose nothing. cmdk calls onSelect for Enter and for a click alike. */}
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={option.value}
                    onSelect={() => {
                      onChange(option);
                      setOpen(false);
                      setSearch('');
                    }}
                    className="text-ellipsis overflow-hidden hover:bg-primary hover:text-primary-foreground"
                  >
                    <span className="flex-1 truncate">{option.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
};

export default SearchableSelect;
