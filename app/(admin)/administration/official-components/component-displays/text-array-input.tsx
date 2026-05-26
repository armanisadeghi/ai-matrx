'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import TextArrayInput from '@/components/official/TextArrayInput';
import { Label } from '@/components/ui/label';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function TextArrayInputDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;

  const [basicTags, setBasicTags] = useState(['react', 'nextjs', 'typescript']);
  const [urlList, setUrlList] = useState(['example.com', 'github.com']);
  const [allowDuplicates, setAllowDuplicates] = useState(['item1', 'item2']);
  
  // Example code with all available props
  const code = `import TextArrayInput from '@/components/official/TextArrayInput';

// Basic Usage - Controlled
<TextArrayInput
  value={tags}
  onChange={setTags}
  placeholder="Add items (press Enter)"    // Default: "Add items (press Enter)"
  className=""                             // Additional className for wrapper
  chipClassName="bg-gradient-radial from-primary via-primary to-primary/80 text-primary-foreground"
  uniqueFilter={true}                      // Default: true - prevents duplicates
  showCopyIcon={true}                      // Default: true - shows copy button
  shouldCleanUrl={false}                   // Default: false - clean URLs with cleanUrl()
/>

// Uncontrolled Usage
<TextArrayInput 
  placeholder="Add items..."
/>

// URL List with URL Cleaning
<TextArrayInput
  value={urls}
  onChange={setUrls}
  placeholder="Add URLs..."
  shouldCleanUrl={true}                    // Cleans URLs automatically
/>

// Custom Styled Chips
<TextArrayInput
  value={tags}
  onChange={setTags}
  chipClassName="bg-gradient-to-r from-violet-500 to-indigo-500 text-white"
/>

// Allow Duplicates
<TextArrayInput
  value={items}
  onChange={setItems}
  uniqueFilter={false}                     // Allows duplicate entries
/>

// Features:
// ✅ Add items by pressing Enter
// ✅ Add multiple items at once (comma-separated)
// ✅ Remove items by clicking X
// ✅ Copy all items to clipboard
// ✅ Optional URL cleaning
// ✅ Optional unique filtering
// ✅ Custom chip styling
// ✅ Controlled or uncontrolled
// ✅ Visual feedback on copy`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Flexible tag/chip input component for managing arrays of strings. Supports add, remove, copy, custom styling, and optional URL cleaning."
    >
      <div className="w-full max-w-2xl space-y-8">
        {/* Demo 1: Basic Usage */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Basic Usage
          </h3>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="demo-1">Technologies</Label>
              <TextArrayInput
                value={basicTags}
                onChange={setBasicTags}
                placeholder="Add technologies (press Enter)..."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Current value: <code className="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                {JSON.stringify(basicTags)}
              </code>
            </p>
            <p className="text-xs text-muted-foreground">
              💡 <strong>Tip:</strong> Type "vue, angular, svelte" to add multiple items at once
            </p>
          </div>
        </div>

        {/* Demo 2: URL Cleaning */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            URL Cleaning Mode
          </h3>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="demo-2">Website URLs</Label>
              <TextArrayInput
                value={urlList}
                onChange={setUrlList}
                placeholder="Add URLs..."
                shouldCleanUrl={true}
                chipClassName="bg-blue-500 text-white"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              💡 URLs are automatically cleaned (removes protocols, www, trailing slashes)
            </p>
          </div>
        </div>

        {/* Demo 3: Allow Duplicates */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Allow Duplicates
          </h3>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="demo-3">Items (Duplicates Allowed)</Label>
              <TextArrayInput
                value={allowDuplicates}
                onChange={setAllowDuplicates}
                placeholder="Add items..."
                uniqueFilter={false}
                chipClassName="bg-gradient-to-r from-green-500 to-emerald-500 text-white"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Try adding the same item multiple times - duplicates are allowed!
            </p>
          </div>
        </div>

        {/* Demo 4: Custom Styling */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Custom Chip Styles
          </h3>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 space-y-4">
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Outline Style</Label>
                <TextArrayInput
                  placeholder="Add items..."
                  chipClassName="border-2 border-purple-500 text-purple-600 dark:text-purple-400 bg-transparent hover:bg-purple-50 dark:hover:bg-purple-950"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Solid Style</Label>
                <TextArrayInput
                  placeholder="Add items..."
                  chipClassName="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-100 border border-orange-200 dark:border-orange-700"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Demo 5: Uncontrolled */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Uncontrolled Usage
          </h3>
          <div className="p-4 border rounded-lg bg-white dark:bg-gray-800 space-y-4">
            <div className="space-y-1.5">
              <Label>Internal State (No Props)</Label>
              <TextArrayInput 
                placeholder="Manages its own state..."
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Component manages its own state when no value/onChange props provided
            </p>
          </div>
        </div>

        {/* Features showcase */}
        <div className="p-4 border rounded-lg bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-950 dark:to-purple-950">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Component Features
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Add items with Enter key</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Add multiple items (comma-separated)</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Remove items with X button</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Copy all items to clipboard</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Optional URL cleaning</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Optional duplicate prevention</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Fully customizable chip styles</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Controlled or uncontrolled</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Visual feedback on copy</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-600 dark:text-green-400">✓</span>
              <span>Empty state display</span>
            </div>
          </div>
        </div>

        {/* Usage tips */}
        <div className="p-4 border rounded-lg bg-amber-50 dark:bg-amber-950/20">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Usage Tips
          </h3>
          <ul className="space-y-1 text-sm text-gray-700 dark:text-gray-300 list-disc list-inside">
            <li>Press Enter or click away to add items</li>
            <li>Separate multiple items with commas: "item1, item2, item3"</li>
            <li>Click the copy icon to copy all items as comma-separated text</li>
            <li>Click X on any chip to remove that item</li>
            <li>Use shouldCleanUrl for URL lists (removes protocols, www, etc.)</li>
            <li>Set uniqueFilter to false if you need duplicate entries</li>
            <li>Customize chip appearance with chipClassName prop</li>
            <li>Works in both controlled and uncontrolled modes</li>
          </ul>
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
}

