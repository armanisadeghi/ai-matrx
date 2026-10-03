"use client";

import React, { useState, useEffect } from "react";
import {
  ArrowRight,
  Image as ImageIcon,
  Loader2,
  AlertCircle,
  ExternalLink,
  Globe,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  PickerRow,
  PickerSearchField,
  PickerView,
  PickerViewBody,
  ResourcePickerSubViewHeader,
} from "./ResourcePickerSubViewHeader";
import { usePickerInputFocus } from "./usePickerInputFocus";
import { useOpenImageUploaderWindow } from "@/features/overlays/openers/imageUploaderWindow";
import { CloudFolders } from "@/features/files/utils/folder-conventions";
import { normalizeUrl, validateImageUrl } from "./imageLink";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
  const inputRef = usePickerInputFocus();
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
      setError("Paste an image link.");
      return;
    }

    setIsValidating(true);

    try {
      const validation = await validateImageUrl(target);

      if (!validation.isValid) {
        setError(validation.error || "That is not an image link.");
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
        "That link could not be checked. Check it and try again.",
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

  // Enter belongs to this field — same rule as "Add a link" (PB-04 run 2).
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isValidating) handleValidate();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const pastedText = e.clipboardData.getData("text");
    setUrl(pastedText);
    setTimeout(() => handleValidate(pastedText), 50);
  };

  return (
    <PickerView>
      <ResourcePickerSubViewHeader
        onBack={onBack}
        search={
          <div onPaste={handlePaste}>
            <PickerSearchField
              ref={inputRef}
              type="url"
              value={url}
              onChange={setUrl}
              onKeyDown={handleKeyDown}
              loading={isValidating}
              placeholder="https://example.com/image.jpg"
            />
          </div>
        }
        actions={
          <button
            type="button"
            onClick={() => void handleValidate()}
            disabled={isValidating || !url.trim()}
            aria-label="Preview"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40 pointer-coarse:h-11 pointer-coarse:w-11"
          >
            {isValidating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRight className="h-4 w-4" />
            )}
          </button>
        }
      />

      <PickerViewBody className="space-y-2">
        {!previewImage && (
          <PickerRow
            icon={Upload}
            iconClassName="text-sky-600 dark:text-sky-400"
            label="Upload one"
            onClick={handleUploadInstead}
          />
        )}

        {/* Error with suggestion */}
        {error && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <p className="min-w-0 flex-1 text-sm text-destructive">{error}</p>
              <ErrorAlchemyMenu error={error} />
            </div>
            {suggestedType && onSwitchTo && (
              <Button
                size="sm"
                className="h-9 w-full text-sm pointer-coarse:h-11"
                onClick={() => onSwitchTo(suggestedType, url)}
              >
                <Globe className="mr-1.5 h-4 w-4" />
                Switch to{" "}
                {suggestedType === "webpage"
                  ? "Web page"
                  : suggestedType === "youtube"
                    ? "YouTube"
                    : "File link"}
              </Button>
            )}
          </div>
        )}

        {previewImage && (
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="relative flex h-56 items-center justify-center bg-muted">
              <img
                src={previewImage.url}
                alt="Preview"
                className="max-h-full max-w-full object-contain"
                onError={() =>
                  setError(
                    "That image did not load — the link may be wrong or private.",
                  )
                }
              />
            </div>
            <div className="space-y-1 bg-background p-2.5">
              <div className="text-sm font-medium text-foreground">
                {previewImage.type}
              </div>
              <a
                href={previewImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 truncate text-xs text-blue-600 hover:underline dark:text-blue-400"
              >
                <span className="truncate">{previewImage.url}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          </div>
        )}
      </PickerViewBody>

      {previewImage && (
        <div className="shrink-0 border-t border-border p-1.5">
          <Button
            onClick={handleSelect}
            className="h-9 w-full text-sm pointer-coarse:h-11"
            size="sm"
          >
            <ImageIcon className="mr-2 h-4 w-4" />
            Add image
          </Button>
        </div>
      )}
    </PickerView>
  );
}
