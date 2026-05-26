'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { ImageManagerIcon } from '@/components/image/shared/ImageManagerIcon';
import { ImageManagerRow } from '@/components/image/shared/ImageManagerRow';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

// Sample image URLs for demos
const sampleImageUrls = [
  'https://images.unsplash.com/photo-1614974121916-81eadb4dd6b2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHw5fHxsYXMlMjBWZWdhc3xlbnwwfHx8fDE3Mzk3NzI3NDJ8MA&ixlib=rb-4.0.3&q=80&w=1080',
  'https://images.unsplash.com/photo-1605379399843-5870eea9b74e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOXx8Y29kaW5nfGVufDB8fHx8MTczOTg1MDkwOXww&ixlib=rb-4.0.3&q=80&w=1080',
  'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?crop=entropy&cs=srgb&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOHx8ZGlnaXRhbCUyMHJlcG9ydHxlbnwwfHx8fDE3NDU3NjgzNTJ8MA&ixlib=rb-4.0.3&q=85'
];

export default function ImageManagerIconDemo({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  return (
    <Tabs defaultValue="basic">
      <TabsList className="mb-4">
        <TabsTrigger value="basic">Basic Usage</TabsTrigger>
        <TabsTrigger value="sizes">Size Options</TabsTrigger>
        <TabsTrigger value="comparison">Comparison</TabsTrigger>
        <TabsTrigger value="customization">Customization</TabsTrigger>
      </TabsList>
      
      <TabsContent value="basic">
        <ComponentDisplayWrapper
          component={component}
          code={`import { ImageManagerIcon } from '@/components/image/shared/ImageManagerIcon';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { Button } from '@/components/ui/button';

function BasicExample() {
  const { clearImages } = useSelectedImages();
  
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Single Selection Mode</h3>
        <div className="flex items-center gap-6">
          <ImageManagerIcon 
            mode="single"
            emptyTooltip="Select a profile image"
            selectedTooltip="Change profile image"
          />
          <p className="text-sm text-gray-500">
            Shows a checkmark when an image is selected
          </p>
        </div>
      </div>
      
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Multiple Selection Mode</h3>
        <div className="flex items-center gap-6">
          <ImageManagerIcon 
            mode="multiple"
            emptyTooltip="Select gallery images"
            selectedTooltip="Manage gallery images"
          />
          <p className="text-sm text-gray-500">
            Shows a count badge when images are selected
          </p>
        </div>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={clearImages}
      >
        Clear Selection
      </Button>
    </div>
  );
}`}
          description="The ImageManagerIcon is a compact component that displays an icon with indicators for image selection. It integrates with the ImageManager for full image management capabilities."
        >
          <BasicUsageDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="sizes">
        <ComponentDisplayWrapper
          component={component}
          code={`import { useState } from 'react';
import { ImageManagerIcon } from '@/components/image/shared/ImageManagerIcon';
import { Button } from '@/components/ui/button';

function SizesExample() {
  const [mode, setMode] = useState('single');
  
  return (
    <div className="space-y-6">
      <div className="flex gap-6 items-center">
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Small</h3>
          <ImageManagerIcon 
            size="sm" 
            mode={mode as "single" | "multiple"}
          />
        </div>
        
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Medium (Default)</h3>
          <ImageManagerIcon 
            size="md" 
            mode={mode as "single" | "multiple"}
          />
        </div>
        
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Large</h3>
          <ImageManagerIcon 
            size="lg" 
            mode={mode as "single" | "multiple"}
          />
        </div>
      </div>
      
      <div className="flex gap-4">
        <Button 
          variant={mode === 'single' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setMode('single')}
        >
          Single Selection
        </Button>
        <Button 
          variant={mode === 'multiple' ? 'default' : 'outline'} 
          size="sm"
          onClick={() => setMode('multiple')}
        >
          Multiple Selection
        </Button>
      </div>
    </div>
  );
}`}
          description="Choose from three different size options for the ImageManagerIcon to fit your UI needs: small, medium (default), and large."
        >
          <SizesDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="comparison">
        <ComponentDisplayWrapper
          component={component}
          code={`import { ImageManagerIcon } from '@/components/image/shared/ImageManagerIcon';
import { ImageManagerRow } from '@/components/image/shared/ImageManagerRow';

function ComparisonExample() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-3">
          <h3 className="text-sm font-medium">ImageManagerIcon</h3>
          <div className="p-6 border rounded-md flex items-center justify-center">
            <ImageManagerIcon size="lg" />
          </div>
          <ul className="text-sm text-gray-500 list-disc pl-5 space-y-1">
            <li>Compact icon representation</li>
            <li>Checkmark or count indicators</li>
            <li>Good for form fields and tight spaces</li>
          </ul>
        </div>
        
        <div className="space-y-3">
          <h3 className="text-sm font-medium">ImageManagerRow</h3>
          <div className="p-6 border rounded-md flex items-center justify-center">
            <ImageManagerRow />
          </div>
          <ul className="text-sm text-gray-500 list-disc pl-5 space-y-1">
            <li>Shows image previews</li>
            <li>Horizontal scrolling for multiple images</li>
            <li>Good when previews are important</li>
          </ul>
        </div>
      </div>
    </div>
  );
}`}
          description="Compare the compact ImageManagerIcon with the more visual ImageManagerRow. Choose the right component based on your space constraints and whether image previews are important."
        >
          <ComparisonDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="customization">
        <ComponentDisplayWrapper
          component={component}
          code={`import { useState } from 'react';
import { ImageManagerIcon } from '@/components/image/shared/ImageManagerIcon';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

function CustomizationExample() {
  const [mode, setMode] = useState<"single" | "multiple">("single");
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");
  const [showCount, setShowCount] = useState(true);
  const [emptyTooltip, setEmptyTooltip] = useState("Select image");
  const [selectedTooltip, setSelectedTooltip] = useState("Change image");
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Selection Mode</Label>
            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="single"
                  checked={mode === "single"}
                  onChange={() => setMode("single")}
                />
                <Label htmlFor="single">Single</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="multiple"
                  checked={mode === "multiple"}
                  onChange={() => setMode("multiple")}
                />
                <Label htmlFor="multiple">Multiple</Label>
              </div>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Size</Label>
            <div className="flex gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="sm"
                  checked={size === "sm"}
                  onChange={() => setSize("sm")}
                />
                <Label htmlFor="sm">Small</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="md"
                  checked={size === "md"}
                  onChange={() => setSize("md")}
                />
                <Label htmlFor="md">Medium</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="radio"
                  id="lg"
                  checked={size === "lg"}
                  onChange={() => setSize("lg")}
                />
                <Label htmlFor="lg">Large</Label>
              </div>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="show-count">Show Count Badge</Label>
            <Switch 
              id="show-count" 
              checked={showCount}
              onCheckedChange={setShowCount}
            />
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="empty-tooltip">Empty State Tooltip</Label>
            <Input 
              id="empty-tooltip" 
              value={emptyTooltip}
              onChange={(e) => setEmptyTooltip(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="selected-tooltip">Selected State Tooltip</Label>
            <Input 
              id="selected-tooltip" 
              value={selectedTooltip}
              onChange={(e) => setSelectedTooltip(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      <div className="p-6 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-center">
        <ImageManagerIcon 
          mode={mode}
          size={size}
          showCount={showCount}
          emptyTooltip={emptyTooltip}
          selectedTooltip={selectedTooltip}
        />
      </div>
    </div>
  );
}`}
          description="Customize the ImageManagerIcon to match your application's needs. Adjust the selection mode, size, tooltips, and other properties."
        >
          <CustomizationDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
    </Tabs>
  );
}

// Basic usage demo component
function BasicUsageDemo() {
  const { clearImages } = useSelectedImages();
  
  return (
    <div className="w-full space-y-8">
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Single Selection Mode</h3>
        <div className="flex items-center gap-6">
          <ImageManagerIcon 
            mode="single"
            emptyTooltip="Select a profile image"
            selectedTooltip="Change profile image"
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Shows a checkmark when an image is selected
          </p>
        </div>
      </div>
      
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Multiple Selection Mode</h3>
        <div className="flex items-center gap-6">
          <ImageManagerIcon 
            mode="multiple"
            emptyTooltip="Select gallery images"
            selectedTooltip="Manage gallery images"
          />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Shows a count badge when images are selected
          </p>
        </div>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={clearImages}
      >
        Clear Selection
      </Button>
    </div>
  );
}

// Sizes demo component
function SizesDemo() {
  const [mode, setMode] = useState<'single' | 'multiple'>('single');
  const { clearImages } = useSelectedImages();
  
  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap gap-8 items-center">
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Small</h3>
          <ImageManagerIcon 
            size="sm" 
            mode={mode}
          />
        </div>
        
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Medium (Default)</h3>
          <ImageManagerIcon 
            size="md" 
            mode={mode}
          />
        </div>
        
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Large</h3>
          <ImageManagerIcon 
            size="lg" 
            mode={mode}
          />
        </div>
      </div>
      
      <div className="flex flex-wrap gap-4 items-center">
        <div className="space-y-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">Selection Mode:</p>
          <div className="flex gap-4">
            <Button 
              variant={mode === 'single' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setMode('single')}
            >
              Single Selection
            </Button>
            <Button 
              variant={mode === 'multiple' ? 'default' : 'outline'} 
              size="sm"
              onClick={() => setMode('multiple')}
            >
              Multiple Selection
            </Button>
          </div>
        </div>
        
        <div className="ml-auto">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={clearImages}
          >
            Clear Selection
          </Button>
        </div>
      </div>
    </div>
  );
}

// Comparison demo component
function ComparisonDemo() {
  const { clearImages } = useSelectedImages();
  
  return (
    <div className="w-full space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">ImageManagerIcon</h3>
          <div className="p-6 bg-white dark:bg-gray-950 border-border rounded-md flex items-center justify-center">
            <ImageManagerIcon 
              size="lg" 
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
          </div>
          <ul className="text-sm text-gray-500 dark:text-gray-400 list-disc pl-5 space-y-1">
            <li>Compact icon representation</li>
            <li>Checkmark or count indicators</li>
            <li>Good for form fields and tight spaces</li>
          </ul>
        </div>
        
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">ImageManagerRow</h3>
          <div className="p-6 bg-white dark:bg-gray-950 border-border rounded-md flex items-center justify-center">
            <ImageManagerRow 
              imageManagerProps={{
                userImages: sampleImageUrls
              }}
            />
          </div>
          <ul className="text-sm text-gray-500 dark:text-gray-400 list-disc pl-5 space-y-1">
            <li>Shows image previews</li>
            <li>Horizontal scrolling for multiple images</li>
            <li>Good when previews are important</li>
          </ul>
        </div>
      </div>
      
      <div className="flex justify-end">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={clearImages}
        >
          Clear Selection
        </Button>
      </div>
      
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 p-4 rounded-md">
        <p className="text-sm text-amber-800 dark:text-amber-200">
          Note: Both components share the same selected images state through the SelectedImagesProvider context.
        </p>
      </div>
    </div>
  );
}

// Customization demo component
function CustomizationDemo() {
  const [mode, setMode] = useState<"single" | "multiple">("single");
  const [size, setSize] = useState<"sm" | "md" | "lg">("md");
  const [showCount, setShowCount] = useState(true);
  const [emptyTooltip, setEmptyTooltip] = useState("Select image");
  const [selectedTooltip, setSelectedTooltip] = useState("Change image");
  
  return (
    <div className="w-full space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Configure Icon</CardTitle>
          <CardDescription>Customize the appearance and behavior of the ImageManagerIcon</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Selection Mode</Label>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="single"
                      checked={mode === "single"}
                      onChange={() => setMode("single")}
                      className="rounded-full text-blue-500"
                    />
                    <Label htmlFor="single" className="text-sm font-normal">Single</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="multiple"
                      checked={mode === "multiple"}
                      onChange={() => setMode("multiple")}
                      className="rounded-full text-blue-500"
                    />
                    <Label htmlFor="multiple" className="text-sm font-normal">Multiple</Label>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Size</Label>
                <div className="flex gap-4">
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="sm"
                      checked={size === "sm"}
                      onChange={() => setSize("sm")}
                      className="rounded-full text-blue-500"
                    />
                    <Label htmlFor="sm" className="text-sm font-normal">Small</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="md"
                      checked={size === "md"}
                      onChange={() => setSize("md")}
                      className="rounded-full text-blue-500"
                    />
                    <Label htmlFor="md" className="text-sm font-normal">Medium</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <input
                      type="radio"
                      id="lg"
                      checked={size === "lg"}
                      onChange={() => setSize("lg")}
                      className="rounded-full text-blue-500"
                    />
                    <Label htmlFor="lg" className="text-sm font-normal">Large</Label>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="show-count">Show Count Badge</Label>
                <Switch 
                  id="show-count" 
                  checked={showCount}
                  onCheckedChange={setShowCount}
                />
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="empty-tooltip">Empty State Tooltip</Label>
                <Input 
                  id="empty-tooltip" 
                  value={emptyTooltip}
                  onChange={(e) => setEmptyTooltip(e.target.value)}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="selected-tooltip">Selected State Tooltip</Label>
                <Input 
                  id="selected-tooltip" 
                  value={selectedTooltip}
                  onChange={(e) => setSelectedTooltip(e.target.value)}
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="p-8 bg-gray-50 dark:bg-gray-900 rounded-lg flex items-center justify-center border-border">
        <ImageManagerIcon 
          mode={mode}
          size={size}
          showCount={showCount}
          emptyTooltip={emptyTooltip}
          selectedTooltip={selectedTooltip}
          imageManagerProps={{
            userImages: sampleImageUrls
          }}
        />
      </div>
    </div>
  );
} 