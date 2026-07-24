'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { Card, Grid, CardColor } from '@/components/official/card-and-grid';
import { Bell, Settings, Search } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function CardAndGridDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  const items = [
    {
      title: 'Notifications',
      description: 'Manage your notification preferences',
      icon: <Bell />,
      color: 'blue' as CardColor,
      path: '#',
    },
    {
      title: 'Settings',
      description: 'Configure system settings',
      icon: <Settings />,
      color: 'purple' as CardColor,
      path: '#',
    },
    {
      title: 'Search',
      description: 'Find what you need',
      icon: <Search />,
      color: 'emerald' as CardColor,
      path: '#',
    },
  ];
  
  // Example code with all available props and their default values
  const code = `import { Card, Grid, CardColor } from '@/components/official/card-and-grid';
import { Bell, Settings, Search } from 'lucide-react';

// Card items for the grid
const items = [
  {
    title: 'Notifications',             // Required: Card title
    description: 'Manage your notification preferences',  // Optional: Card description
    icon: <Bell />,                     // Required: Icon component
    color: 'blue' as CardColor,         // Color scheme: 'indigo', 'emerald', 'blue', etc.
    path: '/notifications',             // Optional: Link path
    size: 'md',                         // Optional: Card size ('xs', 'sm', 'md', 'lg', 'xl')
    className: '',                      // Optional: Additional classes for the card
    onClick: () => console.log('Clicked')  // Optional: Click handler
  },
  // ...more items
];

// Individual Card usage:
<Card
  title="Notifications"
  description="Manage your notification preferences"
  icon={<Bell />}
  color={'blue' as CardColor}
  path="/notifications"
  size="md"
/>

// Grid usage:
<Grid
  title="Features"                  // Optional: Grid title
  description="Available features"  // Optional: Grid description
  items={items}                     // Required: Array of card items
  columns={3}                       // Optional: Number of columns (1-6, defaults to 6)
  className=""                      // Optional: Additional classes for the grid container
  cardClassName=""                  // Optional: Additional classes for all cards
  showAddButton={true}              // Optional: Show an "add" button at the end
  onAddButtonClick={() => {}}       // Optional: Handler for add button click
  addButtonText="Add Feature"       // Optional: Custom text for add button
/>`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A card and grid system for displaying feature tiles, navigation options, or content previews in a responsive grid layout."
    >
      <div className="w-full">
        <Grid 
          items={items}
          columns={3}
          className="w-full max-w-4xl"
        />
      </div>
    </ComponentDisplayWrapper>
  );
} 