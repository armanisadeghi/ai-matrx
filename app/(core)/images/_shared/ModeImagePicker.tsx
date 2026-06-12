"use client";

/**
 * Shared "pick an image" landing for Edit / Annotate / Avatar routes when
 * no source was provided via query params. Three options:
 *   1. Drag-drop / file-picker (immediate File source)
 *   2. Paste an absolute URL
 *   3. Pick from Cloud Files (links to /files with a return URL)
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { Image as ImageIcon, Link as LinkIcon, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  title: string;
  onPick: (file: File) => void;
}

export function ModeImagePicker({ title, onPick }: Props) {
  const [urlInput, setUrlInput] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) return;
    onPick(file);
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain flex items-start md:items-center justify-center p-3 md:p-6">
      <div className="w-full max-w-xl flex flex-col gap-4 md:gap-5">
        <div className="text-center space-y-1">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            Drop an image, paste a URL, or open one from your library.
          </p>
        </div>

        <label
          className="flex min-h-[180px] flex-col items-center justify-center gap-2 rounded-lg md:rounded-xl border-2 border-dashed border-border bg-card/30 hover:bg-card/60 transition-colors cursor-pointer py-8 md:py-10"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) handleFile(f);
          }}
        >
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Upload className="h-8 w-8 text-muted-foreground" />
          <div className="text-sm">
            Drop an image here or click to browse
          </div>
          <div className="text-xs text-muted-foreground">
            PNG, JPG, WebP, GIF
          </div>
        </label>

        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <LinkIcon className="h-4 w-4 text-muted-foreground" />
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Paste an image URL"
            className="flex-1 h-10 rounded-md border border-border bg-background px-2 text-sm"
            style={{ fontSize: "16px" }}
          />
          <Button
            size="sm"
            disabled={!urlInput.trim()}
            className="min-h-[40px]"
            onClick={() => {
              const u = urlInput.trim();
              if (!u) return;
              router.replace(
                `${pathname}?url=${encodeURIComponent(u)}`,
              );
            }}
          >
            Load
          </Button>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>or</span>
          <Link
            href="/files/all"
            className="underline hover:text-foreground"
          >
            pick from your Cloud Files
          </Link>
        </div>
      </div>
    </div>
  );
}
