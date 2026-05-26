'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import FloatingDock from '@/components/official/FloatingDock';
import BalancedFloatingDock from '@/components/official/BalancedFloatingDock';
import { Home, Settings, Bell, Search, User, Sliders } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function FloatingDockDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // State for active tab
  const [activeTab, setActiveTab] = useState<string>("original");
  
  // State for BalancedFloatingDock controls
  const [growthFactor, setGrowthFactor] = useState<number>(1.8);
  const [labelPosition, setLabelPosition] = useState<'side' | 'bottom'>('side');
  
  // Common dock items
  const dockItems = [
    { label: 'Home', icon: <Home className="text-gray-700 dark:text-gray-300" />, href: '#' },
    { label: 'Search', icon: <Search className="text-gray-700 dark:text-gray-300" />, href: '#' },
    { label: 'Notifications', icon: <Bell className="text-gray-700 dark:text-gray-300" />, href: '#' },
    { label: 'Settings', icon: <Settings className="text-gray-700 dark:text-gray-300" />, href: '#' },
    { label: 'Profile', icon: <User className="text-gray-700 dark:text-gray-300" />, href: '#' },
  ];
  
  // Example code for original FloatingDock
  const originalCode = `import FloatingDock from '@/components/official/FloatingDock';
import { Home, Settings, Bell, Search, User } from 'lucide-react';

const dockItems = [
  { 
    label: 'Home', 
    icon: <Home className="text-gray-700 dark:text-gray-300" />, 
    href: '/home' 
  },
  { 
    label: 'Search', 
    icon: <Search className="text-gray-700 dark:text-gray-300" />, 
    href: '/search' 
  },
  { 
    label: 'Notifications', 
    icon: <Bell className="text-gray-700 dark:text-gray-300" />, 
    href: '/notifications' 
  },
  { 
    label: 'Settings', 
    icon: <Settings className="text-gray-700 dark:text-gray-300" />, 
    href: '/settings' 
  },
  { 
    label: 'Profile', 
    icon: <User className="text-gray-700 dark:text-gray-300" />, 
    href: '/profile' 
  },
];

<FloatingDock
  items={dockItems}
  className=""                   // Additional classes for the dock container
  bgColorClassname="bg-zinc-100 dark:bg-zinc-850"  // Background color for the dock
  iconBgColorClassname="bg-zinc-200 dark:bg-zinc-700"  // Background color for the icons
/>`;

  // Example code for BalancedFloatingDock
  const balancedCode = `import BalancedFloatingDock from '@/components/official/BalancedFloatingDock';
import { Home, Settings, Bell, Search, User } from 'lucide-react';

const dockItems = [
  { 
    label: 'Home', 
    icon: <Home className="text-gray-700 dark:text-gray-300" />, 
    href: '/home' 
  },
  // ... other items
];

<BalancedFloatingDock
  items={dockItems}
  className=""                   // Additional classes for the dock container
  bgColorClassname="bg-zinc-100 dark:bg-zinc-850"  // Background color for the dock
  iconBgColorClassname="bg-zinc-200 dark:bg-zinc-700"  // Background color for the icons
  growthFactor={1.8}             // Controls how much the icons grow (1.0 = no growth, 2.0 = double size)
  labelPosition="side"           // Where labels appear: "side" or "bottom"
/>`;

  // Component descriptions
  const descriptions = {
    original: "A responsive floating dock that adapts to desktop and mobile views. On desktop, it shows an interactive dock with animated icons that move upward on hover. On mobile, it collapses to a menu button that expands to a full-screen menu.",
    balanced: "An enhanced version of the floating dock that grows in place rather than moving upward on hover. Designed for use near the top edge of the page where upward movement would be problematic. Features configurable growth factor and label positioning."
  };

  // Handle tab change to sync all tab components
  const handleTabChange = (value: string) => {
    setActiveTab(value);
  };

  return (
    <ComponentDisplayWrapper
      component={component}
      code={activeTab === "original" ? originalCode : balancedCode}
      description={descriptions[activeTab as keyof typeof descriptions]}
      className="min-h-[320px] flex flex-col"
    >
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full flex-grow">
        <TabsList className="mb-4 space-x-2">
          <TabsTrigger value="original">Original FloatingDock</TabsTrigger>
          <TabsTrigger value="balanced">Balanced FloatingDock</TabsTrigger>
        </TabsList>
        
        <TabsContent value="original" className="mt-0 h-[220px] flex items-end justify-center">
          <div className="w-full">
            <FloatingDock
              items={dockItems}
              bgColorClassname="bg-zinc-100 dark:bg-zinc-850"
              iconBgColorClassname="bg-zinc-200 dark:bg-zinc-700"
            />
          </div>
        </TabsContent>
        
        <TabsContent value="balanced" className="mt-0 flex flex-col space-y-6">
          {/* Configuration Panel */}
          <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-md border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-medium mb-3 flex items-center text-gray-800 dark:text-gray-200">
              <Sliders className="h-4 w-4 mr-2 text-blue-500 dark:text-blue-400" />
              Configuration Options
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
                  Growth Factor: {growthFactor.toFixed(1)}
                </Label>
                <input 
                  type="range" 
                  min="1.0" 
                  max="3.0" 
                  step="0.1"
                  value={growthFactor}
                  onChange={(e) => setGrowthFactor(parseFloat(e.target.value))}
                  className="w-full accent-blue-500 dark:accent-blue-400"
                />
              </div>
              <div>
                <Label className="text-xs text-gray-600 dark:text-gray-400 block mb-1">
                  Label Position
                </Label>
                <RadioGroup 
                  value={labelPosition} 
                  onValueChange={(value) => setLabelPosition(value as 'side' | 'bottom')}
                  className="flex space-x-3"
                >
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="side" id="side-option" />
                    <Label htmlFor="side-option" className="text-xs text-gray-700 dark:text-gray-300">Side</Label>
                  </div>
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="bottom" id="bottom-option" />
                    <Label htmlFor="bottom-option" className="text-xs text-gray-700 dark:text-gray-300">Bottom</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </div>
          
          {/* Component Demo */}
          <div className="w-full h-[160px] flex items-start justify-center">
            <BalancedFloatingDock
              items={dockItems}
              bgColorClassname="bg-zinc-100 dark:bg-zinc-850"
              iconBgColorClassname="bg-zinc-200 dark:bg-zinc-700"
              growthFactor={growthFactor}
              labelPosition={labelPosition}
            />
          </div>
        </TabsContent>
      </Tabs>
    </ComponentDisplayWrapper>
  );
} 