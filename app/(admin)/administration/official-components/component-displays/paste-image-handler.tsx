"use client";

import React, { useState } from "react";
import { ComponentEntry } from "../parts/component-list";
import { ComponentDisplayWrapper } from "../component-usage";
import { PasteImageHandler } from "@/components/ui/file-upload/PasteImageHandler";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Clipboard, CheckCircle2 } from "lucide-react";

interface ComponentDisplayProps {
  component?: ComponentEntry;
}

export default function PasteImageHandlerDisplay({
  component,
}: ComponentDisplayProps) {
  if (!component) return null;

  // The `url` we store + render into <img src> is the EMBEDDABLE direct
  // URL (`{BACKEND}/share/<token>/download`, served by Python). The
  // `pageUrl` (`/share/<token>`) is the HTML landing page on this app —
  // useful as a clickable link, but NOT for <img src>. Showing both
  // helps anyone copy/pasting this code see the difference.
  const [pastedImages, setPastedImages] = useState<
    Array<{ url: string; type: string; fileId?: string; pageUrl?: string }>
  >([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImagePasted = (result: {
    url: string;
    type: string;
    fileId?: string;
    pageUrl?: string;
  }) => {
    console.log("Image pasted:", result);
    setPastedImages((prev) => [...prev, result]);
  };

  const handleProcessingChange = (processing: boolean) => {
    setIsProcessing(processing);
  };

  // Example code with all available props and their default values
  const code = `import { PasteImageHandler } from '@/components/ui/file-upload/PasteImageHandler';

function MyComponent() {
  const [pastedImages, setPastedImages] = useState<Array<{ url: string; type: string }>>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleImagePasted = (result: { url: string; type: string }) => {
    console.log('Image pasted:', result);
    setPastedImages(prev => [...prev, result]);
  };

  const handleProcessingChange = (processing: boolean) => {
    setIsProcessing(processing);
  };

  return (
    <PasteImageHandler
      bucket="userContent"                    // Supabase storage bucket (default: "userContent")
      path="pasted-images"                    // Path within bucket (optional)
      onImagePasted={handleImagePasted}       // Callback with uploaded image result (optional)
      targetElement={null}                    // Specific element to listen on (optional)
      disabled={false}                        // Disable paste handling (default: false)
      onProcessingChange={handleProcessingChange} // Upload processing status (optional)
    >
      {/* Content where paste events will be captured */}
      <div className="p-4 border-2 border-dashed rounded-lg">
        <p>Click here and press Ctrl+V (or Cmd+V) to paste an image</p>
      </div>
    </PasteImageHandler>
  );
}

// How it works:
// 1. User copies an image to clipboard (from screenshot tool, image editor, etc.)
// 2. User focuses on the component area and presses Ctrl+V / Cmd+V
// 3. Image is automatically uploaded to Supabase storage
// 4. onImagePasted callback provides the public URL
// 5. Perfect for quick image uploads without file dialogs!`;

  return (
    <ComponentDisplayWrapper
      component={component}
      code={code}
      description="Invisible wrapper component that enables clipboard paste functionality for images. Automatically detects pasted images, uploads them to Supabase storage, and returns the public URL. Perfect for quick screenshots and image uploads without file dialogs."
    >
      <div className="w-full max-w-2xl space-y-4">
        <PasteImageHandler
          bucket="userContent"
          path="demo-pasted-images"
          onImagePasted={handleImagePasted}
          disabled={false}
          onProcessingChange={handleProcessingChange}
        >
          <div className="p-8 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors cursor-pointer">
            <div className="flex flex-col items-center justify-center text-center space-y-3">
              <Clipboard className="h-12 w-12 text-blue-500 dark:text-blue-400" />
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Try Pasting an Image Here
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  Copy an image (screenshot, image file, etc.) and press{" "}
                  <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">
                    Ctrl+V
                  </kbd>{" "}
                  or{" "}
                  <kbd className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded text-xs">
                    Cmd+V
                  </kbd>
                </p>
              </div>
              {isProcessing && (
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  <span className="text-sm">Uploading image...</span>
                </div>
              )}
            </div>
          </div>
        </PasteImageHandler>

        {pastedImages.length > 0 && (
          <Alert className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
            <AlertDescription className="text-green-800 dark:text-green-300">
              <p className="font-semibold mb-2">
                Successfully uploaded {pastedImages.length} pasted image(s):
              </p>
              <div className="space-y-3">
                {pastedImages.map((image, idx) => (
                  <div key={idx} className="space-y-1.5">
                    <div className="flex items-start gap-2">
                      <span className="text-xs font-mono bg-green-100 dark:bg-green-900/40 px-2 py-1 rounded shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="flex-1 min-w-0 space-y-1">
                        <div>
                          <span className="text-[10px] uppercase tracking-wide text-green-700 dark:text-green-400 font-semibold">
                            Direct URL (embeds)
                          </span>
                          <p className="text-xs break-all font-mono">
                            {image.url}
                          </p>
                        </div>
                        {image.pageUrl ? (
                          <div>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                              Share page URL
                            </span>
                            <p className="text-xs break-all font-mono text-muted-foreground">
                              {image.pageUrl}
                            </p>
                          </div>
                        ) : null}
                        {image.fileId ? (
                          <div>
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                              File ID (for AI APIs)
                            </span>
                            <p className="text-xs break-all font-mono text-muted-foreground">
                              {image.fileId}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <img
                      src={image.url}
                      alt={`Pasted ${idx + 1}`}
                      className="max-w-xs rounded border border-green-200 dark:border-green-800"
                    />
                  </div>
                ))}
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Alert className="bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800">
          <AlertDescription className="text-yellow-800 dark:text-yellow-300 text-xs">
            <strong>Tip:</strong> This component is perfect for quick image
            uploads from:
            <ul className="list-disc list-inside mt-1 space-y-1">
              <li>
                Screenshot tools (Windows Snipping Tool, macOS Screenshot, etc.)
              </li>
              <li>Image editing software (Photoshop, GIMP, etc.)</li>
              <li>Browser images (right-click → copy image)</li>
              <li>Any application that copies images to clipboard</li>
            </ul>
          </AlertDescription>
        </Alert>
      </div>
    </ComponentDisplayWrapper>
  );
}
