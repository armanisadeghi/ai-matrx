"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Maximize2, X } from "lucide-react";
import SocketAccordionResponse from "./SocketAccordionResponse";

interface FullscreenSocketAccordionProps {
  triggerClassName?: string;
  triggerLabel?: string;
  taskId?: string;
  onOpen?: () => void;
  onClose?: () => void;
  isOpen?: boolean; // External control of open state
  showTrigger?: boolean; // Explicit control over trigger button visibility
}

const FullscreenSocketAccordion = ({ 
  triggerClassName,
  triggerLabel = "Socket Admin",
  taskId,
  onOpen,
  onClose,
  isOpen: externalIsOpen,
  showTrigger,
}: FullscreenSocketAccordionProps) => {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Use external isOpen state if provided, otherwise use internal state
  const isOpen = externalIsOpen !== undefined ? externalIsOpen : internalIsOpen;

  const openDialog = () => {
    if (externalIsOpen === undefined) {
      setInternalIsOpen(true);
    }
    onOpen?.();
  };
  
  const closeDialog = () => {
    if (externalIsOpen === undefined) {
      setInternalIsOpen(false);
    }
    onClose?.();
  };

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(event.target as Node)) {
        closeDialog();
      }
    };

    const handleEscKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeDialog();
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
      document.addEventListener('keydown', handleEscKey);
    }

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscKey);
    };
  }, [isOpen]);

  // Determine if we should show the trigger button
  const shouldShowTrigger = showTrigger !== undefined ? showTrigger : !!triggerLabel;
  
  // If we're only being used as a controlled component without a trigger button
  if (externalIsOpen !== undefined && !shouldShowTrigger) {
    return isOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div 
          ref={contentRef}
          className="w-[95vw] h-[90dvh] bg-textured rounded-lg shadow-xl flex flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between p-2 border-b border-border">
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">Socket Admin</h2>
            <Button
              variant="ghost" 
              size="sm" 
              onClick={closeDialog}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            {taskId && <SocketAccordionResponse taskId={taskId} />}
          </div>
        </div>
      </div>
    ) : null;
  }

  return (
    <>
      {shouldShowTrigger && (
        <Button 
          variant="outline" 
          size="sm" 
          onClick={openDialog} 
          className={triggerClassName}
          aria-label={`Open ${triggerLabel}`}
        >
          <Maximize2 className="h-4 w-4 mr-2" />
          {triggerLabel}
        </Button>
      )}

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div 
            ref={contentRef}
            className="w-[95vw] h-[90dvh] bg-textured rounded-lg shadow-xl flex flex-col overflow-hidden"
          >
            <div className="flex items-center justify-between p-2 border-b border-border">
              <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-200">{triggerLabel || "Socket Admin"}</h2>
              <Button
                variant="ghost" 
                size="sm" 
                onClick={closeDialog}
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {taskId && <SocketAccordionResponse taskId={taskId} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default FullscreenSocketAccordion; 