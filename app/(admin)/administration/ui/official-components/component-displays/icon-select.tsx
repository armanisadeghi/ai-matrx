'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import IconSelect from '@/components/official/IconSelect';
import { Home, Settings, Bell, Search, User, PanelTopOpen } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function IconSelectDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  const [selectedValue, setSelectedValue] = useState('home');
  
  const selectItems = [
    { 
      id: '1', 
      label: 'Home', 
      icon: <Home className="h-5 w-5 text-gray-700 dark:text-gray-300" />, 
      value: 'home'
    },
    { 
      id: '2', 
      label: 'Search', 
      icon: <Search className="h-5 w-5 text-gray-700 dark:text-gray-300" />, 
      value: 'search'
    },
    { 
      id: '3', 
      label: 'Notifications', 
      icon: <Bell className="h-5 w-5 text-gray-700 dark:text-gray-300" />, 
      value: 'notifications'
    },
    { 
      id: '4', 
      label: 'Settings', 
      icon: <Settings className="h-5 w-5 text-gray-700 dark:text-gray-300" />, 
      value: 'settings'
    },
    { 
      id: '5', 
      label: 'Profile', 
      icon: <User className="h-5 w-5 text-gray-700 dark:text-gray-300" />, 
      value: 'profile'
    },
  ];
  
  // Example code with all available props and their default values
  const code = `import IconSelect from '@/components/official/IconSelect';
import { Home, Settings, Bell, Search, User } from 'lucide-react';

// Define your items with icons and labels
const selectItems = [
  { 
    id: '1', 
    label: 'Home', 
    icon: <Home className="h-5 w-5 text-gray-700 dark:text-gray-300" />, 
    value: 'home'
  },
  { 
    id: '2', 
    label: 'Search', 
    icon: <Search className="h-5 w-5 text-gray-700 dark:text-gray-300" />, 
    value: 'search'
  },
  // ... more items
];

// State to track the selected value
const [selectedValue, setSelectedValue] = useState('home');

// Basic usage
<IconSelect 
  items={selectItems}
  icon={<Settings className="h-5 w-5 opacity-70" />}
  value={selectedValue}
  onValueChange={setSelectedValue}
/>

// With custom trigger styling
<IconSelect
  items={selectItems}
  icon={<PanelTopOpen className="h-5 w-5 opacity-70" />}
  value={selectedValue}
  onValueChange={setSelectedValue}
  triggerClassName="h-8 w-8 bg-zinc-200 dark:bg-zinc-800"
  contentClassName="min-w-[200px]"
/>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="An icon-only select component that shows a dropdown of labeled items. Based on the proven NavigationSelectIcon component that works correctly across the application."
      className="h-32 flex items-center justify-center"
    >
      <div className="w-full flex justify-center">
        <IconSelect 
          items={selectItems}
          icon={<Settings className="h-5 w-5 opacity-70" />}
          value={selectedValue}
          onValueChange={setSelectedValue}
        />
      </div>
    </ComponentDisplayWrapper>
  );
} 