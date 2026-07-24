'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { Button } from '@/components/ui/button';
import { ImageManager } from '@/components/image/ImageManager';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { ImagePreviewRow } from '@/components/image/shared/ImagePreviewRow';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

// Sample image URLs to demonstrate with
const sampleImageUrls = [
  'https://images.unsplash.com/photo-1614974121916-81eadb4dd6b2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHw5fHxsYXMlMjBWZWdhc3xlbnwwfHx8fDE3Mzk3NzI3NDJ8MA&ixlib=rb-4.0.3&q=80&w=1080',
  'https://images.unsplash.com/photo-1605379399843-5870eea9b74e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOXx8Y29kaW5nfGVufDB8fHx8MTczOTg1MDkwOXww&ixlib=rb-4.0.3&q=80&w=1080',
  'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?crop=entropy&cs=srgb&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOHx8ZGlnaXRhbCUyMHJlcG9ydHxlbnwwfHx8fDE3NDU3NjgzNTJ8MA&ixlib=rb-4.0.3&q=85'
];

export default function ImageManagerDemo({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  return (
    <Tabs defaultValue="basic">
      <TabsList className="mb-4">
        <TabsTrigger value="basic">Basic Usage</TabsTrigger>
        <TabsTrigger value="selection-modes">Selection Modes</TabsTrigger>
        <TabsTrigger value="custom-tabs">Custom Tabs</TabsTrigger>
        <TabsTrigger value="advanced">Advanced Controls</TabsTrigger>
      </TabsList>
      
      <TabsContent value="basic">
        <ComponentDisplayWrapper
          component={component}
          code={`import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImageManager } from '@/components/image/ImageManager';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { ImagePreviewRow } from '@/components/image/shared/ImagePreviewRow';

// Sample image URLs you might have in your application
const sampleUserImages = [
  'https://example.com/image1.jpg',
  'https://example.com/image2.jpg',
  'https://example.com/image3.jpg'
];

function ImageManagerExample() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedImages, clearImages } = useSelectedImages();
  
  // Function to handle when user confirms image selection
  const handleSave = () => {
    console.log("User selected these images:", selectedImages);
    // Do something with selectedImages here
    setIsOpen(false);
  };
  
  return (
    <div className="space-y-4">
      <Button onClick={() => setIsOpen(true)}>
        Open Image Manager
      </Button>
      
      {/* Display selected images */}
      {selectedImages.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Selected Images</h3>
          <ImagePreviewRow size="m" showRemoveButton={true} />
        </div>
      )}
      
      <ImageManager 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSave={handleSave}
        initialSelectionMode="multiple"
        initialTab="user-images"
        userImages={sampleUserImages}  // Your custom user images
      />
    </div>
  );
}`}
          description="The ImageManager is a full-screen overlay that allows users to browse, search, and select images from different sources. It includes tabs for public image search, user's own images, uploads, and more."
        >
          <BasicImageManagerDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="selection-modes">
        <ComponentDisplayWrapper
          component={component}
          code={`import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImageManager } from '@/components/image/ImageManager';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { ImagePreviewRow } from '@/components/image/shared/ImagePreviewRow';

function SelectionModeExample() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedImages } = useSelectedImages();
  const [selectionMode, setSelectionMode] = useState<"single" | "multiple">("multiple");
  
  return (
    <div className="space-y-4">
      <div className="flex gap-2 items-center">
        <span className="text-sm font-medium">Mode:</span>
        <Button 
          size="sm" 
          variant={selectionMode === "single" ? "default" : "outline"}
          onClick={() => setSelectionMode("single")}
        >
          Single Selection
        </Button>
        <Button 
          size="sm" 
          variant={selectionMode === "multiple" ? "default" : "outline"}
          onClick={() => setSelectionMode("multiple")}
        >
          Multiple Selection
        </Button>
      </div>
      
      <Button onClick={() => setIsOpen(true)}>
        Open Image Manager
      </Button>
      
      {selectedImages.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium mb-2">Selected Images ({selectedImages.length})</h3>
          <ImagePreviewRow size="m" showRemoveButton={true} />
        </div>
      )}
      
      <ImageManager 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialSelectionMode={selectionMode}
        initialTab="public-search"
      />
    </div>
  );
}`}
          description="The ImageManager supports both single and multiple selection modes. In single mode, only one image can be selected at a time. In multiple mode, users can select multiple images."
        >
          <SelectionModeDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="custom-tabs">
        <ComponentDisplayWrapper
          component={component}
          code={`import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImageManager } from '@/components/image/ImageManager';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { ImagePreviewRow } from '@/components/image/shared/ImagePreviewRow';

function CustomTabExample() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedImages } = useSelectedImages();
  const [activeTab, setActiveTab] = useState<string>("public-search");
  
  const tabOptions = [
    { value: "public-search", label: "Public Images" },
    { value: "user-images", label: "Your Images" },
    { value: "upload-images", label: "Upload" },
    { value: "paste-images", label: "Paste" },
    { value: "quick-upload", label: "Quick Upload" },
    { value: "cloud-images", label: "Cloud Storage" }
  ];
  
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium mb-2">Initial Tab</h3>
        <div className="flex flex-wrap gap-2">
          {tabOptions.map(tab => (
            <Button
              key={tab.value}
              size="sm"
              variant={activeTab === tab.value ? "default" : "outline"}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>
      
      <Button onClick={() => setIsOpen(true)}>
        Open Image Manager with "{tabOptions.find(t => t.value === activeTab)?.label}" Tab
      </Button>
      
      <ImageManager 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialTab={activeTab}
      />
    </div>
  );
}`}
          description="The ImageManager lets you specify which tab should be active when it's opened. You can choose from Public Images, Your Images, Upload, Paste, Quick Upload, and Cloud Storage tabs."
        >
          <CustomTabDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="advanced">
        <ComponentDisplayWrapper
          component={component}
          code={`import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImageManager } from '@/components/image/ImageManager';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { ImagePreviewRow } from '@/components/image/shared/ImagePreviewRow';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

function AdvancedControlsExample() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedImages, clearImages } = useSelectedImages();
  
  // Advanced control settings
  const [enforceSelectionMode, setEnforceSelectionMode] = useState(true);
  const [selectionMode, setSelectionMode] = useState<"single" | "multiple">("single");
  
  // Tab visibility controls
  const allTabs = [
    { id: "public-search", label: "Public Images" },
    { id: "user-images", label: "Your Images" },
    { id: "upload-images", label: "Upload" },
    { id: "paste-images", label: "Paste" },
    { id: "quick-upload", label: "Quick Upload" },
    { id: "cloud-images", label: "Cloud Storage" }
  ];
  
  const [visibleTabIds, setVisibleTabIds] = useState<string[]>(["public-search", "user-images"]);
  
  const toggleTab = (tabId: string) => {
    if (visibleTabIds.includes(tabId)) {
      setVisibleTabIds(visibleTabIds.filter(id => id !== tabId));
    } else {
      setVisibleTabIds([...visibleTabIds, tabId]);
    }
  };
  
  return (
    <div className="space-y-6">
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
        <h3 className="text-sm font-medium mb-4 text-gray-700 dark:text-gray-300">
          Advanced Controls
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enforce-mode">Enforce Selection Mode</Label>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Prevent users from changing selection mode
              </div>
            </div>
            <Switch 
              id="enforce-mode" 
              checked={enforceSelectionMode}
              onCheckedChange={setEnforceSelectionMode}
            />
          </div>
          
          <div>
            <Label className="mb-2 block">Selection Mode</Label>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant={selectionMode === "single" ? "default" : "outline"}
                onClick={() => setSelectionMode("single")}
              >
                Single Selection
              </Button>
              <Button 
                size="sm" 
                variant={selectionMode === "multiple" ? "default" : "outline"}
                onClick={() => setSelectionMode("multiple")}
              >
                Multiple Selection
              </Button>
            </div>
          </div>
          
          <div>
            <Label className="mb-2 block">Visible Tabs</Label>
            <div className="flex flex-wrap gap-3 mb-2">
              {allTabs.map(tab => (
                <div key={tab.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={tab.id}
                    checked={visibleTabIds.includes(tab.id)}
                    onCheckedChange={() => toggleTab(tab.id)}
                  />
                  <Label htmlFor={tab.id}>{tab.label}</Label>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              {visibleTabIds.length === 0 && "Please select at least one tab."}
            </div>
          </div>
        </div>
      </div>
      
      <Button
        onClick={() => setIsOpen(true)}
        disabled={visibleTabIds.length === 0}
      >
        Open Configured Image Manager
      </Button>
      
      {selectedImages.length > 0 && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
          <div className="flex justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Selected Images ({selectedImages.length})
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={clearImages}
            >
              Clear Selection
            </Button>
          </div>
          <ImagePreviewRow size="m" showRemoveButton={true} />
        </div>
      )}
      
      <ImageManager 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialSelectionMode={selectionMode}
        enforceSelectionMode={enforceSelectionMode}
        visibleTabs={visibleTabIds.length > 0 ? visibleTabIds : undefined}
        userImages={visibleTabIds.includes("user-images") ? sampleImageUrls : []}
      />
    </div>
  );
}`}
          description="Advanced controls for the ImageManager. Restrict selection modes, lock them to prevent changes, and selectively show or hide specific tabs based on your application needs."
        >
          <AdvancedControlsDemo />
        </ComponentDisplayWrapper>
      </TabsContent>
    </Tabs>
  );
}

// Basic demo component
function BasicImageManagerDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedImages, clearImages } = useSelectedImages();
  
  // Handle when user confirms the selection
  const handleSave = () => {
    console.log("User saved selected images:", selectedImages);
    // In a real application, you would do something with these selected images
    setIsOpen(false);
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between items-center">
        <Button 
          onClick={() => setIsOpen(true)}
          className="px-4 py-2"
        >
          Open Image Manager
        </Button>
        
        {selectedImages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearImages}
          >
            Clear Selection
          </Button>
        )}
      </div>
      
      {/* Display currently selected images */}
      {selectedImages.length > 0 ? (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
          <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Selected Images ({selectedImages.length})
          </h3>
          <ImagePreviewRow 
            size="m"
            className="w-full" 
            showRemoveButton={true} 
            showCount={true} 
          />
        </div>
      ) : (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border text-center text-gray-500 dark:text-gray-400">
          No images selected. Click the button above to open the Image Manager.
        </div>
      )}
      
      {/* The ImageManager component */}
      <ImageManager 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSave={handleSave}
        initialSelectionMode="multiple"
        initialTab="user-images"
        userImages={sampleImageUrls}
      />
    </div>
  );
}

// Selection mode demo component
function SelectionModeDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedImages, clearImages } = useSelectedImages();
  const [selectionMode, setSelectionMode] = useState<"single" | "multiple">("multiple");
  
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Selection Mode:</span>
        <Button 
          size="sm" 
          variant={selectionMode === "single" ? "default" : "outline"}
          onClick={() => setSelectionMode("single")}
          className="min-w-24"
        >
          Single
        </Button>
        <Button 
          size="sm" 
          variant={selectionMode === "multiple" ? "default" : "outline"}
          onClick={() => setSelectionMode("multiple")}
          className="min-w-24"
        >
          Multiple
        </Button>
        
        <div className="ml-auto">
          <Badge className="bg-blue-500 dark:bg-blue-600 hover:bg-blue-600 dark:hover:bg-blue-700">
            {selectionMode === "single" ? "Can select only 1 image" : "Can select multiple images"}
          </Badge>
        </div>
      </div>
      
      <div className="flex justify-between items-center">
        <Button 
          onClick={() => setIsOpen(true)}
          className="px-4 py-2"
        >
          Open Image Manager
        </Button>
        
        {selectedImages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={clearImages}
          >
            Clear Selection
          </Button>
        )}
      </div>
      
      {/* Display currently selected images */}
      {selectedImages.length > 0 ? (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
          <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">
            Selected Images ({selectedImages.length})
          </h3>
          <ImagePreviewRow 
            size="m"
            className="w-full" 
            showRemoveButton={true} 
            showCount={true} 
          />
        </div>
      ) : (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border text-center text-gray-500 dark:text-gray-400">
          No images selected. Click the button above to open the Image Manager.
        </div>
      )}
      
      <ImageManager 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialSelectionMode={selectionMode}
        initialTab="public-search"
      />
    </div>
  );
}

// Custom tab demo component
function CustomTabDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("public-search");
  
  const tabOptions = [
    { value: "public-search", label: "Public Images" },
    { value: "user-images", label: "Your Images" },
    { value: "upload-images", label: "Upload" },
    { value: "paste-images", label: "Paste" },
    { value: "quick-upload", label: "Quick Upload" },
    { value: "cloud-images", label: "Cloud Storage" }
  ];
  
  return (
    <div className="w-full space-y-4">
      <div className="mb-4">
        <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Initial Tab</h3>
        <div className="flex flex-wrap gap-2">
          {tabOptions.map(tab => (
            <Button
              key={tab.value}
              size="sm"
              variant={activeTab === tab.value ? "default" : "outline"}
              onClick={() => setActiveTab(tab.value)}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>
      
      <Button 
        onClick={() => setIsOpen(true)}
        className="px-4 py-2"
      >
        Open with "{tabOptions.find(t => t.value === activeTab)?.label}" Tab
      </Button>
      
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          The ImageManager will open with the {tabOptions.find(t => t.value === activeTab)?.label} tab active. This is useful when you want to guide users directly to a specific function.
        </p>
      </div>
      
      <ImageManager 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialTab={activeTab}
        userImages={activeTab === "user-images" ? sampleImageUrls : []}
      />
    </div>
  );
}

// Advanced controls demo component
function AdvancedControlsDemo() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedImages, clearImages } = useSelectedImages();
  
  // Advanced control settings
  const [enforceSelectionMode, setEnforceSelectionMode] = useState(true);
  const [selectionMode, setSelectionMode] = useState<"single" | "multiple">("single");
  
  // Tab visibility controls
  const allTabs = [
    { id: "public-search", label: "Public Images" },
    { id: "user-images", label: "Your Images" },
    { id: "upload-images", label: "Upload" },
    { id: "paste-images", label: "Paste" },
    { id: "quick-upload", label: "Quick Upload" },
    { id: "cloud-images", label: "Cloud Storage" }
  ];
  
  const [visibleTabIds, setVisibleTabIds] = useState<string[]>(["public-search", "user-images"]);
  
  const toggleTab = (tabId: string) => {
    if (visibleTabIds.includes(tabId)) {
      setVisibleTabIds(visibleTabIds.filter(id => id !== tabId));
    } else {
      setVisibleTabIds([...visibleTabIds, tabId]);
    }
  };
  
  return (
    <div className="w-full space-y-6">
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
        <h3 className="text-sm font-medium mb-4 text-gray-700 dark:text-gray-300">
          Advanced Controls
        </h3>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="enforce-mode">Enforce Selection Mode</Label>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                Prevent users from changing selection mode
              </div>
            </div>
            <Switch 
              id="enforce-mode" 
              checked={enforceSelectionMode}
              onCheckedChange={setEnforceSelectionMode}
            />
          </div>
          
          <div>
            <Label className="mb-2 block">Selection Mode</Label>
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant={selectionMode === "single" ? "default" : "outline"}
                onClick={() => setSelectionMode("single")}
              >
                Single Selection
              </Button>
              <Button 
                size="sm" 
                variant={selectionMode === "multiple" ? "default" : "outline"}
                onClick={() => setSelectionMode("multiple")}
              >
                Multiple Selection
              </Button>
            </div>
          </div>
          
          <div>
            <Label className="mb-2 block">Visible Tabs</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-2">
              {allTabs.map(tab => (
                <div key={tab.id} className="flex items-center space-x-2">
                  <Checkbox 
                    id={`tab-${tab.id}`}
                    checked={visibleTabIds.includes(tab.id)}
                    onCheckedChange={() => toggleTab(tab.id)}
                  />
                  <Label htmlFor={`tab-${tab.id}`}>{tab.label}</Label>
                </div>
              ))}
            </div>
            {visibleTabIds.length === 0 && (
              <div className="text-xs text-red-500 dark:text-red-400 mt-1">
                Please select at least one tab.
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="flex items-center gap-4">
        <Button
          onClick={() => setIsOpen(true)}
          disabled={visibleTabIds.length === 0}
          className="px-4 py-2"
        >
          Open Configured Image Manager
        </Button>
        
        <Badge className={visibleTabIds.length === 0 ? "bg-red-500 dark:bg-red-600" : "bg-green-500 dark:bg-green-600"}>
          {visibleTabIds.length === 0 
            ? "No tabs selected" 
            : `${visibleTabIds.length} tab${visibleTabIds.length > 1 ? 's' : ''} visible`}
        </Badge>
      </div>
      
      {selectedImages.length > 0 && (
        <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
          <div className="flex justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Selected Images ({selectedImages.length})
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={clearImages}
            >
              Clear Selection
            </Button>
          </div>
          <ImagePreviewRow size="m" showRemoveButton={true} />
        </div>
      )}
      
      <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg border-border">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <span className="font-medium">Configuration Summary:</span>
          <ul className="mt-2 space-y-1 text-gray-500 dark:text-gray-400">
            <li>• Selection Mode: <span className="font-medium">{selectionMode}</span></li>
            <li>• Mode Enforced: <span className="font-medium">{enforceSelectionMode ? "Yes" : "No"}</span></li>
            <li>• Visible Tabs: <span className="font-medium">{visibleTabIds.length > 0 ? visibleTabIds.map(id => allTabs.find(t => t.id === id)?.label).join(", ") : "None"}</span></li>
          </ul>
        </div>
      </div>
      
      <ImageManager 
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialSelectionMode={selectionMode}
        enforceSelectionMode={enforceSelectionMode}
        visibleTabs={visibleTabIds.length > 0 ? visibleTabIds : undefined}
        userImages={visibleTabIds.includes("user-images") ? sampleImageUrls : []}
      />
    </div>
  );
} 