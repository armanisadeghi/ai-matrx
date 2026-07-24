"use client";

import React, { useState } from 'react';
import ToggleMenuButton from '@/components/matrx/toggles/ToggleMenuButton';
import { MessageSquare, Star, Flag, Bell, Shield, Filter, User } from 'lucide-react';

// Example usage of the ToggleMenuButton
const ExampleUsage = () => {
  // Single selection example
  const [selectedCategory, setSelectedCategory] = useState<string[]>([]);
  
  // Multi-selection example
  const [selectedFilters, setSelectedFilters] = useState<string[]>([]);

  // Options for categories (single selection)
  const categoryOptions = [
    { id: 'all', label: 'All Messages', icon: <MessageSquare /> },
    { id: 'starred', label: 'Starred', icon: <Star /> },
    { id: 'flagged', label: 'Flagged', icon: <Flag /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell /> },
    { id: 'private', label: 'Private', icon: <Shield /> },
  ];

  // Options for filters (multi-selection)
  const filterOptions = [
    { id: 'unread', label: 'Unread Only', icon: <Bell /> },
    { id: 'attachments', label: 'Has Attachments', icon: <Shield /> },
    { id: 'mentions', label: 'Has Mentions', icon: <User /> },
    { id: 'links', label: 'Contains Links', icon: <MessageSquare /> },
  ];

  return (
    <div className="p-8 space-y-12">
      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Single Selection Example</h2>
        <p className="text-gray-600 dark:text-gray-300">Click to select a category:</p>
        
        <ToggleMenuButton
          label="Category"
          defaultIcon={<MessageSquare />}
          enabledIcon={<MessageSquare />}
          options={categoryOptions}
          selectedIds={selectedCategory}
          onSelectionChange={setSelectedCategory}
          tooltip="Select message category"
          direction="bottom"
          size="md"
        />
        
        <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded">
          Selected category: {selectedCategory.length > 0 
            ? categoryOptions.find(opt => opt.id === selectedCategory[0])?.label 
            : 'None'}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-semibold">Multiple Selection Example</h2>
        <p className="text-gray-600 dark:text-gray-300">Click to select multiple filters:</p>
        
        <ToggleMenuButton
          label="Filters"
          defaultIcon={<Filter />}
          enabledIcon={<Filter />}
          options={filterOptions}
          selectedIds={selectedFilters}
          onSelectionChange={setSelectedFilters}
          tooltip="Select message filters"
          waitingTooltip="Select options from the menu"
          selectionMode="multiple"
          enableSearch={true}
          direction="right"
          size="md"
          isWaiting={selectedFilters.length === 0 && false}
        />
        
        <div className="mt-4 p-3 bg-gray-100 dark:bg-gray-800 rounded">
          Selected filters: {selectedFilters.length > 0 
            ? selectedFilters.map(id => filterOptions.find(opt => opt.id === id)?.label).join(', ') 
            : 'None'}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4">
        <div>
          <h3 className="mb-2 font-medium">Direction: Top</h3>
          <ToggleMenuButton
            label="Menu"
            defaultIcon={<MessageSquare />}
            enabledIcon={<MessageSquare />}
            options={categoryOptions.slice(0, 3)}
            selectedIds={[]}
            onSelectionChange={() => {}}
            direction="top"
          />
        </div>
        <div>
          <h3 className="mb-2 font-medium">Direction: Right</h3>
          <ToggleMenuButton
            label="Menu"
            defaultIcon={<MessageSquare />}
            enabledIcon={<MessageSquare />}
            options={categoryOptions.slice(0, 3)}
            selectedIds={[]}
            onSelectionChange={() => {}}
            direction="right"
          />
        </div>
        <div>
          <h3 className="mb-2 font-medium">Direction: Bottom</h3>
          <ToggleMenuButton
            label="Menu"
            defaultIcon={<MessageSquare />}
            enabledIcon={<MessageSquare />}
            options={categoryOptions.slice(0, 3)}
            selectedIds={[]}
            onSelectionChange={() => {}}
            direction="bottom"
          />
        </div>
        <div>
          <h3 className="mb-2 font-medium">Direction: Left</h3>
          <ToggleMenuButton
            label="Menu"
            defaultIcon={<MessageSquare />}
            enabledIcon={<MessageSquare />}
            options={categoryOptions.slice(0, 3)}
            selectedIds={[]}
            onSelectionChange={() => {}}
            direction="left"
          />
        </div>
      </div>
    </div>
  );
};

export default ExampleUsage;