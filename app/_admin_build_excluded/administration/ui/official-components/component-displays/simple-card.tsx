'use client';
import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { SimpleCard } from '@/components/official/cards/CardGrid';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListTodo, Plus, Settings, Mail, FileText } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function SimpleCardDemo({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code for small size
  const smallCode = `import { SimpleCard } from '@/components/official/cards/CardGrid';
import { ListTodo } from 'lucide-react';

// Small compact card - wrap in a div with max-width
<div className="max-w-xs">
  <SimpleCard 
    icon={<ListTodo className="h-12 w-12" />}
    title="My Todo List"
  />
</div>`;

  // Example code for medium size
  const mediumCode = `import { SimpleCard } from '@/components/official/cards/CardGrid';
import { Plus } from 'lucide-react';

// Medium sized card - standard navigation size
<div className="max-w-md">
  <SimpleCard 
    icon={<Plus className="h-12 w-12" />}
    title="Create New Item"
    description="Add a new item to your collection"
    onClick={() => console.log('Card clicked!')}
  />
</div>`;

  // Example code for large size
  const largeCode = `import { SimpleCard } from '@/components/official/cards/CardGrid';
import { Settings } from 'lucide-react';

// Large sized card - good for featured items
<div className="max-w-lg">
  <SimpleCard 
    icon={<Settings className="h-12 w-12" />}
    title="Settings"
    description="Manage your preferences and configuration"
    href="/settings"
    className="h-64"
  />
</div>`;

  // Example code for full width
  const fullWidthCode = `import { SimpleCard } from '@/components/official/cards/CardGrid';
import { Mail } from 'lucide-react';

// Full width card - spans the entire container
<SimpleCard 
  icon={<Mail className="h-12 w-12" />}
  title="Email Center"
  description="Manage your email communications and notifications"
  href="/email"
  className="h-72"
/>`;

  // Example code for fully customized card
  const customCode = `import { SimpleCard } from '@/components/official/cards/CardGrid';
import { FileText } from 'lucide-react';

// Fully customized card with all styling props
<div className="max-w-xl">
  <SimpleCard 
    icon={<FileText className="h-12 w-12" />}
    title="Document Manager"
    description="Organize and manage all your important documents"
    href="/documents"
    className="h-80 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900"
    iconClassName="text-purple-600 dark:text-purple-300"
    titleClassName="text-purple-700 dark:text-purple-200 text-2xl"
    descriptionClassName="text-base text-purple-600 dark:text-purple-300"
  />
</div>`;

  return (
    <Tabs defaultValue="small">
      <TabsList className="mb-4">
        <TabsTrigger value="small">Small</TabsTrigger>
        <TabsTrigger value="medium">Medium</TabsTrigger>
        <TabsTrigger value="large">Large</TabsTrigger>
        <TabsTrigger value="full">Full Width</TabsTrigger>
        <TabsTrigger value="custom">Custom</TabsTrigger>
      </TabsList>
      
      <TabsContent value="small">
        <ComponentDisplayWrapper
          component={component}
          code={smallCode}
          description="Small SimpleCard wrapped in a max-w-xs container. Perfect for compact UI elements and small action buttons."
        >
          <div className="flex justify-center">
            <div className="max-w-xs">
              <SimpleCard 
                icon={<ListTodo className="h-12 w-12" />}
                title="My Todo List"
              />
            </div>
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="medium">
        <ComponentDisplayWrapper
          component={component}
          code={mediumCode}
          description="Medium SimpleCard using max-w-md. Standard size for navigation cards and action items with descriptions."
        >
          <div className="flex justify-center">
            <div className="max-w-md">
              <SimpleCard 
                icon={<Plus className="h-12 w-12" />}
                title="Create New Item"
                description="Add a new item to your collection"
                onClick={() => alert('Card clicked!')}
              />
            </div>
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="large">
        <ComponentDisplayWrapper
          component={component}
          code={largeCode}
          description="Large SimpleCard using max-w-lg with custom h-64 height. Great for featured items and prominent navigation elements."
        >
          <div className="flex justify-center">
            <div className="max-w-lg">
              <SimpleCard 
                icon={<Settings className="h-12 w-12" />}
                title="Settings"
                description="Manage your preferences and configuration"
                href="/settings"
                className="h-64"
              />
            </div>
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="full">
        <ComponentDisplayWrapper
          component={component}
          code={fullWidthCode}
          description="Full width SimpleCard that spans the entire container. Use this for hero sections or full-width navigation areas."
        >
          <SimpleCard 
            icon={<Mail className="h-12 w-12" />}
            title="Email Center"
            description="Manage your email communications and notifications"
            href="/email"
            className="h-72"
          />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="custom">
        <ComponentDisplayWrapper
          component={component}
          code={customCode}
          description="Fully customized SimpleCard demonstrating all styling props within a max-w-xl container. Shows how to control size, colors, and text styling."
        >
          <div className="flex justify-center">
            <div className="max-w-xl">
              <SimpleCard 
                icon={<FileText className="h-12 w-12" />}
                title="Document Manager"
                description="Organize and manage all your important documents"
                href="/documents"
                className="h-80 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900"
                iconClassName="text-purple-600 dark:text-purple-300"
                titleClassName="text-purple-700 dark:text-purple-200 text-2xl"
                descriptionClassName="text-base text-purple-600 dark:text-purple-300"
              />
            </div>
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
    </Tabs>
  );
}