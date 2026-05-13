'use client';

import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from 'sonner';
import { useFileUpload } from '@/features/files';

// Default aspect ratio options
const DEFAULT_ASPECT_RATIOS = [
  { label: 'Square (1:1)', value: 1 / 1 },
  { label: 'Landscape (16:9)', value: 16 / 9 },
  { label: 'Landscape (3:2)', value: 3 / 2 },
  { label: 'Landscape (4:3)', value: 4 / 3 },
  { label: 'Portrait (9:16)', value: 9 / 16 },
  { label: 'Portrait (2:3)', value: 2 / 3 },
  { label: 'Free', value: null },
];

export interface AspectRatioOption {
  label: string;
  value: number | null;
}

interface ImageCropperProps {
  imageUrl: string;
  onComplete: (croppedImageUrl: string) => void;
  trigger?: React.ReactNode;
  aspectRatios?: AspectRatioOption[];
}

const ImageCropper = ({ 
  imageUrl, 
  onComplete, 
  trigger,
  aspectRatios 
}: ImageCropperProps) => {
  // Use provided aspect ratios or default to the predefined ones
  const availableAspectRatios = aspectRatios || DEFAULT_ASPECT_RATIOS;
  
  // Dialog state
  const [isOpen, setIsOpen] = useState(false);
  
  // Cropper state
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  // Default to the first available aspect ratio
  const [aspect, setAspect] = useState<number | null>(
    availableAspectRatios.length ? availableAspectRatios[0].value : 1
  );
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  
  // Upload state
  const [isProcessing, setIsProcessing] = useState(false);
  const { upload, uploading: isLoading } = useFileUpload();

  const handleCropAreaComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const createImage = (url): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const image = new Image();
      image.addEventListener('load', () => resolve(image));
      image.addEventListener('error', (error) => reject(error));
      
      // This is crucial for avoiding "tainted canvas" errors
      if (url.startsWith('data:')) {
        image.src = url;
      } else {
        image.crossOrigin = 'anonymous';
        image.src = url;
      }
    });

  const getCroppedImg = async (imageSrc, pixelCrop): Promise<Blob> => {
    try {
      const image = await createImage(imageSrc);
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('No 2d context');
      }

      // Set canvas dimensions to cropped size
      canvas.width = pixelCrop.width;
      canvas.height = pixelCrop.height;

      // Draw the cropped image
      ctx.drawImage(
        image,
        pixelCrop.x,
        pixelCrop.y,
        pixelCrop.width,
        pixelCrop.height,
        0,
        0,
        pixelCrop.width,
        pixelCrop.height
      );

      // Return as a blob
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            throw new Error('Canvas is empty');
          }
          resolve(blob);
        }, 'image/jpeg');
      });
    } catch (e) {
      console.error('Error creating cropped image:', e);
      throw e;
    }
  };

  const handleCropImage = async () => {
    if (!croppedAreaPixels) return;
    
    setIsProcessing(true);
    try {
      // First try as-is
      let croppedImage;
      try {
        croppedImage = await getCroppedImg(imageUrl, croppedAreaPixels);
      } catch (error) {
        console.log('First attempt failed, trying with data URL conversion:', error);
        
        // If direct cropping fails due to CORS, try with data URL conversion
        const image = new Image();
        image.crossOrigin = 'anonymous';
        
        await new Promise((resolve, reject) => {
          image.onload = resolve;
          image.onerror = reject;
          image.src = imageUrl;
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        
        // Convert to data URL (this step makes it same-origin)
        const dataUrl = canvas.toDataURL('image/jpeg');
        
        // Now crop from the data URL
        croppedImage = await getCroppedImg(dataUrl, croppedAreaPixels);
      }

      // Convert the Blob to a File object for uploading
      const file = new File(
        [croppedImage], 
        `cropped-image-${Date.now()}.jpg`, 
        { type: 'image/jpeg' }
      );
      
      // Upload the cropped image via the universal handler.
      const normalized = await upload(
        { kind: "file", file },
        {
          folderPath: "Shared Assets",
          visibility: "public",
          createShareLink: true,
          shareLinkPermissionLevel: "read",
        },
      );

      if (normalized.url) {
        onComplete(normalized.url);
        setIsOpen(false);
      } else {
        toast.error("Couldn't save cropped image: no URL returned");
      }
    } catch (e) {
      const reason = e instanceof Error ? e.message : 'Failed to crop image';
      console.error('Failed to crop image:', e);
      // Replaces a banned native `alert()` (per CLAUDE.md UI rules) and
      // surfaces the real reason instead of a generic message.
      toast.error(`Couldn't save cropped image: ${reason}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Don't render anything if no image is provided
  if (!imageUrl) {
    return null;
  }

  return (
    <>
      {/* Trigger button or custom trigger */}
      {trigger ? (
        <div onClick={() => setIsOpen(true)}>{trigger}</div>
      ) : (
        <Button 
          variant="outline" 
          onClick={() => setIsOpen(true)}
          className="w-full"
        >
          Crop Image
        </Button>
      )}

      {/* Cropper Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md md:max-w-xl">
          <DialogHeader>
            <DialogTitle>Crop Image</DialogTitle>
          </DialogHeader>
          
          {/* Cropper area */}
          <div className="relative h-80 w-full bg-muted rounded-md overflow-hidden">
            <Cropper
              image={imageUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={handleCropAreaComplete}
              classes={{
                containerClassName: "bg-muted",
                mediaClassName: "bg-muted",
              }}
            />
          </div>

          {/* Controls */}
          <div className="space-y-4">
            {/* Zoom slider */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label className="text-sm font-medium">Zoom</Label>
                <span className="text-xs text-muted-foreground">{zoom.toFixed(1)}x</span>
              </div>
              <Slider
                value={[zoom]}
                min={1}
                max={3}
                step={0.1}
                onValueChange={(values) => setZoom(values[0])}
              />
            </div>

            {/* Aspect ratio selection - only show if more than one aspect ratio is available */}
            {availableAspectRatios.length > 1 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Aspect Ratio</Label>
                <div className="flex flex-wrap gap-2">
                  {availableAspectRatios.map((ratio) => (
                    <Button
                      key={ratio.label}
                      size="sm"
                      variant={aspect === ratio.value ? "default" : "outline"}
                      onClick={() => setAspect(ratio.value)}
                      className="h-8 px-2 text-xs"
                    >
                      {ratio.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="sm:justify-between">
            <Button
              variant="outline"
              onClick={() => setIsOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCropImage}
              disabled={isProcessing || isLoading || !croppedAreaPixels}
            >
              {isProcessing || isLoading ? 'Processing...' : 'Save & Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default ImageCropper;