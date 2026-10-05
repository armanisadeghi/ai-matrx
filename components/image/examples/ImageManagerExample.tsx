'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImageManager } from '../ImageManager';
import { SelectedImagesProvider, useSelectedImages, ImageSource } from '../context/SelectedImagesProvider';
import { ImagePreviewRow } from '../shared/ImagePreviewRow';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';

export function ImageManagerExampleContent() {
  const [isOpen, setIsOpen] = useState(false);
  const { selectedImages, clearImages } = useSelectedImages();
  
  const handleOpen = () => {
    setIsOpen(true);
  };
  
  const handleClose = () => {
    setIsOpen(false);
  };
  
  const handleClear = () => {
    clearImages();
  };
  
  return (
    <div className="container mx-auto py-10 space-y-8">
      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">Image Manager Example</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Selected Images</CardTitle>
          <CardDescription>
            {selectedImages.length > 0 
              ? `You have selected ${selectedImages.length} image${selectedImages.length !== 1 ? 's' : ''}.` 
              : 'No images selected. Click the button below to open the image manager.'}
          </CardDescription>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div className="border rounded-md p-4 bg-gray-50 dark:bg-gray-900">
            <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Preview Sizes:</h3>
            
            <div className="space-y-4">
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Extra Small (xs)</div>
                <ImagePreviewRow size="xs" />
              </div>
              
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Small (s)</div>
                <ImagePreviewRow size="s" />
              </div>
              
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Medium (m)</div>
                <ImagePreviewRow size="m" />
              </div>
              
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Large (lg)</div>
                <ImagePreviewRow size="lg" />
              </div>
              
              <div>
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Extra Large (xl)</div>
                <ImagePreviewRow size="xl" />
              </div>
            </div>
          </div>
          
          {selectedImages.length > 0 && (
            <div className="border rounded-md p-4 bg-gray-50 dark:bg-gray-900">
              <h3 className="text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">Selected Images Data:</h3>
              <pre className="text-xs overflow-auto p-2 bg-gray-100 dark:bg-gray-800 rounded max-h-60">
                {JSON.stringify(selectedImages, null, 2)}
              </pre>
            </div>
          )}
        </CardContent>
        
        <CardFooter className="flex justify-between">
          <Button onClick={handleOpen} variant="primary">
            Open Image Manager
          </Button>
          
          {selectedImages.length > 0 && (
            <Button onClick={handleClear} variant="outline">
              Clear Selected
            </Button>
          )}
        </CardFooter>
      </Card>
      
      <ImageManager 
        isOpen={isOpen} 
        onClose={handleClose} 
        initialSelectionMode="multiple"
      />
    </div>
  );
}

// Export the component directly without wrapping it
export function ImageManagerExample() {
  return <ImageManagerExampleContent />;
} 