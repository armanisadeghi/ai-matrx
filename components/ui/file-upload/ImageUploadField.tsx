import React, { useState, useRef } from "react";
import { Image, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { useFileUpload } from "@/features/files";

interface ImageUploadFieldProps {
  value?: string;
  onChange: (url: string) => void;
  label: string;
  /**
   * Logical folder path under cld_files (e.g. "Images/Banners"). The
   * Python backend creates intermediate folders atomically.
   */
  folderPath: string;
}

const ImageUploadField: React.FC<ImageUploadFieldProps> = ({
  value,
  onChange,
  label,
  folderPath,
}) => {
  const [isHovering, setIsHovering] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const { upload, error } = useFileUpload();

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }

    try {
      setIsUploading(true);
      const normalized = await upload(
        { kind: "file", file },
        {
          folderPath,
          visibility: "public",
          createShareLink: true,
          shareLinkPermissionLevel: "read",
        },
      );
      const url = normalized.url;
      if (url) {
        onChange(url);
      } else {
        toast.error("Upload failed: no URL returned");
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Upload failed";
      // eslint-disable-next-line no-console
      console.error("Upload error:", err);
      toast.error(`Upload failed: ${reason}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleClick = () => fileInputRef.current?.click();
  const handleClearImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange("");
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {label}
      </label>

      <div
        className={`border-2 border-dashed rounded-lg transition-colors cursor-pointer
          ${isHovering || isUploading ? "border-rose-400 bg-rose-50 dark:bg-rose-900/10" : "border-gray-300 dark:border-gray-600"}
          ${value ? "h-64" : "h-40"}
          relative overflow-hidden`}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
        onClick={handleClick}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="image/*"
          onChange={handleUpload}
        />

        {isUploading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-pulse text-rose-500 dark:text-rose-400 flex flex-col items-center">
              <Upload className="h-8 w-8 mb-2" />
              <span>Uploading...</span>
            </div>
          </div>
        ) : value ? (
          <div className="relative h-full w-full group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt="App Banner"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-opacity flex items-center justify-center">
              <button
                className="p-2 rounded-full bg-white text-gray-700 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleClearImage}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="h-full w-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <Image className="h-10 w-10 mb-2" />
            <p className="text-sm">Click or drag to upload an image</p>
            <p className="text-xs mt-1">Recommended size: 1200 × 630 pixels</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-500 text-xs mt-1">{error.message}</p>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Upload an image for your app banner. This will be displayed on the app card.
      </p>
    </div>
  );
};

export default ImageUploadField;
