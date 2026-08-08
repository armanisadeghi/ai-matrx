"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  ChevronLeft,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  ExternalLink,
  Globe,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourcePickerSubViewHeader } from "./ResourcePickerSubViewHeader";
import { useOpenImageUploaderWindow } from "@/features/window-panels/windows/image/useOpenImageUploaderWindow";
import { CloudFolders } from "@/features/files/utils/folder-conventions";

interface ImageUrlResourcePickerProps {
  onBack: () => void;
  onSelect: (imageUrl: ImageUrlData) => void;
  onSwitchTo?: (type: "webpage" | "youtube" | "file_url", url: string) => void;
  initialUrl?: string;
}

type ImageUrlData = {
  url: string;
  type: string; // MIME type
  isValid: boolean;
};

// Normalize a URL by prepending https:// if no protocol is present
function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Detect URL type — tolerates bare domains (no protocol)
function detectUrlType(url: string): "youtube" | "image" | "webpage" | "file" {
  try {
    const urlObj = new URL(normalizeUrl(url));

    if (
      urlObj.hostname.includes("youtube.com") ||
      urlObj.hostname.includes("youtu.be")
    ) {
      return "youtube";
    }

    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".ico",
    ];
    const pathname = urlObj.pathname.toLowerCase();
    if (imageExtensions.some((ext) => pathname.endsWith(ext))) {
      return "image";
    }

    const fileExtensions = [
      ".pdf",
      ".doc",
      ".docx",
      ".xls",
      ".xlsx",
      ".ppt",
      ".pptx",
      ".txt",
      ".csv",
      ".json",
      ".xml",
      ".zip",
    ];
    if (fileExtensions.some((ext) => pathname.endsWith(ext))) {
      return "file";
    }

    return "webpage";
  } catch {
    return "webpage";
  }
}

// Validate if URL is accessible and is an image
async function validateImageUrl(
  url: string,
): Promise<{
  isValid: boolean;
  type?: string;
  error?: string;
  suggestedType?: "webpage" | "youtube" | "file_url";
}> {
  try {
    const normalized = normalizeUrl(url);
    const urlObj = new URL(normalized);

    // Detect URL type
    const detectedType = detectUrlType(normalized);

    if (detectedType === "youtube") {
      return {
        isValid: false,
        error: "This appears to be a YouTube URL",
        suggestedType: "youtube",
      };
    }

    if (detectedType === "file") {
      return {
        isValid: false,
        error: "This appears to be a file URL",
        suggestedType: "file_url",
      };
    }

    if (detectedType === "webpage") {
      return {
        isValid: false,
        error:
          "This appears to be a webpage. Would you like to scrape it instead?",
        suggestedType: "webpage",
      };
    }

    // Check if URL ends with common image extensions
    const imageExtensions = [
      ".jpg",
      ".jpeg",
      ".png",
      ".gif",
      ".webp",
      ".svg",
      ".bmp",
      ".ico",
    ];
    const pathname = urlObj.pathname.toLowerCase();
    const hasImageExtension = imageExtensions.some((ext) =>
      pathname.endsWith(ext),
    );

    if (!hasImageExtension) {
      return {
        isValid: false,
        error:
          "URL does not appear to be an image. Please ensure it ends with an image extension (.jpg, .png, etc.)",
        suggestedType: "webpage",
      };
    }

    // Attempt to determine MIME type from extension
    let mimeType = "image/jpeg"; // default
    if (pathname.endsWith(".png")) mimeType = "image/png";
    else if (pathname.endsWith(".gif")) mimeType = "image/gif";
    else if (pathname.endsWith(".webp")) mimeType = "image/webp";
    else if (pathname.endsWith(".svg")) mimeType = "image/svg+xml";

    return { isValid: true, type: mimeType };
  } catch (error) {
    return { isValid: false, error: "Invalid URL format" };
  }
}

export function ImageUrlResourcePicker({
  onBack,
  onSelect,
  onSwitchTo,
  initialUrl,
}: ImageUrlResourcePickerProps) {
  const [url, setUrl] = useState(initialUrl || "");
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedType, setSuggestedType] = useState<
    "webpage" | "youtube" | "file_url" | null
  >(null);
  const [previewImage, setPreviewImage] = useState<ImageUrlData | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const openImageUploader = useOpenImageUploaderWindow();

  const handleUploadInstead = () => {
    openImageUploader({
      preset: "social",
      title: "Upload image",
      description: "Drop an image to upload — we'll fill the URL below.",
      folder: `${CloudFolders.CHAT_ATTACHMENTS}/resources`,
      currentUrl: url || null,
      onUploaded: (e) => {
        const uploadedUrl = e.result.primary_url;
        if (!uploadedUrl) return;
        setUrl(uploadedUrl);
        void handleValidate(uploadedUrl);
      },
    });
  };

  // Auto-focus the input on mount (preventScroll to avoid auto-scroll)
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Auto-validate if initialUrl is provided
  useEffect(() => {
    if (initialUrl && initialUrl.trim()) {
      handleValidate();
    }
  }, [initialUrl]);

  const handleValidate = async (rawUrl?: string) => {
    const target = normalizeUrl(rawUrl ?? url);
    setUrl(target);
    setError(null);
    setSuggestedType(null);
    setPreviewImage(null);

    if (!target.trim()) {
      setError("Please enter an image URL");
      return;
    }

    setIsValidating(true);

    try {
      const validation = await validateImageUrl(target);

      if (!validation.isValid) {
        setError(validation.error || "Invalid image URL");
        setSuggestedType(validation.suggestedType || null);
        return;
      }

      const imageData: ImageUrlData = {
        url: target,
        type: validation.type || "image/jpeg",
        isValid: true,
      };

      setPreviewImage(imageData);
    } catch (err) {
      setError(
        "Could not validate image URL. Please check the URL and try again.",
      );
    } finally {
      setIsValidating(false);
    }
  };

  const handleSelect = () => {
    if (previewImage) {
      onSelect(previewImage);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isValidating) {
      handleValidate();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData("text");
    setUrl(pastedText);
    setTimeout(() => handleValidate(pastedText), 50);
  };

  return (
    <div className="flex flex-col max-h-[min(460px,70dvh)]">
      {/* Header */}
      <ResourcePickerSubViewHeader
        title="Image URL"
        onBack={onBack}
        icon={
          <ImageIcon className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
        }
      />

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
        <div className="space-y-2">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              onPaste={handlePaste}
              placeholder="https://example.com/image.jpg"
              className="flex-1 text-xs h-7"
              disabled={isValidating}
            />
            <Button
              size="sm"
              onClick={() => void handleValidate()}
              disabled={isValidating || !url.trim()}
              className="h-7 w-7 p-0"
              variant="ghost"
            >
              {isValidating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-muted-foreground">
              Paste a direct URL to an image file
            </p>
            <button
              type="button"
              onClick={handleUploadInstead}
              className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
            >
              <Upload className="w-2.5 h-2.5" />
              or upload one
            </button>
          </div>
        </div>

        {/* Error with suggestion */}
        {error && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 p-2 border border-destructive/20 bg-destructive/10 rounded">
              <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{error}</p>
            </div>
            {suggestedType && onSwitchTo && (
              <Button
                size="sm"
                className="w-full text-xs h-8"
                onClick={() => onSwitchTo(suggestedType, url)}
              >
                <Globe className="w-3.5 h-3.5 mr-1.5" />
                Switch to{" "}
                {suggestedType === "webpage"
                  ? "Webpage"
                  : suggestedType === "youtube"
                    ? "YouTube"
                    : "File URL"}
              </Button>
            )}
          </div>
        )}

        {/* Image Preview */}
        {previewImage && (
          <div className="border-border rounded-lg overflow-hidden">
            {/* Image */}
            <div className="relative h-48 bg-muted flex items-center justify-center">
              <img
                src={previewImage.url}
                alt="Preview"
                className="max-w-full max-h-full object-contain"
                onError={() =>
                  setError(
                    "Failed to load image. The URL may be incorrect or the image may not be accessible.",
                  )
                }
              />
            </div>

            {/* Info */}
            <div className="p-2 space-y-1 bg-background">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground">
                  Type:
                </span>
                <span className="text-xs font-medium text-foreground">
                  {previewImage.type}
                </span>
              </div>
              <a
                href={previewImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 truncate"
              >
                <span className="truncate">{previewImage.url}</span>
                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
              </a>
            </div>
          </div>
        )}

        {/* Help Text */}
        {!previewImage && !error && (
          <div className="p-2.5 border border-blue-500/20 bg-blue-500/10 rounded-lg">
            <p className="text-xs text-blue-600 dark:text-blue-400">
              <strong>Supported formats:</strong>
            </p>
            <ul className="text-xs text-blue-600 dark:text-blue-400 mt-1 space-y-0.5 ml-3">
              <li>• .jpg / .jpeg</li>
              <li>• .png</li>
              <li>• .gif</li>
              <li>• .webp</li>
              <li>• .svg</li>
            </ul>
          </div>
        )}
      </div>

      {/* Footer with Add Button */}
      {previewImage && (
        <div className="border-t border-border p-2">
          <Button onClick={handleSelect} className="w-full" size="sm">
            <ImageIcon className="w-4 h-4 mr-2" />
            Add Image
          </Button>
        </div>
      )}
    </div>
  );
}
