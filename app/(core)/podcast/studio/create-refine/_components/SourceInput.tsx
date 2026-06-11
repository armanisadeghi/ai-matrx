"use client";

// app/(core)/podcast/studio/create-refine/_components/SourceInput.tsx
//
// The STABLE source-input container (brief point 2): whichever control the
// selected source needs renders INSIDE a fixed-height frame, so the section
// never resizes as the user switches sources. A topic gets a single-line input;
// rough notes / full script get a large textarea; a file source gets URL rows; a
// resolve source gets the SourceResolverPanel — all occupy the same footprint.
//
// It reuses the already-wired controls (ProTextarea, Input, SourceResolverPanel)
// and lifts plain values up; it owns no request-building logic.

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ProTextarea } from "@/components/official/ProTextarea";
import { SourceResolverPanel } from "@/features/podcasts/generator/components/SourceResolverPanel";
import type { SourceOption } from "@/features/podcasts/generator/constants";

// One fixed footprint for EVERY control, so switching sources never reflows the
// page. Tall enough for the textarea + resolver; the single-line input simply
// sits at the top of the same box.
const FRAME = "min-h-[200px]";

interface SourceInputProps {
  source: SourceOption;
  rtl: boolean;
  text: string;
  onTextChange: (v: string) => void;
  urls: string[];
  onUrlsChange: (urls: string[]) => void;
  resolvedText: string;
  onResolvedChange: (v: string) => void;
  onResolverBusyChange: (busy: boolean) => void;
}

export function SourceInput({
  source,
  rtl,
  text,
  onTextChange,
  urls,
  onUrlsChange,
  resolvedText,
  onResolvedChange,
  onResolverBusyChange,
}: SourceInputProps) {
  const isTopic = source.kind === "topic";

  return (
    <div className={FRAME}>
      {source.control === "text" ? (
        isTopic ? (
          // A topic is a single line — a calm, large input, not a tall textarea.
          <Input
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={source.placeholder}
            dir={rtl ? "rtl" : undefined}
            className="h-12 text-base"
          />
        ) : (
          <ProTextarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            placeholder={source.placeholder}
            rows={8}
            dir={rtl ? "rtl" : undefined}
            autoGrow
            minHeight={200}
            className="text-base"
          />
        )
      ) : source.control === "urls" ? (
        <div className="space-y-2">
          {urls.map((url, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={url}
                onChange={(e) =>
                  onUrlsChange(
                    urls.map((u, idx) => (idx === i ? e.target.value : u)),
                  )
                }
                placeholder="https://…/document.pdf"
                inputMode="url"
              />
              {urls.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onUrlsChange(urls.filter((_, idx) => idx !== i))}
                  aria-label="Remove URL"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onUrlsChange([...urls, ""])}
            className="gap-1.5 text-muted-foreground"
          >
            <Plus className="h-4 w-4" />
            Add another file URL
          </Button>
        </div>
      ) : source.control === "resolve" && source.resolveKind ? (
        <SourceResolverPanel
          resolveKind={source.resolveKind}
          value={resolvedText}
          onChange={onResolvedChange}
          rtl={rtl}
          onBusyChange={onResolverBusyChange}
        />
      ) : null}
    </div>
  );
}
