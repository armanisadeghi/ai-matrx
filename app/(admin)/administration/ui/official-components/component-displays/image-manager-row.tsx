'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { ImageManagerRow } from '@/components/image/shared/ImageManagerRow';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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

export default function ImageManagerRowDemo({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  return (
    <Tabs defaultValue="basic">
      <TabsList className="mb-4">
        <TabsTrigger value="basic">Basic Usage</TabsTrigger>
        <TabsTrigger value="sizes">Size Options</TabsTrigger>
        <TabsTrigger value="customization">Customization</TabsTrigger>
        <TabsTrigger value="advanced">Advanced Configuration</TabsTrigger>
      </TabsList>
      
      <TabsContent value="basic">
        <ComponentDisplayWrapper
          component={component}
          code={`import { ImageManagerRow } from '@/components/image/shared/ImageManagerRow';

// Inside your component:
function BasicExample() {
  // Simply render the component to get a fully functional image selection row
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">Default Image Manager Row</h3>
        <ImageManagerRow />
      </div>
      
      <div>
        <h3 className="text-sm font-medium mb-2">Without Manage Button</h3>
        <ImageManagerRow showManageButton={false} />
      </div>
      
      <div>
        <h3 className="text-sm font-medium mb-2">With Count Badge</h3>
        <ImageManagerRow showCount={true} />
      </div>
    </div>
  );
}`}
          description="The ImageManagerRow combines the image preview row with the image manager. It shows a clickable dashed border when empty and displays selected images when available. Clicking the row opens the image manager."
        >
          <BasicUsageDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="sizes">
        <ComponentDisplayWrapper
          component={component}
          code={`import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImageManagerRow } from '@/components/image/shared/ImageManagerRow';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';

function SizesExample() {
  const { clearImages } = useSelectedImages();
  const [selectedSize, setSelectedSize] = useState('m');
  
  const sizes = ['xs', 's', 'm', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'];
  
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 mb-4">
        {sizes.map(size => (
          <Button 
            key={size}
            size="sm"
            variant={selectedSize === size ? 'default' : 'outline'}
            onClick={() => setSelectedSize(size)}
          >
            {size}
          </Button>
        ))}
      </div>
      
      <div>
        <h3 className="text-sm font-medium mb-2">Size: {selectedSize}</h3>
        <ImageManagerRow size={selectedSize} />
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
          description="The ImageManagerRow supports different size options to match your UI needs, from extra small (xs) to extra large (5xl)."
        >
          <SizesDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="customization">
        <ComponentDisplayWrapper
          component={component}
          code={`import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { ImageManagerRow } from '@/components/image/shared/ImageManagerRow';

function CustomizationExample() {
  // Customization options
  const [showManageButton, setShowManageButton] = useState(true);
  const [showRemoveButton, setShowRemoveButton] = useState(true);
  const [showCount, setShowCount] = useState(true);
  const [clickToAddText, setClickToAddText] = useState('Click to add images');
  const [manageButtonText, setManageButtonText] = useState('Manage Images');
  
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="show-manage">Show Manage Button</Label>
            <Switch 
              id="show-manage" 
              checked={showManageButton}
              onCheckedChange={setShowManageButton}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="show-remove">Show Remove Button</Label>
            <Switch 
              id="show-remove" 
              checked={showRemoveButton}
              onCheckedChange={setShowRemoveButton}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="show-count">Show Count</Label>
            <Switch 
              id="show-count" 
              checked={showCount}
              onCheckedChange={setShowCount}
            />
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="click-text">Empty State Text</Label>
            <Input 
              id="click-text" 
              value={clickToAddText}
              onChange={(e) => setClickToAddText(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="manage-text">Manage Button Text</Label>
            <Input 
              id="manage-text" 
              value={manageButtonText}
              onChange={(e) => setManageButtonText(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      <div className="p-4 border rounded-lg">
        <h3 className="text-sm font-medium mb-4">Preview</h3>
        <ImageManagerRow 
          showManageButton={showManageButton}
          showRemoveButton={showRemoveButton}
          showCount={showCount}
          clickToAddText={clickToAddText}
          manageButtonText={manageButtonText}
        />
      </div>
    </div>
  );
}`}
          description="Customize text, buttons, and appearance to fit your application's needs and design language."
        >
          <CustomizationDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="advanced">
        <ComponentDisplayWrapper
          component={component}
          code={`import { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ImageManagerRow } from '@/components/image/shared/ImageManagerRow';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';

function AdvancedExample() {
  const { clearImages } = useSelectedImages();
  
  // Image Manager configuration
  const [enforceSelectionMode, setEnforceSelectionMode] = useState(true);
  const [selectionMode, setSelectionMode] = useState("single");
  
  // Tab visibility configuration
  const allTabs = [
    { id: "public-search", label: "Public Images" },
    { id: "user-images", label: "Your Images" },
    { id: "upload-images", label: "Upload" },
    { id: "paste-images", label: "Paste" },
    { id: "quick-upload", label: "Quick Upload" }
  ];
  
  const [visibleTabs, setVisibleTabs] = useState(["upload-images"]);
  const [initialTab, setInitialTab] = useState("upload-images");
  
  // Toggle a tab's visibility
  const toggleTab = (tabId) => {
    if (visibleTabs.includes(tabId)) {
      const newTabs = visibleTabs.filter(id => id !== tabId);
      setVisibleTabs(newTabs);
      
      // If removing the currently selected tab, choose a different one
      if (initialTab === tabId && newTabs.length > 0) {
        setInitialTab(newTabs[0]);
      }
    } else {
      const newTabs = [...visibleTabs, tabId];
      setVisibleTabs(newTabs);
    }
  };
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Image Manager Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label htmlFor="enforce-mode">Lock Selection Mode</Label>
                <Switch 
                  id="enforce-mode" 
                  checked={enforceSelectionMode}
                  onCheckedChange={setEnforceSelectionMode}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="selection-mode">Selection Mode</Label>
                <Select 
                  value={selectionMode} 
                  onValueChange={setSelectionMode}
                >
                  <SelectTrigger id="selection-mode">
                    <SelectValue placeholder="Selection Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Image</SelectItem>
                    <SelectItem value="multiple">Multiple Images</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Visible Tabs</Label>
                <div className="flex flex-wrap gap-2">
                  {allTabs.map(tab => (
                    <Button
                      key={tab.id}
                      size="sm"
                      variant={visibleTabs.includes(tab.id) ? "default" : "outline"}
                      onClick={() => toggleTab(tab.id)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="initial-tab">Initial Tab</Label>
                <Select 
                  value={initialTab} 
                  onValueChange={setInitialTab}
                  disabled={visibleTabs.length === 0}
                >
                  <SelectTrigger id="initial-tab">
                    <SelectValue placeholder="Select initial tab" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleTabs.map(tabId => {
                      const tab = allTabs.find(t => t.id === tabId);
                      return (
                        <SelectItem key={tabId} value={tabId}>
                          {tab?.label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="p-4 border rounded-lg">
        <h3 className="text-sm font-medium mb-4">Custom Configuration</h3>
        <ImageManagerRow 
          imageManagerProps={{
            enforceSelectionMode,
            initialSelectionMode: selectionMode as "single" | "multiple",
            visibleTabs: visibleTabs.length > 0 ? visibleTabs : undefined,
            initialTab
          }}
          showCount={true}
        />
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
          description="Configure advanced behaviors like selection mode enforcement, visible tabs, and initial active tab to create specialized image selection experiences."
        >
          <AdvancedDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
    </Tabs>
  );
}

// Demo component for basic usage
function BasicUsageDemo() {
  const { clearImages } = useSelectedImages();
  
  return (
    <div className="w-full space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Default Image Manager Row</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">Click anywhere on the row to open the image manager</p>
        <div className="bg-white dark:bg-gray-950 rounded-lg">
          <ImageManagerRow />
        </div>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Without Manage Button</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">The row is still clickable, but doesn't show the manage button when images are selected</p>
        <div className="bg-white dark:bg-gray-950 rounded-lg">
          <ImageManagerRow showManageButton={false} />
        </div>
      </div>
      
      <div className="space-y-2">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">With Count Badge</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400">Shows the number of selected images</p>
        <div className="bg-white dark:bg-gray-950 rounded-lg">
          <ImageManagerRow showCount={true} />
        </div>
      </div>
      
      <Button
        variant="outline"
        size="sm"
        onClick={clearImages}
      >
        Clear All Selections
      </Button>
    </div>
  );
}

// Demo component for size options
function SizesDemo() {
  const { clearImages } = useSelectedImages();
  const [selectedSize, setSelectedSize] = useState<'xs' | 's' | 'm' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl'>('m');
  
  const sizes = ['xs', 's', 'm', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'] as const;
  
  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap gap-2 mb-4">
        {sizes.map(size => (
          <Button 
            key={size}
            size="sm"
            variant={selectedSize === size ? 'default' : 'outline'}
            onClick={() => setSelectedSize(size)}
          >
            {size}
          </Button>
        ))}
      </div>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Current Size: <span className="font-bold">{selectedSize}</span></h3>
          <Badge>{selectedSize}</Badge>
        </div>
        
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
          <ImageManagerRow 
            size={selectedSize} 
            showCount={true}
          />
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

// Demo component for customization options
function CustomizationDemo() {
  // Customization options
  const [showManageButton, setShowManageButton] = useState(true);
  const [showRemoveButton, setShowRemoveButton] = useState(true);
  const [showCount, setShowCount] = useState(true);
  const [clickToAddText, setClickToAddText] = useState('Click to add images');
  const [manageButtonText, setManageButtonText] = useState('Manage');
  
  return (
    <div className="w-full space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="show-manage">Show Manage Button</Label>
            <Switch 
              id="show-manage" 
              checked={showManageButton}
              onCheckedChange={setShowManageButton}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="show-remove">Show Remove Button</Label>
            <Switch 
              id="show-remove" 
              checked={showRemoveButton}
              onCheckedChange={setShowRemoveButton}
            />
          </div>
          
          <div className="flex items-center justify-between">
            <Label htmlFor="show-count">Show Count</Label>
            <Switch 
              id="show-count" 
              checked={showCount}
              onCheckedChange={setShowCount}
            />
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="click-text">Empty State Text</Label>
            <Input 
              id="click-text" 
              value={clickToAddText}
              onChange={(e) => setClickToAddText(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="manage-text">Manage Button Text</Label>
            <Input 
              id="manage-text" 
              value={manageButtonText}
              onChange={(e) => setManageButtonText(e.target.value)}
            />
          </div>
        </div>
      </div>
      
      <div className="bg-white dark:bg-gray-950 rounded-lg p-2">
        <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Preview</h3>
        <ImageManagerRow 
          showManageButton={showManageButton}
          showRemoveButton={showRemoveButton}
          showCount={showCount}
          clickToAddText={clickToAddText}
          manageButtonText={manageButtonText}
        />
      </div>
    </div>
  );
}

// Demo component for advanced configuration
function AdvancedDemo() {
  const { clearImages } = useSelectedImages();
  
  // Image Manager configuration
  const [enforceSelectionMode, setEnforceSelectionMode] = useState(true);
  const [selectionMode, setSelectionMode] = useState<"single" | "multiple">("single");
  
  // Tab visibility configuration
  const allTabs = [
    { id: "public-search", label: "Public Images" },
    { id: "user-images", label: "Your Images" },
    { id: "upload-images", label: "Upload" },
    { id: "paste-images", label: "Paste" },
    { id: "quick-upload", label: "Quick Upload" }
  ];
  
  const [visibleTabs, setVisibleTabs] = useState<string[]>(["upload-images"]);
  const [initialTab, setInitialTab] = useState("upload-images");
  
  // Toggle a tab's visibility
  const toggleTab = (tabId: string) => {
    if (visibleTabs.includes(tabId)) {
      const newTabs = visibleTabs.filter(id => id !== tabId);
      setVisibleTabs(newTabs);
      
      // If removing the currently selected tab, choose a different one
      if (initialTab === tabId && newTabs.length > 0) {
        setInitialTab(newTabs[0]);
      }
    } else {
      const newTabs = [...visibleTabs, tabId];
      setVisibleTabs(newTabs);
    }
  };
  
  return (
    <div className="w-full space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Image Manager Configuration</CardTitle>
          <CardDescription>Configure how the image manager behaves when opened</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enforce-mode" className="block">Lock Selection Mode</Label>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Prevent users from changing mode</p>
                </div>
                <Switch 
                  id="enforce-mode" 
                  checked={enforceSelectionMode}
                  onCheckedChange={setEnforceSelectionMode}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="selection-mode">Selection Mode</Label>
                <Select 
                  value={selectionMode} 
                  onValueChange={(value) => setSelectionMode(value as "single" | "multiple")}
                >
                  <SelectTrigger id="selection-mode">
                    <SelectValue placeholder="Selection Mode" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="single">Single Image</SelectItem>
                    <SelectItem value="multiple">Multiple Images</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Visible Tabs</Label>
                <div className="flex flex-wrap gap-2">
                  {allTabs.map(tab => (
                    <Button
                      key={tab.id}
                      size="sm"
                      variant={visibleTabs.includes(tab.id) ? "default" : "outline"}
                      onClick={() => toggleTab(tab.id)}
                    >
                      {tab.label}
                    </Button>
                  ))}
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="initial-tab">Initial Tab</Label>
                <Select 
                  value={initialTab} 
                  onValueChange={setInitialTab}
                  disabled={visibleTabs.length === 0}
                >
                  <SelectTrigger id="initial-tab">
                    <SelectValue placeholder="Select initial tab" />
                  </SelectTrigger>
                  <SelectContent>
                    {visibleTabs.map(tabId => {
                      const tab = allTabs.find(t => t.id === tabId);
                      return (
                        <SelectItem key={tabId} value={tabId}>
                          {tab?.label}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Custom Configuration</h3>
          <Badge className="bg-blue-500 dark:bg-blue-600">
            {selectionMode === "single" ? "Single Image Mode" : "Multiple Images Mode"}
          </Badge>
        </div>
        <ImageManagerRow 
          imageManagerProps={{
            enforceSelectionMode,
            initialSelectionMode: selectionMode,
            visibleTabs: visibleTabs.length > 0 ? visibleTabs : undefined,
            initialTab,
            userImages: visibleTabs.includes("user-images") ? sampleImageUrls : []
          }}
          showCount={true}
        />
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