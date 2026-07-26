'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { ImagePreviewRow } from '@/components/image/shared/ImagePreviewRow';
import { Button } from '@/components/ui/button';
import { X, Search } from 'lucide-react';
import { ImageManager } from '@/components/image/ImageManager';

type SizeVariant = 'xs' | 's' | 'm' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

// Sample image URLs for the user images tab
const sampleImageUrls = [
  'https://images.unsplash.com/photo-1614974121916-81eadb4dd6b2?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHw5fHxsYXMlMjBWZWdhc3xlbnwwfHx8fDE3Mzk3NzI3NDJ8MA&ixlib=rb-4.0.3&q=80&w=1080',
  'https://images.unsplash.com/photo-1605379399843-5870eea9b74e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOXx8Y29kaW5nfGVufDB8fHx8MTczOTg1MDkwOXww&ixlib=rb-4.0.3&q=80&w=1080',
  'https://images.unsplash.com/photo-1526628953301-3e589a6a8b74?crop=entropy&cs=srgb&fm=jpg&ixid=M3w2NjE4MDZ8MHwxfHNlYXJjaHwxOHx8ZGlnaXRhbCUyMHJlcG9ydHxlbnwwfHx8fDE3NDU3NjgzNTJ8MA&ixlib=rb-4.0.3&q=85'
];

// Demo wrapper with actual image selection
const ImagePreviewDemo = ({ size = 'm', showRemoveButton = true, showCount = true }: {
  size?: SizeVariant;
  showRemoveButton?: boolean;
  showCount?: boolean;
}) => {
  const { selectedImages, clearImages } = useSelectedImages();
  const [isManagerOpen, setIsManagerOpen] = useState(false);
  
  console.log('ImagePreviewDemo rendering with', {
    selectedCount: selectedImages.length,
    size
  });
  
  return (
    <div className="w-full space-y-4">
      <div className="flex justify-between">
        <Button 
          size="sm" 
          onClick={() => setIsManagerOpen(true)}
          className="flex items-center gap-1"
        >
          <Search className="h-4 w-4" />
          Select Images
        </Button>
        
        {selectedImages.length > 0 && (
          <Button 
            size="sm" 
            variant="outline" 
            onClick={clearImages}
            className="flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>
      
      <div className="w-full py-4">
        <ImagePreviewRow 
          size={size} 
          showRemoveButton={showRemoveButton} 
          showCount={showCount}
          emptyText="Select images using the button above"
        />
      </div>
      
      <ImageManager
        isOpen={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
        initialSelectionMode="multiple"
        initialTab="user-images"
        userImages={sampleImageUrls}
      />
    </div>
  );
};

export default function ImagePreviewRowDemo({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  const code = `import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImageManager } from '@/components/image/ImageManager';
import { useSelectedImages } from '@/components/image/context/SelectedImagesProvider';
import { ImagePreviewRow } from '@/components/image/shared/ImagePreviewRow';
import { Search, X } from 'lucide-react';

// Sample images for the User Images tab
const sampleImages = [
  'https://example.com/image1.jpg',
  'https://example.com/image2.jpg',
  'https://example.com/image3.jpg'
];

function MyComponent() {
  const { selectedImages, clearImages } = useSelectedImages();
  const [isManagerOpen, setIsManagerOpen] = useState(false);

  return (
    <div className="space-y-4">
      {/* Button to open image manager */}
      <div className="flex justify-between">
        <Button 
          onClick={() => setIsManagerOpen(true)}
          size="sm"
          className="flex items-center gap-1"
        >
          <Search className="h-4 w-4" />
          Select Images
        </Button>
        
        {selectedImages.length > 0 && (
          <Button 
            onClick={clearImages}
            size="sm"
            variant="outline"
            className="flex items-center gap-1"
          >
            <X className="h-4 w-4" />
            Clear All
          </Button>
        )}
      </div>
      
      {/* Image preview row */}
      <div className="py-2">
        <h3 className="text-sm font-medium mb-2">Selected Images</h3>
        <ImagePreviewRow 
          size="m"                  // Size: 'xs', 's', 'm', 'lg', 'xl', '2xl', '3xl', '4xl', '5xl'
          showRemoveButton={true}   // Show remove buttons on images
          showCount={true}          // Show count badge
          emptyText="No images selected"
          className="w-full"
        />
      </div>
      
      {/* Image Manager for selecting images */}
      <ImageManager
        isOpen={isManagerOpen}
        onClose={() => setIsManagerOpen(false)}
        initialSelectionMode="multiple"
        initialTab="user-images"
        userImages={sampleImages}
      />
    </div>
  );
}`;

  return (
    <Tabs defaultValue="medium">
      <TabsList className="mb-4 flex flex-wrap">
        <TabsTrigger value="xs">XS</TabsTrigger>
        <TabsTrigger value="small">Small</TabsTrigger>
        <TabsTrigger value="medium">Medium</TabsTrigger>
        <TabsTrigger value="large">Large</TabsTrigger>
        <TabsTrigger value="xl">XL</TabsTrigger>
        <TabsTrigger value="2xl">2XL</TabsTrigger>
        <TabsTrigger value="3xl">3XL</TabsTrigger>
        <TabsTrigger value="4xl">4XL</TabsTrigger>
        <TabsTrigger value="5xl">5XL</TabsTrigger>
      </TabsList>
      
      <TabsContent value="xs">
        <ComponentDisplayWrapper
          component={component}
          code={code}
          description="Extra small size preview row. Perfect for compact displays in headers or tight spaces."
        >
          <ImagePreviewDemo size="xs" />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="small">
        <ComponentDisplayWrapper
          component={component}
          code={code}
          description="Small size image preview row, suitable for toolbars or compact UI elements."
        >
          <ImagePreviewDemo size="s" />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="medium">
        <ComponentDisplayWrapper
          component={component}
          code={code}
          description="Medium size image preview row (default). A balanced size for most use cases."
        >
          <ImagePreviewDemo size="m" />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="large">
        <ComponentDisplayWrapper
          component={component}
          code={code}
          description="Large image preview row for applications where image details need to be more visible."
        >
          <ImagePreviewDemo size="lg" />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="xl">
        <ComponentDisplayWrapper
          component={component}
          code={code}
          description="Extra large image preview row for maximum visibility of image content."
        >
          <ImagePreviewDemo size="xl" />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="2xl">
        <ComponentDisplayWrapper
          component={component}
          code={code}
          description="2XL size for more prominent image display and better preview details."
        >
          <ImagePreviewDemo size="2xl" />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="3xl">
        <ComponentDisplayWrapper
          component={component}
          code={code}
          description="3XL size for larger image previews in dedicated image management interfaces."
        >
          <ImagePreviewDemo size="3xl" />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="4xl">
        <ComponentDisplayWrapper
          component={component}
          code={code}
          description="4XL size offering substantial preview area for detailed image examination."
        >
          <ImagePreviewDemo size="4xl" />
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="5xl">
        <ComponentDisplayWrapper
          component={component}
          code={code}
          description="5XL size providing the largest preview experience, ideal for image-focused interfaces."
        >
          <ImagePreviewDemo size="5xl" />
        </ComponentDisplayWrapper>
      </TabsContent>
    </Tabs>
  );
} 