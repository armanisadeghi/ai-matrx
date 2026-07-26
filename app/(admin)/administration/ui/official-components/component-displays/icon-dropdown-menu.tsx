'use client';

import React, { useState } from 'react';
import IconDropdownMenu from '@/components/official/IconDropdownMenu';
import { 
  Clock, 
  Calendar, 
  Flag, 
  ArrowDownAZ,
  Filter,
  SortAsc,
  Eye,
  Palette,
  Zap
} from 'lucide-react';

export default function IconDropdownMenuDemo() {
  const [sortValue, setSortValue] = useState('recent');
  const [filterValue, setFilterValue] = useState('all');
  const [viewValue, setViewValue] = useState('grid');

  // Sort options example
  const sortOptions = [
    { value: 'recent', label: 'Most Recent', icon: Clock },
    { value: 'oldest', label: 'Oldest First', icon: Calendar },
    { value: 'priority', label: 'By Priority', icon: Flag },
    { value: 'alpha', label: 'Alphabetical', icon: ArrowDownAZ },
  ];

  // Filter options example
  const filterOptions = [
    { value: 'all', label: 'All Items', icon: Filter },
    { value: 'active', label: 'Active Only', icon: Zap },
    { value: 'completed', label: 'Completed', icon: Eye },
  ];

  // View options example
  const viewOptions = [
    { value: 'grid', label: 'Grid View', icon: Palette },
    { value: 'list', label: 'List View', icon: SortAsc },
  ];

  return (
    <div className="space-y-8">
      {/* Example 1: Sort Menu */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Sort Menu (Default Size)
        </h3>
        <div className="flex items-center gap-2">
          <IconDropdownMenu
            options={sortOptions}
            value={sortValue}
            onValueChange={setSortValue}
            align="start"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Selected: {sortOptions.find(o => o.value === sortValue)?.label}
          </span>
        </div>
      </div>

      {/* Example 2: Compact Filter Menu */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          Filter Menu (Compact)
        </h3>
        <div className="flex items-center gap-2">
          <IconDropdownMenu
            options={filterOptions}
            value={filterValue}
            onValueChange={setFilterValue}
            compact={true}
            align="center"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Selected: {filterOptions.find(o => o.value === filterValue)?.label}
          </span>
        </div>
      </div>

      {/* Example 3: View Selector */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          View Selector (Wide Menu)
        </h3>
        <div className="flex items-center gap-2">
          <IconDropdownMenu
            options={viewOptions}
            value={viewValue}
            onValueChange={setViewValue}
            align="end"
            menuWidth="w-56"
          />
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Selected: {viewOptions.find(o => o.value === viewValue)?.label}
          </span>
        </div>
      </div>

      {/* Code Example */}
      <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
        <h4 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">
          Implementation Example:
        </h4>
        <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
{`const options = [
  { value: 'recent', label: 'Most Recent', icon: Clock },
  { value: 'oldest', label: 'Oldest First', icon: Calendar },
];

const [value, setValue] = useState('recent');

<IconDropdownMenu
  options={options}
  value={value}
  onValueChange={setValue}
  compact={false}
  align="end"
  menuWidth="w-48"
/>`}
        </pre>
      </div>
    </div>
  );
}

