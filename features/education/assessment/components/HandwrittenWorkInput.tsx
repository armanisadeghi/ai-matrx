"use client";

// features/education/assessment/components/HandwrittenWorkInput.tsx
//
// The reusable "photograph your worked answer" input — a lightweight image
// picker/snap zone that holds ONE photo in local state and previews it, for the
// vision grading path. Shared by the assessment take flow (a free-response item
// answered by photo) AND the standalone "Grade my handwritten work" surface.
//
// It intentionally does NOT upload — it just surfaces a `File`; the grading core
// (imageGrading.ts) owns the fileHandler upload at grade time. On mobile,
// `capture="environment"` prefers the rear camera so a student can snap their
// notebook directly.
//
// React Compiler is on: no manual useMemo / useCallback / React.memo.

import { useEffect, useRef, useState } from "react";
import { Camera, ImageUp, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function HandwrittenWorkInput({
  photo,
  onPhotoChange,
  disabled,
  className,
}: {
  photo: File | null;
  onPhotoChange: (file: File | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Object-URL lifecycle: mint on new file, revoke on change/unmount.
  useEffect(() => {
    if (!photo) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const pick = () => {
    if (disabled) return;
    inputRef.current?.click();
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          onPhotoChange(file);
          // Allow re-selecting the same file later.
          e.target.value = "";
        }}
      />

      {previewUrl ? (
        <div className="relative overflow-hidden rounded-xl border border-border bg-muted">
          {/* Local preview of the learner's own selected file — not our stored media. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Your handwritten work"
            className="max-h-80 w-full object-contain"
          />
          {!disabled && (
            <button
              type="button"
              onClick={() => onPhotoChange(null)}
              className="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-full bg-background/80 text-foreground shadow-sm backdrop-blur transition-colors hover:bg-background"
              aria-label="Remove photo"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={pick}
          disabled={disabled}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-8 text-center transition-colors",
            !disabled && "hover:border-primary/50 hover:bg-accent/40",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          <div className="flex items-center gap-2 text-muted-foreground">
            <Camera className="h-5 w-5" />
            <ImageUp className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium text-foreground">
            Snap or upload your handwritten work
          </span>
          <span className="text-xs text-muted-foreground">
            A clear photo of your worked solution — graded step by step.
          </span>
        </button>
      )}
    </div>
  );
}
