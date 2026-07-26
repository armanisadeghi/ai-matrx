'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import AdvancedMenu from '@/components/official/AdvancedMenu';
import { useAdvancedMenu } from '@/hooks/use-advanced-menu';
import { Button } from '@/components/ui/button';
import { Copy, Save, Trash, Eye, Globe, FileText } from 'lucide-react';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function AdvancedMenuDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  const menu = useAdvancedMenu({
    onOpen: () => console.log('Menu opened'),
    onClose: () => console.log('Menu closed'),
    onActionStart: (key) => console.log(`Action ${key} started`),
    onActionSuccess: (key) => console.log(`Action ${key} succeeded`),
    onActionError: (key, error) => console.error(`Action ${key} failed:`, error),
  });
  
  // Example code with all available props and their default values
  const code = `import AdvancedMenu, { MenuItem } from '@/components/official/AdvancedMenu';
import { useAdvancedMenu } from '@/hooks/use-advanced-menu';
import { Button } from '@/components/ui/button';
import { Copy, Save, Trash } from 'lucide-react';

const menu = useAdvancedMenu({
  onOpen: () => console.log('Menu opened'),
  onClose: () => console.log('Menu closed'),
  onActionStart: (key) => console.log(\`Action \${key} started\`),
  onActionSuccess: (key) => console.log(\`Action \${key} succeeded\`),
  onActionError: (key, error) => console.error(\`Action \${key} failed:\`, error),
});

const menuItems: MenuItem[] = [
  {
    key: 'copy',
    icon: Copy,
    iconColor: 'text-blue-500 dark:text-blue-400',
    label: 'Copy',
    description: 'Copy to clipboard',
    category: 'Edit',
    action: async () => {
      await navigator.clipboard.writeText('Sample text');
    },
    successMessage: 'Copied to clipboard',
    errorMessage: 'Failed to copy'
  },
  {
    key: 'save',
    icon: Save,
    iconColor: 'text-green-500 dark:text-green-400',
    label: 'Save',
    description: 'Save changes',
    category: 'Edit',
    action: () => {
      console.log('Saved!');
    }
  },
  {
    key: 'delete',
    icon: Trash,
    iconColor: 'text-red-500 dark:text-red-400',
    label: 'Delete',
    description: 'Remove permanently',
    category: 'Actions',
    action: () => {
      console.log('Deleted!');
    },
    disabled: true  // Coming soon feature
  }
];

<div>
  <Button onClick={() => menu.open()}>Open Menu</Button>
  
  <AdvancedMenu
    {...menu.menuProps}
    items={menuItems}
    title="Options"                      // Menu title (default: "Options")
    description="Choose an action"      // Optional subtitle
    showHeader={true}                   // Show header section (default: true)
    position="bottom-left"              // Position: "bottom-left" | "bottom-right" | "top-left" | "top-right" | "center"
    width="280px"                       // Min width (default: "280px")
    maxWidth="320px"                    // Max width (default: "320px")
    closeOnAction={true}                // Close after action (default: true)
    showBackdrop={true}                 // Show backdrop overlay (default: true)
    backdropBlur={true}                 // Blur backdrop (default: true)
    categorizeItems={true}              // Group items by category (default: true)
    forceMobileCenter={true}            // Center on mobile (default: true)
    className=""                        // Additional classes
  />
</div>`;

  // Demo menu items
  const menuItems = [
    {
      key: 'copy',
      icon: Copy,
      iconColor: 'text-blue-500 dark:text-blue-400',
      label: 'Copy',
      description: 'Copy to clipboard',
      category: 'Edit',
      action: async () => {
        await new Promise(resolve => setTimeout(resolve, 800));
        await navigator.clipboard.writeText('Sample demo text from AdvancedMenu');
      },
      successMessage: 'Copied to clipboard!',
      errorMessage: 'Failed to copy'
    },
    {
      key: 'save',
      icon: Save,
      iconColor: 'text-green-500 dark:text-green-400',
      label: 'Save',
      description: 'Save changes',
      category: 'Edit',
      action: async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
      },
      successMessage: 'Changes saved!',
      errorMessage: 'Save failed'
    },
    {
      key: 'preview',
      icon: Eye,
      iconColor: 'text-indigo-500 dark:text-indigo-400',
      label: 'Preview',
      description: 'View preview',
      category: 'Export',
      action: () => {
        console.log('Preview opened');
      }
    },
    {
      key: 'export',
      icon: Globe,
      iconColor: 'text-orange-500 dark:text-orange-400',
      label: 'Export HTML',
      description: 'Download as HTML',
      category: 'Export',
      action: async () => {
        await new Promise(resolve => setTimeout(resolve, 1200));
      },
      successMessage: 'Exported successfully!',
      errorMessage: 'Export failed'
    },
    {
      key: 'share',
      icon: FileText,
      iconColor: 'text-purple-500 dark:text-purple-400',
      label: 'Share',
      description: 'Share with others',
      category: 'Actions',
      action: () => {},
      disabled: true,
      showToast: false
    },
    {
      key: 'delete',
      icon: Trash,
      iconColor: 'text-red-500 dark:text-red-400',
      label: 'Delete',
      description: 'Remove permanently',
      category: 'Actions',
      action: () => {},
      disabled: true,
      showToast: false
    }
  ];

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="A beautiful, feature-rich menu component with automatic action feedback, loading states, mobile responsiveness, and extensive customization options. Perfect for context menus, dropdown menus, or any interactive menu interface."
    >
      <div className="w-full flex justify-center p-8">
        <div className="relative">
          <Button onClick={() => menu.open()}>
            Open Menu
          </Button>
          
          <AdvancedMenu
            {...menu.menuProps}
            items={menuItems}
            title="Menu Options"
            description="Choose an action"
            showHeader={true}
            position="bottom-left"
            width="280px"
            maxWidth="320px"
            closeOnAction={true}
            showBackdrop={true}
            backdropBlur={true}
            categorizeItems={true}
            forceMobileCenter={true}
          />
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
}

