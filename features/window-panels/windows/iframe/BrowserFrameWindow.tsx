"use client";

import React, { useCallback, useEffect, useState } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { EmbedSiteFrame } from "@/features/window-panels/components/EmbedSiteFrame";
import {
  normalizeUserUrl,
  shortUrlLabel,
} from "@/features/window-panels/utils/embed-site-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/lib/toast";
import { LUCIDE_ICONS_GALLERY_URL } from "@/utils/icons/lucide-gallery-url";

export interface BrowserFrameWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** Initial / restored URL */
  initialUrl?: string | null;
  /** Optional window chrome title override */
  initialWindowTitle?: string | null;
}

export default function BrowserFrameWindow({
  isOpen,
  onClose,
  initialUrl,
  initialWindowTitle,
}: BrowserFrameWindowProps) {
  if (!isOpen) return null;
  return (
    <BrowserFrameWindowInner
      onClose={onClose}
      initialUrl={initialUrl}
      initialWindowTitle={initialWindowTitle}
    />
  );
}

function BrowserFrameWindowInner({
  onClose,
  initialUrl,
  initialWindowTitle,
}: Omit<BrowserFrameWindowProps, "isOpen">) {
  const [url, setUrl] = useState(() =>
    initialUrl && initialUrl.trim()
      ? initialUrl.trim()
      : LUCIDE_ICONS_GALLERY_URL,
  );
  const [addressDraft, setAddressDraft] = useState(url);
  const [windowTitleExtra, setWindowTitleExtra] = useState<string | null>(() =>
    typeof initialWindowTitle === "string" && initialWindowTitle.trim()
      ? initialWindowTitle.trim()
      : null,
  );

  useEffect(() => {
    setAddressDraft(url);
  }, [url]);

  useEffect(() => {
    if (initialUrl && initialUrl.trim()) {
      setUrl(initialUrl.trim());
    }
  }, [initialUrl]);

  useEffect(() => {
    if (typeof initialWindowTitle === "string" && initialWindowTitle.trim()) {
      setWindowTitleExtra(initialWindowTitle.trim());
    }
  }, [initialWindowTitle]);

  const collectData = useCallback(
    (): Record<string, unknown> => ({
      url,
      windowTitle: windowTitleExtra,
    }),
    [url, windowTitleExtra],
  );

  const title = windowTitleExtra || `Site — ${shortUrlLabel(url)}`;

  const go = useCallback(() => {
    const next = normalizeUserUrl(addressDraft);
    if (!next) {
      toast.error("Enter a valid URL");
      return;
    }
    setUrl(next);
  }, [addressDraft]);

  return (
    <WindowPanel
      title={title}
      id="browser-frame-window"
      minWidth={420}
      minHeight={320}
      width={720}
      height={560}
      position="center"
      onClose={onClose}
      overlayId="browserFrameWindow"
      onCollectData={collectData}
      footer={
        <div className="flex w-full min-w-0 items-center gap-2 px-2 py-1.5">
          <Input
            value={addressDraft}
            onChange={(e) => setAddressDraft(e.target.value)}
            className="h-8 min-w-0 flex-1 font-mono text-xs"
            style={{ fontSize: "16px" }}
            placeholder="https://…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                go();
              }
            }}
            aria-label="Page URL"
          />
          <Button type="button" size="sm" className="h-8 shrink-0" onClick={go}>
            Go
          </Button>
        </div>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        <EmbedSiteFrame
          key={url}
          src={url}
          title={shortUrlLabel(url)}
          className="min-h-[200px]"
        />
      </div>
    </WindowPanel>
  );
}
