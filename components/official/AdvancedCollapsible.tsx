"use client";
import React, { useState, ReactNode, useRef } from "react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Save, RefreshCw, Maximize, Minimize, CheckCircle2 } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import FullScreenOverlay, { TabDefinition } from "@/components/official/FullScreenOverlay";
import { cn } from "@/lib/utils";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import ActionFeedbackButton from "@/components/official/ActionFeedbackButton";

interface AdvancedCollapsibleProps {
  icon: ReactNode;
  title: ReactNode;
  initialOpen?: boolean;
  onStateChange?: (state: boolean) => void;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  
  // Action handlers
  onSave?: () => void;
  onReset?: () => void;
  onCopy?: () => void;
  
  // Optional customization
  saveTooltip?: string;
  resetTooltip?: string;
  copyTooltip?: string;
  fullscreenTooltip?: string;
  fullscreenExitTooltip?: string;
  
  // Full screen options
  fullScreenTitle?: string;
  fullScreenDescription?: string;
}

const AdvancedCollapsible: React.FC<AdvancedCollapsibleProps> = ({
  icon,
  title,
  initialOpen = true,
  onStateChange,
  children,
  className = "",
  contentClassName = "",
  
  // Action handlers
  onSave,
  onReset,
  onCopy,
  
  // Custom tooltips
  saveTooltip = "Save",
  resetTooltip = "Reset",
  copyTooltip = "Copy to clipboard",
  fullscreenTooltip = "Expand to full screen",
  fullscreenExitTooltip = "Exit full screen",
  
  // Full screen options
  fullScreenTitle,
  fullScreenDescription,
}) => {
  const [isOpen, setIsOpen] = useState(initialOpen);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Visual feedback states
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (onStateChange) {
      onStateChange(open);
    }
  };

  const handleCopy = () => {
    if (onCopy) {
      onCopy();
    }
  };

  const handleSave = () => {
    if (onSave) {
      onSave();
      // Show success animation
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }
  };

  const handleReset = () => {
    if (onReset) {
      onReset();
      // Show success animation
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2000);
    }
  };

  const toggleFullScreen = () => {
    setIsFullScreen(!isFullScreen);
  };

  // Define tabs for the full screen overlay
  const tabs: TabDefinition[] = [
    {
      id: "content",
      label: typeof title === 'string' ? title : "Content",
      content: (
        <div className={`p-4 w-full h-full ${contentClassName}`}>
          {children}
        </div>
      )
    }
  ];

  // Get content for copying
  const getContentForCopy = () => {
    if (contentRef.current) {
      return contentRef.current.innerText;
    }
    return "";
  };

  // Build action buttons
  const actionButtons = (
    <div className="flex space-x-2 justify-end mt-2 mb-1 mr-1">
      {onSave && (
        <ActionFeedbackButton
          icon={<Save className="h-4 w-4 text-blue-500 dark:text-blue-400" />}
          tooltip={saveTooltip}
          successTooltip="Saved!"
          onClick={handleSave}
          variant="ghost"
          size="sm"
        />
      )}
      
      {onReset && (
        <ActionFeedbackButton
          icon={<RefreshCw className="h-4 w-4 text-amber-500 dark:text-amber-400" />}
          tooltip={resetTooltip}
          successTooltip="Reset!"
          onClick={handleReset}
          variant="ghost"
          size="sm"
        />
      )}
      
      <CopyButton
        content={getContentForCopy()}
        className="text-gray-500 dark:text-gray-400"
        label=""
        size="sm"
      />
      
      <IconButton
        icon={<Maximize className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />}
        tooltip={fullscreenTooltip}
        onClick={toggleFullScreen}
        variant="ghost"
        size="sm"
      />
    </div>
  );

  // Full screen action buttons
  const fullScreenActionButtons = (
    <div className="flex space-x-2">
      {onSave && (
        <ActionFeedbackButton
          icon={<Save className="h-4 w-4 text-blue-500 dark:text-blue-400" />}
          tooltip={saveTooltip}
          successTooltip="Saved!"
          onClick={handleSave}
          variant="ghost"
          size="sm"
        />
      )}
      
      {onReset && (
        <ActionFeedbackButton
          icon={<RefreshCw className="h-4 w-4 text-amber-500 dark:text-amber-400" />}
          tooltip={resetTooltip}
          successTooltip="Reset!"
          onClick={handleReset}
          variant="ghost"
          size="sm"
        />
      )}
      
      <CopyButton
        content={getContentForCopy()}
        className="text-gray-500 dark:text-gray-400"
        label=""
        size="sm"
      />
      
      <IconButton
        icon={<Minimize className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />}
        tooltip={fullscreenExitTooltip}
        onClick={toggleFullScreen}
        variant="ghost"
        size="sm"
      />
    </div>
  );

  return (
    <>
      <Collapsible
        open={isOpen}
        onOpenChange={handleOpenChange}
        className={cn(
          "border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-sm w-full",
          className
        )}
      >
        <CollapsibleTrigger className="relative flex w-full items-center justify-between rounded-t-xl py-3 px-4 font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <div className="flex items-center gap-2">
            {icon}
            {typeof title === 'string' ? <span>{title}</span> : title}
          </div>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-zinc-500 dark:text-zinc-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=open]:animate-slide-down data-[state=closed]:animate-slide-up">
          <div className="relative">
            <div className="absolute top-0 left-8 right-8 h-px bg-zinc-200 dark:bg-zinc-700"></div>
            <div ref={contentRef} className={`p-4 ${contentClassName}`}>
              {children}
            </div>
            {actionButtons}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Full Screen Mode */}
      <FullScreenOverlay
        isOpen={isFullScreen}
        onClose={() => setIsFullScreen(false)}
        title={fullScreenTitle || (typeof title === 'string' ? title : "Content")}
        description={fullScreenDescription}
        tabs={tabs}
        additionalButtons={fullScreenActionButtons}
      />
    </>
  );
};

export default AdvancedCollapsible; 