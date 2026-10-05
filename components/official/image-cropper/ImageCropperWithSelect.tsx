'use client';

import { useState } from "react";
import { ArrowRight, RefreshCcw } from "lucide-react";
import { SingleImageSelect } from "@/components/image/shared/SingleImageSelect";
import ImageCropper, { AspectRatioOption } from "./ImageCropper";

interface ImageCropperWithSelectProps {
  onComplete: (croppedImageUrl: string) => void;
  aspectRatios?: AspectRatioOption[];
  initialImageUrl?: string;
}

const ImageCropperWithSelect = ({
  onComplete,
  aspectRatios,
  initialImageUrl = "",
}: ImageCropperWithSelectProps) => {
  const [imageUrl, setImageUrl] = useState(initialImageUrl);
  const [finalCroppedUrl, setFinalCroppedUrl] = useState("");

  const handleCropComplete = (croppedImageUrl: string) => {
    setFinalCroppedUrl(croppedImageUrl);
    onComplete(croppedImageUrl);
  };

  const handleReset = () => {
    setImageUrl("");
    setFinalCroppedUrl("");
  };

  return (
    <div className="flex flex-row items-center justify-center space-x-4">
      <SingleImageSelect
        instanceId="select-image"
        aspectRatio="landscape"
        size="lg"
        placeholder="Select Image"
        onImageSelected={setImageUrl}
        preselectedImageUrl={imageUrl}
      />
      
      <div className="w-8 flex-none flex flex-col items-center justify-center p-4">
        {imageUrl && (
          <ImageCropper
            imageUrl={imageUrl}
            onComplete={handleCropComplete}
            aspectRatios={aspectRatios}
            trigger={
              <>
                <div className="cursor-pointer transform transition-transform hover:scale-110 type-secondary border border-border bg-textured text-gray-900 dark:text-gray-100 focus:border-rose-500 rounded-xl p-2">
                  <ArrowRight className="h-8 w-8 text-blue-500 dark:text-blue-400" /> Crop
                </div>
                <div 
                  className="cursor-pointer transform transition-transform flex items-center justify-center hover:scale-110 type-secondary border border-border bg-textured text-gray-900 dark:text-gray-100 focus:border-rose-500 rounded-xl p-2 mt-2"
                  onClick={handleReset}
                >
                  <RefreshCcw className="h-6 w-6 text-blue-500 dark:text-blue-400" />
                </div>
              </>
            }
          />
        )}
      </div>
      
      {finalCroppedUrl && (
        <div className="flex flex-col">
          <SingleImageSelect
            instanceId="cropped-image"
            aspectRatio="landscape"
            size="lg"
            placeholder="Cropped Image"
            preselectedImageUrl={finalCroppedUrl}
          />
        </div>
      )}
    </div>
  );
};

export { ImageCropperWithSelect };
export default ImageCropperWithSelect;