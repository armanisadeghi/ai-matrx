"use client";

import { useCallback, useRef } from "react";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import {
  SocialCardAnalyzer,
  type SocialCardAnalyzerValues,
} from "@/features/seo/social/SocialCardAnalyzer";

/**
 * SocialCardWindow — the canonical Social Card Analyzer in a floating window.
 *
 * Open from anywhere with `useOpenSocialCardWindow({ url, title, description,
 * image, ... })` to push a page's Open Graph metadata into the full analyzer:
 * editable tags, deterministic checks, and platform-faithful X / Facebook /
 * LinkedIn previews.
 */
export interface SocialCardWindowProps {
  isOpen: boolean;
  onClose: () => void;
  initialUrl?: string;
  initialTitle?: string;
  initialDescription?: string;
  initialImage?: string;
  initialSiteName?: string;
  initialOgType?: string;
  initialCardType?: string;
}

export default function SocialCardWindow({
  isOpen,
  onClose,
  ...initial
}: SocialCardWindowProps) {
  if (!isOpen) return null;
  return <SocialCardWindowInner onClose={onClose} {...initial} />;
}

function SocialCardWindowInner({
  onClose,
  initialUrl,
  initialTitle,
  initialDescription,
  initialImage,
  initialSiteName,
  initialOgType,
  initialCardType,
}: Omit<SocialCardWindowProps, "isOpen">) {
  const valuesRef = useRef<SocialCardAnalyzerValues>({
    url: initialUrl ?? "",
    title: initialTitle ?? "",
    description: initialDescription ?? "",
    image: initialImage ?? "",
    siteName: initialSiteName ?? "",
    ogType: initialOgType ?? "",
    cardType: initialCardType ?? "",
  });

  const handleValuesChange = useCallback((values: SocialCardAnalyzerValues) => {
    valuesRef.current = values;
  }, []);

  const collectData = useCallback(
    (): Record<string, unknown> => ({ ...valuesRef.current }),
    [],
  );

  return (
    <WindowPanel
      id="social-card-window"
      overlayId="socialCardAnalyzerWindow"
      title="Social Cards"
      onClose={onClose}
      width={1360}
      height={880}
      minWidth={560}
      minHeight={480}
      position="center"
      urlSyncKey="social_cards"
      onCollectData={collectData}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-y-auto p-4"
    >
      <SocialCardAnalyzer
        initialUrl={initialUrl}
        initialTitle={initialTitle}
        initialDescription={initialDescription}
        initialImage={initialImage}
        initialSiteName={initialSiteName}
        initialOgType={initialOgType}
        initialCardType={initialCardType}
        onValuesChange={handleValuesChange}
      />
    </WindowPanel>
  );
}
