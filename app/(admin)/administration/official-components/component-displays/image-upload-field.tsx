'use client';

import React, { useState } from 'react';
import { ComponentEntry } from '../parts/component-list';
import { ComponentDisplayWrapper } from '../component-usage';
import ImageUploadField from '@/components/ui/file-upload/ImageUploadField';

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function ImageUploadFieldDisplay({ component }: ComponentDisplayProps) {
  if (!component) return null;
  
  const [imageUrl, setImageUrl] = useState<string>('');
  const [secondImageUrl, setSecondImageUrl] = useState<string>('');

  const handleImageChange = (url: string) => {
    console.log('Image uploaded:', url);
    setImageUrl(url);
  };

  const handleSecondImageChange = (url: string) => {
    console.log('Second image uploaded:', url);
    setSecondImageUrl(url);
  };

  // Example code with all available props and their default values
  const code = `import ImageUploadField from '@/components/ui/file-upload/ImageUploadField';

function MyComponent() {
  const [imageUrl, setImageUrl] = useState<string>('');

  return (
    <ImageUploadField
      value={imageUrl}                        // Current image URL (optional)
      onChange={setImageUrl}                  // Callback with uploaded image URL (required)
      label="Upload Banner Image"             // Label for the field (required)
      folderPath="Images/Banners"             // Logical cld_files folder (required)
    />
  );
}

// Features:
// - Click or drag-and-drop to upload
// - Image validation (only accepts image files)
// - Live preview with hover effects
// - Clear/remove image functionality
// - Uploads to cld_files via the universal file handler
// - Returns a permanent share URL for the uploaded image
// - Upload progress indicator`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Specialized image upload component with preview, validation, and Supabase storage integration. Features a clean UI with hover effects, clear button, and upload progress indicator. Perfect for banner images, profile pictures, and other single-image uploads."
    >
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <ImageUploadField
            value={imageUrl}
            onChange={handleImageChange}
            label="App Banner Image"
            folderPath="Demo/Banners"
          />
          
          {imageUrl && (
            <div className="mt-3 p-3 bg-white dark:bg-neutral-800 rounded-lg">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Uploaded Image URL:
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 break-all">
                {imageUrl}
              </p>
            </div>
          )}
        </div>

        <div>
          <ImageUploadField
            value={secondImageUrl}
            onChange={handleSecondImageChange}
            label="Profile Picture"
            folderPath="Demo/Profile Pictures"
          />
          
          {secondImageUrl && (
            <div className="mt-3 p-3 bg-white dark:bg-neutral-800 rounded-lg">
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Uploaded Image URL:
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 break-all">
                {secondImageUrl}
              </p>
            </div>
          )}
        </div>
      </div>
    </ComponentDisplayWrapper>
  );
}

