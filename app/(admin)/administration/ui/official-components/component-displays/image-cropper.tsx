'use client';

import React from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import { ImageCropperWithSelect } from "@/components/official/image-cropper/ImageCropperWithSelect";
import { EasyImageCropper } from "@/components/official/image-cropper/EasyImageCropper";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function ImageCropperDemo({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  // Example code for standard mode with all aspect ratios
  const standardCode = `import { ImageCropperWithSelect } from '@/components/official/image-cropper/ImageCropperWithSelect';

// Standard image cropper with all default aspect ratios
<ImageCropperWithSelect 
  onComplete={(croppedImageUrl) => {
    console.log('Cropped image URL:', croppedImageUrl);
    // Use the cropped image URL as needed
  }} 
/>`;

  // Example code for square only
  const squareCode = `import { ImageCropperWithSelect } from '@/components/official/image-cropper/ImageCropperWithSelect';

// Square aspect ratio only
const squareOnly = [
  { label: 'Square (1:1)', value: 1 / 1 }
];

<ImageCropperWithSelect 
  onComplete={(croppedImageUrl) => {
    console.log('Cropped image URL:', croppedImageUrl);
  }} 
  aspectRatios={squareOnly}
/>`;

  // Example code for landscape only
  const landscapeCode = `import { ImageCropperWithSelect } from '@/components/official/image-cropper/ImageCropperWithSelect';

// Landscape aspect ratios only
const landscapeOptions = [
  { label: 'Landscape (16:9)', value: 16 / 9 },
  { label: 'Landscape (3:2)', value: 3 / 2 },
  { label: 'Landscape (4:3)', value: 4 / 3 },
];

<ImageCropperWithSelect 
  onComplete={(croppedImageUrl) => {
    console.log('Cropped image URL:', croppedImageUrl);
  }} 
  aspectRatios={landscapeOptions}
/>`;

  // Example code for EasyImageCropper
  const easyCode = `import { EasyImageCropper } from '@/components/official/image-cropper/EasyImageCropper';

// Simple image cropper with fixed aspect ratio
const sixteenNine = [
  { label: 'Sixteen Nine (16:9)', value: 16 / 9 }
];

<EasyImageCropper 
  onComplete={(croppedImageUrl) => {
    console.log('Cropped image URL:', croppedImageUrl);
  }} 
  aspectRatios={sixteenNine}
/>`;

  // Square aspect ratio config
  const squareOnly = [
    { label: 'Square (1:1)', value: 1 / 1 }
  ];

  // Landscape aspect ratio config
  const landscapeOptions = [
    { label: 'Landscape (16:9)', value: 16 / 9 },
    { label: 'Landscape (3:2)', value: 3 / 2 },
    { label: 'Landscape (4:3)', value: 4 / 3 },
  ];

  // 16:9 aspect ratio config
  const sixteenNine = [
    { label: 'Sixteen Nine (16:9)', value: 16 / 9 }
  ];

  return (
    <Tabs defaultValue="standard">
      <TabsList className="mb-4">
        <TabsTrigger value="standard">All Ratios</TabsTrigger>
        <TabsTrigger value="square">Square Only</TabsTrigger>
        <TabsTrigger value="landscape">Landscape Only</TabsTrigger>
        <TabsTrigger value="easy">Easy Cropper</TabsTrigger>
      </TabsList>
      
      <TabsContent value="standard">
        <ComponentDisplayWrapper
          component={component}
          code={standardCode}
          description="Standard image cropper with selection for all common aspect ratios. Upload an image and crop it to your preferred dimensions."
        >
          <div className="w-full max-w-3xl">
            <ImageCropperWithSelect
              onComplete={(url) => {
                // In a real implementation, this would do something with the URL
                console.log('Cropped image URL:', url);
              }}
            />
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="square">
        <ComponentDisplayWrapper
          component={component}
          code={squareCode}
          description="Image cropper restricted to square aspect ratio only. Perfect for profile pictures and thumbnails."
        >
          <div className="w-full max-w-3xl">
            <ImageCropperWithSelect
              onComplete={(url) => {
                console.log('Cropped image URL:', url);
              }}
              aspectRatios={squareOnly}
            />
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="landscape">
        <ComponentDisplayWrapper
          component={component}
          code={landscapeCode}
          description="Image cropper with landscape aspect ratio options only. Ideal for banner images, hero sections, and widescreen media."
        >
          <div className="w-full max-w-3xl">
            <ImageCropperWithSelect
              onComplete={(url) => {
                console.log('Cropped image URL:', url);
              }}
              aspectRatios={landscapeOptions}
            />
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
      
      <TabsContent value="easy">
        <ComponentDisplayWrapper
          component={component}
          code={easyCode}
          description="Simplified image cropper with a fixed 16:9 aspect ratio. Provides a streamlined experience for quick cropping tasks."
        >
          <div className="w-full max-w-3xl">
            <EasyImageCropper
              onComplete={(url) => {
                console.log('Cropped image URL:', url);
              }}
              aspectRatios={sixteenNine}
            />
          </div>
        </ComponentDisplayWrapper>
      </TabsContent>
    </Tabs>
  );
} 