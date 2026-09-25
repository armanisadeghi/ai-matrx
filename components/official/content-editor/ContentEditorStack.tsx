// components/content-editor/ContentEditorStack.tsx
"use client";

import React from 'react';
import { ContentEditor } from './ContentEditor';
import type { EditorMode, HeaderAction } from './types';
import { cn } from '@/lib/utils';
import type { ImagePolicyDeclaration } from "@/components/rich-content/prose/remote-image-policy";

export interface ContentEditorStackProps {
  // Content array
  contents: string[];
  onContentsChange: (contents: string[]) => void;
  
  // Common settings for all editors
  availableModes?: EditorMode[];
  initialMode?: EditorMode;
  autoSave?: boolean;
  autoSaveDelay?: number;
  onSave?: (content: string, index: number) => Promise<void> | void;
  
  // Collapsible settings
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  generateTitle?: (index: number) => string;
  
  // Header actions (same for all)
  headerActions?: HeaderAction[];
  
  // Built-in features
  showCopyButton?: boolean;
  showContentManager?: boolean;
  onShowHtmlPreview?: (html: string, title?: string) => void;
  
  // UI
  placeholder?: string;
  showModeSelector?: boolean;
  spacing?: 'sm' | 'md' | 'lg';
  className?: string;
  /**
   * WHO WROTE the content shown — "self" | "other" | "ai" (or "inherit").
   * Decides whether remote images load by themselves; forwarded to the
   * renderer (components/rich-content/prose/remote-image-policy.tsx).
   */
  imagePolicy?: ImagePolicyDeclaration;
}

const spacingClasses = {
  sm: 'space-y-2',
  md: 'space-y-4',
  lg: 'space-y-6'
};

export function ContentEditorStack({
  contents,
  onContentsChange,
  availableModes,
  initialMode,
  autoSave,
  autoSaveDelay,
  onSave,
  collapsible,
  defaultCollapsed,
  generateTitle,
  headerActions,
  showCopyButton,
  showContentManager,
  onShowHtmlPreview,
  placeholder,
  showModeSelector,
  spacing = 'md',
  className,
  imagePolicy,
}: ContentEditorStackProps) {
  
  // Handle individual content change
  const handleContentChange = (index: number) => (newContent: string) => {
    const newContents = [...contents];
    newContents[index] = newContent;
    onContentsChange(newContents);
  };
  
  // Handle individual save
  const handleSave = (index: number) => async (content: string) => {
    if (onSave) {
      await onSave(content, index);
    }
  };
  
  return (
    <div className={cn(spacingClasses[spacing], className)}>
      {contents.map((content, index) => (
        <ContentEditor imagePolicy={imagePolicy}
          key={index}
          value={content}
          onChange={handleContentChange(index)}
          availableModes={availableModes}
          initialMode={initialMode}
          autoSave={autoSave}
          autoSaveDelay={autoSaveDelay}
          onSave={autoSave && onSave ? handleSave(index) : undefined}
          collapsible={collapsible}
          defaultCollapsed={index > 0 ? defaultCollapsed : false} // First one open by default
          title={generateTitle ? generateTitle(index) : undefined}
          headerActions={headerActions}
          showCopyButton={showCopyButton}
          showContentManager={showContentManager}
          onShowHtmlPreview={onShowHtmlPreview}
          placeholder={placeholder}
          showModeSelector={showModeSelector}
        />
      ))}
    </div>
  );
}

