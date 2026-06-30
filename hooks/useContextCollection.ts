// hooks/useContextCollection.ts
'use client';

// https://claude.ai/chat/327028d1-1df2-4272-816d-83c3e06f72a2

import { useState } from 'react';
import { useScreenshot } from './useScreenshot';
import { compressImage, generateThumbnail } from '@/utils/image/imageCompression';
import type {
  AIHelpContext,
  PageElementContext,
  UserInteractionContext,
  PageContext,
} from '@/types/contextCollection';
import { useInteractionTracking } from './useInteractionTracking';

export const useContextCollection = (helpDocs?: Record<string, string>) => {
  const { captureScreen, isCapturing } = useScreenshot();
  const { lastClicked, lastHovered } = useInteractionTracking();
  const [isCollecting, setIsCollecting] = useState(false);
  const [lastContext, setLastContext] = useState<AIHelpContext | null>(null);

  const getBreadcrumbs = (): string[] => {
    const breadcrumbs = document.querySelectorAll('[aria-label="breadcrumb"] li');
    return Array.from(breadcrumbs).map(b => b.textContent || '').filter(Boolean);
  };

  const getActiveModalsAndDrawers = () => {
    const modals = Array.from(document.querySelectorAll('[role="dialog"]'))
      .filter(el => el.getAttribute('aria-hidden') !== 'true')
      .map(el => el.getAttribute('aria-label') || 'Unknown Modal');

    const drawers = Array.from(document.querySelectorAll('[role="complementary"]'))
      .filter(el => el.getAttribute('aria-hidden') !== 'true')
      .map(el => el.getAttribute('aria-label') || 'Unknown Drawer');

    return { modals, drawers };
  };

  const getCurrentSection = (): string | undefined => {
    const activeNav = document.querySelector('nav [aria-current="page"]');
    if (activeNav) return activeNav.textContent || undefined;

    const mainHeader = document.querySelector('main h1');
    if (mainHeader) return mainHeader.textContent || undefined;

    return undefined;
  };

  const getRelevantElements = (): PageElementContext[] => {
    const selectors = [
      'button',
      'input',
      'select',
      'a',
      '[role="button"]',
      '[role="tab"]',
      '[role="menuitem"]',
      '.form-field',
      '.error-message',
      '.notification',
    ];

    return selectors.flatMap(selector =>
      Array.from(document.querySelectorAll(selector))
        .map(el => {
          const rect = el.getBoundingClientRect();
          return {
            selector: selector,
            text: el.textContent || undefined,
            role: el.getAttribute('role') ?? undefined,
            ariaLabel: el.getAttribute('aria-label') ?? undefined,
            isVisible: rect.width > 0 && rect.height > 0,
            boundingBox: {
              top: rect.top,
              left: rect.left,
              width: rect.width,
              height: rect.height,
            },
          };
        })
        .filter(elem => elem.isVisible)
    );
  };

  const getUserInteraction = () => ({
    lastClicked,
    lastHovered,
    currentFocus: document.activeElement?.tagName.toLowerCase(),
    scrollPosition: {
      x: window.scrollX,
      y: window.scrollY,
      maxScroll: Math.max(
          document.body.scrollHeight,
          document.documentElement.scrollHeight
      ),
    },
  });

  const getPageContext = (): PageContext => {
    const { modals, drawers } = getActiveModalsAndDrawers();
    return {
      title: document.title,
      url: window.location.href,
      route: window.location.pathname,
      breadcrumbs: getBreadcrumbs(),
      activeModals: modals,
      activeDrawers: drawers,
      currentSection: getCurrentSection(),
    };
  };

  const collectContext = async (): Promise<AIHelpContext> => {
    try {
      setIsCollecting(true);

      const processedScreenshot = await captureScreen();

      const screenshot = {
        fullSize: processedScreenshot.fullSize,
        compressed: processedScreenshot.compressed,
        thumbnail: processedScreenshot.thumbnail,
        metadata: processedScreenshot.metadata,
        imageDataForAPI: processedScreenshot.imageDataForAPI,
      };

      const context: AIHelpContext = {
        screenshot,
        page: getPageContext(),
        userInteraction: getUserInteraction(),
        relevantElements: getRelevantElements(),
        helpDocuments: helpDocs,
        timestamp: new Date().toISOString(),
      };

      setLastContext(context);
      return context;
    } catch (error) {
      console.error('Error collecting context:', error);
      throw error;
    } finally {
      setIsCollecting(false);
    }
  };

  return {
    collectContext,
    isCollecting: isCollecting || isCapturing,
    lastContext,
  };
};
