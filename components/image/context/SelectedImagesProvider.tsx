"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

export interface ImageSource {
  type: "public" | "temporary" | "local" | "bucket" | "cloud-file";
  url: string;
  id: string;
  metadata?: {
    description?: string;
    title?: string;
    /** Cloud-files file id when type === "cloud-file" or after upload. */
    fileId?: string;
    /** Resolved MIME type (cloud files + uploads). */
    mimeType?: string;
    /** File size in bytes (cloud files + uploads). */
    fileSize?: number;
    /** When the resolved URL expires (epoch ms). null = permanent CDN URL. */
    urlExpiresAt?: number | null;
    [key: string]: unknown;
  };
}

interface SelectedImagesContextType {
  selectedImages: ImageSource[];
  addImage: (image: ImageSource) => void;
  removeImage: (id: string) => void;
  clearImages: () => void;
  toggleImage: (image: ImageSource) => void;
  isSelected: (id: string) => boolean;
  replaceImages: (images: ImageSource[]) => void;
  setImages: (images: ImageSource[]) => void;
  selectionMode: "single" | "multiple" | "none";
  setSelectionMode: (mode: "single" | "multiple" | "none") => void;
  resetState: () => void;
}

const SelectedImagesContext = createContext<
  SelectedImagesContextType | undefined
>(undefined);

export const useSelectedImages = () => {
  const context = useContext(SelectedImagesContext);
  if (!context) {
    throw new Error(
      "useSelectedImages must be used within a SelectedImagesProvider",
    );
  }
  return context;
};

export const SelectedImagesProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [selectedImages, setSelectedImages] = useState<ImageSource[]>([]);
  const [selectionMode, setSelectionMode] = useState<
    "single" | "multiple" | "none"
  >("none");

  const resetState = useCallback(() => {
    setSelectedImages([]);
    setSelectionMode("none");
  }, []);

  const addImage = useCallback(
    (image: ImageSource) => {
      setSelectedImages((prev) => {
        // If in single selection mode, replace any existing selection
        if (selectionMode === "single") {
          return [image];
        }
        // Otherwise add to the existing selection if not already included
        if (!prev.some((img) => img.id === image.id)) {
          const newSelection = [...prev, image];
          return newSelection;
        }
        return prev;
      });
    },
    [selectionMode],
  );

  const removeImage = useCallback((id: string) => {
    setSelectedImages((prev) => prev.filter((img) => img.id !== id));
  }, []);

  const clearImages = useCallback(() => {
    setSelectedImages([]);
  }, []);

  const toggleImage = useCallback(
    (image: ImageSource) => {
      setSelectedImages((prev) => {
        // If in single selection mode, either select this image or clear if already selected
        if (selectionMode === "single") {
          if (prev.some((img) => img.id === image.id)) {
            return [];
          }
          return [image];
        }

        // In multiple selection mode, toggle the image
        if (prev.some((img) => img.id === image.id)) {
          return prev.filter((img) => img.id !== image.id);
        }
        return [...prev, image];
      });
    },
    [selectionMode],
  );

  const isSelected = useCallback(
    (id: string) => {
      return selectedImages.some((img) => img.id === id);
    },
    [selectedImages],
  );

  const replaceImages = useCallback((images: ImageSource[]) => {
    setSelectedImages(images);
  }, []);

  const value = {
    selectedImages,
    addImage,
    removeImage,
    clearImages,
    toggleImage,
    isSelected,
    replaceImages,
    setImages: replaceImages,
    selectionMode,
    setSelectionMode,
    resetState,
  };

  return (
    <SelectedImagesContext.Provider value={value}>
      {children}
    </SelectedImagesContext.Provider>
  );
};
