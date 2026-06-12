"use client";

import { useState, useEffect, useRef } from "react";
import MarkdownClassificationTester from "./MarkdownClassificationTester";
import { Button } from "@/components/ui/button";
import { Maximize2, X } from "lucide-react";

interface FullscreenMarkdownEditorProps {
  triggerClassName?: string;
  triggerLabel?: string;
  initialMarkdown?: string;
  showSampleSelector?: boolean;
  showConfigSelector?: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  isOpen?: boolean; // External control of open state
}

const FullscreenMarkdownEditor = ({ 
  triggerClassName,
  triggerLabel = "Markdown Editor",
  initialMarkdown,
  showSampleSelector = true,
  showConfigSelector = true,
  onOpen,
  onClose,
  isOpen: externalIsOpen,
}: FullscreenMarkdownEditorProps) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  
  // Use external isOpen state if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;

  const openEditor = () => {
    if (externalIsOpen === undefined) {
      setInternalIsOpen(true);
    }
    onOpen?.();
  };
  
  const closeEditor = (e?: React.MouseEvent | MouseEvent) => {
    // If event exists, check if it was a click on the backdrop
    if (e && overlayRef.current && contentRef.current) {
      // If the click was inside the content, don't close
      if (contentRef.current.contains(e.target as Node)) {
        return;
      }
      // Only close if click was directly on the overlay backdrop
      if (e.target !== overlayRef.current) {
        return;
      }
    }
    
    if (externalIsOpen === undefined) {
      setInternalIsOpen(false);
    }
    onClose?.();
  };

  useEffect(() => {
    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeEditor();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen]);

  // Prevent events from select elements causing overlay to close
  const handleContentClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // If we're only being used as a controlled component without a trigger button
  if (externalIsOpen !== undefined && !triggerLabel) {
    return isOpen ? (
      <div 
        ref={overlayRef}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
        onClick={(e) => closeEditor(e)}
      >
        <div 
          ref={contentRef}
          className="w-[95vw] h-[90dvh] bg-textured rounded-lg shadow-xl flex flex-col overflow-hidden"
          onClick={handleContentClick}
        >
          <div className="flex items-center justify-between p-2 border-b border-border">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Creator Content Admin View</h2>
            <Button
              variant="ghost" 
              size="sm" 
              onClick={() => closeEditor()}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden">
            <MarkdownClassificationTester 
              initialMarkdown={initialMarkdown}
              showSelectors={showSampleSelector && showConfigSelector}
            />
          </div>
        </div>
      </div>
    ) : null;
  }

  return (
    <>
      {triggerLabel && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={openEditor} 
          className={triggerClassName}
          aria-label={`Open ${triggerLabel}`}
        >
          <Maximize2 className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      )}

      {isOpen && (
        <div 
          ref={overlayRef}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => closeEditor(e)}
        >
          <div 
            ref={contentRef}
            className="w-[95vw] h-[95dvh] bg-textured rounded-lg shadow-xl flex flex-col overflow-hidden"
            onClick={handleContentClick}
          >
            <div className="flex items-center justify-between p-2 border-b border-border">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{triggerLabel || "Content Processing & Classification"}</h2>
              <Button
                variant="ghost" 
                size="sm" 
                onClick={() => closeEditor()}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-hidden">
              <MarkdownClassificationTester 
                initialMarkdown={initialMarkdown}
                showSelectors={showSampleSelector && showConfigSelector}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FullscreenMarkdownEditor; 