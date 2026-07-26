'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { PublicImageSearch } from '@/components/official/PublicImageSearch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function PublicImageSearchDemo({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code for standard mode
  const standardCode = `import { PublicImageSearch } from '@/components/official/PublicImageSearch';

// Standard mode with input and button
<PublicImageSearch
  initialValue=""                // Optional initial URL value
  initialSearch="nature"         // Optional initial search query
  onSelect={(url) => {           // Callback when image is selected
    console.log('Selected URL:', url);
  }}
  placeholder="Enter image URL or search for images"
  showPreview={true}             // Show image preview thumbnail
  previewSize={48}               // Size of the preview thumbnail
/>`;

  // Example code for compact mode
  const compactCode = `import { PublicImageSearch } from '@/components/official/PublicImageSearch';

// Compact mode with just an icon button
<PublicImageSearch
  onSelect={(url) => console.log('Selected URL:', url)}
  compact={true}                 // Display only the icon button
/>`;

  // Example code for multi-select mode
  const multiSelectCode = `import { PublicImageSearch } from '@/components/official/PublicImageSearch';

// Multi-select mode to pick multiple images
<PublicImageSearch
  multiSelect={true}             // Allow selection of multiple images
  onSelect={(urls) => {          // Callback receives array of URLs
    console.log('Selected URLs:', urls);
  }}
  showPreview={true}             // Show image previews
/>`;

  // Example code for compact multi-select mode
  const compactMultiCode = `import { PublicImageSearch } from '@/components/official/PublicImageSearch';

// Compact multi-select mode
<PublicImageSearch
  multiSelect={true}             // Allow selection of multiple images
  compact={true}                 // Display only the icon button
  onSelect={(urls) => {          // Callback receives array of URLs
    console.log('Selected URLs:', urls);
  }}
/>`;

  return (
    <Tabs defaultValue="standard">
      <TabsList className="mb-4">
        <TabsTrigger value="standard">Standard</TabsTrigger>
        <TabsTrigger value="compact">Compact</TabsTrigger>
        <TabsTrigger value="multi">Multi-Select</TabsTrigger>
        <TabsTrigger value="compactMulti">Compact Multi</TabsTrigger>
      </TabsList>
      
      <TabsContent value="standard">
        <ComponentDisplayWrapper
          component={component}
          code={standardCode}
          description="Standard mode with input field, search button, and preview thumbnail. Allows searching and selecting a single image from Unsplash."
        >
          <div className="w-full max-w-lg">
            <PublicImageSearch
              initialSearch="nature"
              onSelect={(url) => {
                // In a real implementation, this would do something with the URL
                console.log('Selected URL:', url);
              }}
              showPreview={true}
              previewSize={48}
            />
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="compact">
        <ComponentDisplayWrapper
          component={component}
          code={compactCode}
          description="Compact mode displays only an icon button that changes appearance when an image is selected. Perfect for space-constrained UI elements."
        >
          <div className="w-full flex justify-center py-8">
            <PublicImageSearch
              onSelect={(url) => {
                console.log('Selected URL:', url);
              }}
              compact={true}
            />
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="multi">
        <ComponentDisplayWrapper
          component={component}
          code={multiSelectCode}
          description="Multi-select mode allows users to select multiple images. Shows preview thumbnails for selected images with clear visual feedback."
        >
          <div className="w-full max-w-lg">
            <PublicImageSearch
              multiSelect={true}
              onSelect={(urls) => {
                console.log('Selected URLs:', urls);
              }}
              showPreview={true}
            />
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="compactMulti">
        <ComponentDisplayWrapper
          component={component}
          code={compactMultiCode}
          description="Compact multi-select mode combines space efficiency with the ability to select multiple images. Shows a counter badge with the number of selected images."
        >
          <div className="w-full flex justify-center py-8">
            <PublicImageSearch
              multiSelect={true}
              compact={true}
              onSelect={(urls) => {
                console.log('Selected URLs:', urls);
              }}
            />
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
    </Tabs>
  );
} 