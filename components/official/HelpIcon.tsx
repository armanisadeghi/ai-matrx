import React, { useState, useEffect, useRef } from 'react';
import { InfoIcon, HelpCircleIcon, CopyIcon, CheckIcon, CircleDot } from 'lucide-react';
import { createPortal } from 'react-dom';

interface HelpIconProps {
  text?: string;
  content?: React.ReactNode;
  className?: string;
  title?: string;
  required?: boolean;
  onAiAssistance?: () => void;
}

const HelpIcon: React.FC<HelpIconProps> = ({ 
  text, 
  content, 
  className = "", 
  title = "", 
  required = false,
  onAiAssistance
}) => {
  
  const [copied, setCopied] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const iconRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const showTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (text) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleAiClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onAiAssistance) {
      onAiAssistance();
    }
  };
  
  const updatePosition = () => {
    if (iconRef.current && tooltipRef.current) {
      const rect = iconRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
      let top = rect.top - tooltipRect.height - 8;
      
      // Adjust if tooltip would go off-screen
      if (left < 10) left = 10;
      if (left + tooltipRect.width > viewportWidth - 10) {
        left = viewportWidth - tooltipRect.width - 10;
      }
      
      // If tooltip would go above viewport, position below icon
      if (top < 10) {
        top = rect.bottom + 8;
      }
      
      setPosition({ top, left });
    }
  };
  
  const showTooltip = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    
    if (!isVisible && !showTimeoutRef.current) {
      showTimeoutRef.current = setTimeout(() => {
        setIsVisible(true);
        showTimeoutRef.current = null;
      }, 200);
    }
  };
  
  const hideTooltip = () => {
    if (showTimeoutRef.current) {
      clearTimeout(showTimeoutRef.current);
      showTimeoutRef.current = null;
    }
    
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, 150);
  };
  
  const cancelHideTooltip = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };
  
  useEffect(() => {
    if (isVisible) {
      updatePosition();
      window.addEventListener('scroll', updatePosition);
      window.addEventListener('resize', updatePosition);
    }
    
    return () => {
      window.removeEventListener('scroll', updatePosition);
      window.removeEventListener('resize', updatePosition);
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
      if (showTimeoutRef.current) {
        clearTimeout(showTimeoutRef.current);
      }
    };
  }, [isVisible]);
  
  // Format text to handle both literal newlines and \n escape sequences
  const formatTextWithLineBreaks = (text: string) => {
    const processedText = text.replace(/\\n/g, '\n');
    return processedText.split('\n').map((line, index) => (
      <React.Fragment key={index}>
        {index > 0 && <br />}
        {line}
      </React.Fragment>
    ));
  };
  
  // The nothing-to-show guard sits BELOW every hook. Above them it made all 8
  // hook calls conditional (react-hooks/rules-of-hooks) — a HelpIcon whose
  // `text` arrives asynchronously would crash with "rendered more hooks than
  // during the previous render".
  if (!text && !content) return null;

  return (
    <div 
      className={`inline-block relative cursor-help ${className}`}
      ref={iconRef}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <InfoIcon className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors duration-200" />
      
      {isVisible && typeof document !== 'undefined' && createPortal(
        <div 
          ref={tooltipRef}
          className="fixed max-w-sm bg-textured border-border rounded-lg shadow-xl z-[9999] animate-in fade-in-0 zoom-in-95 duration-100"
          style={{ 
            top: `${position.top}px`, 
            left: `${position.left}px`,
            pointerEvents: 'auto' 
          }}
          onMouseEnter={cancelHideTooltip}
          onMouseLeave={hideTooltip}
        >
          <div className="p-3">
            {/* Header row with icon and title */}
            <div className="flex items-center gap-2 mb-2">
              <HelpCircleIcon className="h-4 w-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />
              {title && (
                <h3 className="font-medium text-gray-900 dark:text-gray-100 text-sm">
                  {title}
                </h3>
              )}
              {text && (
                <button 
                  onClick={handleCopy} 
                  className="ml-auto p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors duration-200"
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <CopyIcon className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300" />
                  )}
                </button>
              )}
            </div>
            
            {/* Content */}
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              {content ? content : (text && formatTextWithLineBreaks(text))}
            </div>
            
            {/* Required field pill */}
            {required && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-400 text-xs font-medium rounded-full">
                <div className="w-1.5 h-1.5 bg-amber-600 dark:bg-amber-500 rounded-full"></div>
                Required Field
              </div>
            )}
            
            {/* AI Assistance button */}
            {onAiAssistance && (
              <button
                onClick={handleAiClick}
                className="mt-3 w-full flex items-center justify-center gap-2 px-3 py-2 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white text-sm font-medium rounded-md transition-all duration-200 shadow-sm hover:shadow-md"
              >
                <CircleDot className="h-4 w-4" />
                Get Help From Matrx AI
              </button>
            )}
          </div>
          
          {/* Tooltip arrow */}
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-textured border-r border-b border-border rotate-45"></div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default HelpIcon;