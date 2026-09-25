"use client";

/**
 * AdminPageCapture — the one-line registration for a page (often a server
 * component) that has no live state of its own: it registers the page's
 * capture and renders its Alchemy menu. Descendants with state add sections
 * through `usePageCaptureContribution` (lane ALCHEMY-BUTTON).
 */

import type { PageCaptureSection, PageCaptureValue } from "./pageCapture";
import { adminPageCapture } from "./pageCapture";
import { usePageCapture } from "./usePageCapture";
import { PageCaptureButton } from "./PageCaptureButton";

export function AdminPageCapture({
  title,
  route,
  identity,
  sections = [],
  showButton = true,
  className,
}: {
  title: string;
  route?: string;
  identity?: Record<string, PageCaptureValue>;
  sections?: PageCaptureSection[];
  showButton?: boolean;
  className?: string;
}) {
  usePageCapture(() => ({
    ...adminPageCapture({ title, route: route ?? "", identity, sections }),
    route,
  }));
  return showButton ? <PageCaptureButton className={className} /> : null;
}
