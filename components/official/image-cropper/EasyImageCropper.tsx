'use client';

import { useState, useEffect, useRef } from "react";
import { SingleImageSelect } from "@/components/image/shared/SingleImageSelect";
import ImageCropper, { AspectRatioOption } from "./ImageCropper";

import { Button } from "@ai-matrx/design-system/controls";
interface EasyImageCropperProps {
  onComplete: (croppedImageUrl: string) => void;
  aspectRatios?: AspectRatioOption[];
  initialImageUrl?: string;
}

const EasyImageCropper = ({
  onComplete,
  aspectRatios,
  initialImageUrl = "",
}: EasyImageCropperProps) => {
  const [selectedImageUrl, setSelectedImageUrl] = useState(initialImageUrl);
  const [croppedImageUrl, setCroppedImageUrl] = useState("");
  const [shouldShowCropper, setShouldShowCropper] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  
  // This effect handles showing the cropper when a new image is selected
  useEffect(() => {
    if (selectedImageUrl && triggerRef.current) {
      // If we have a selected image URL and either:
      // 1. We have no cropped image yet, or
      // 2. The selected image is different from the cropped image
      if (!croppedImageUrl || selectedImageUrl !== croppedImageUrl) {
        setTimeout(() => {
          if (triggerRef.current) {
            triggerRef.current.click();
          }
        }, 100);
      }
    }
  }, [selectedImageUrl, croppedImageUrl]);

  const handleImageSelected = (imageUrl: string) => {
    // If user selects a new image (or first image)
    if (imageUrl !== croppedImageUrl) {
      setSelectedImageUrl(imageUrl);
      setShouldShowCropper(true);
    }
  };

  const handleCropComplete = (newCroppedImageUrl: string) => {
    setCroppedImageUrl(newCroppedImageUrl);
    setSelectedImageUrl(newCroppedImageUrl); // Display the cropped image
    setShouldShowCropper(false);
    onComplete(newCroppedImageUrl);
  };

  const handleReset = () => {
    setSelectedImageUrl("");
    setCroppedImageUrl("");
    setShouldShowCropper(false);
    onComplete("");
  };

  // Determine which image URL to display
  const displayImageUrl = croppedImageUrl || selectedImageUrl;

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative">
        <SingleImageSelect
          instanceId="image-crop-select"
          aspectRatio="landscape"
          size="lg"
          placeholder="Select Image"
          onImageSelected={handleImageSelected}
          preselectedImageUrl={displayImageUrl}
        />
        
        {displayImageUrl && (
          <Button variant="outline" onClick={handleReset} className="absolute top-2 right-2">Reset</Button>
        )}
      </div>
      
      {shouldShowCropper && (
        <ImageCropper
          imageUrl={selectedImageUrl}
          onComplete={handleCropComplete}
          aspectRatios={aspectRatios}
          trigger={
            <div ref={triggerRef} className="hidden">
              {/* Hidden trigger element */}
            </div>
          }
        />
      )}
    </div>
  );
};

export { EasyImageCropper };
export default EasyImageCropper;