import React, { useEffect, useState, useRef } from "react";
import { Copy, Check } from "lucide-react";
import { BsChevronBarContract, BsChevronBarExpand } from "react-icons/bs";
import { cn } from "@/styles/themes/utils";


interface StickyButtonsProps {
  linesCount: number;
  isCollapsed: boolean;
  isCopied: boolean;
  handleCopy: (e: React.MouseEvent) => void;
  toggleCollapse?: (e?: React.MouseEvent) => void;
  isMobile: boolean;
}

const StickyButtons: React.FC<StickyButtonsProps> = ({
  linesCount,
  isCollapsed,
  isCopied,
  handleCopy,
  toggleCollapse,
  isMobile,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [rightOffset, setRightOffset] = useState(0);
  const canCollapse = linesCount > 5;
  
  useEffect(() => {
    if (!containerRef.current) return undefined;
    
    const updatePosition = () => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        // Calculate the distance from the right edge of the container to the right edge of the viewport
        const rightDistance = window.innerWidth - containerRect.right;
        setRightOffset(rightDistance);
      }
    };
    
    updatePosition();
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('resize', updatePosition);
    };
  }, []);
  
  const buttonClass = cn(
    "py-2 px-3 rounded-lg bg-zinc-300 dark:bg-zinc-700",
    "text-neutral-700 dark:text-neutral-300",
    "hover:text-neutral-900 dark:hover:text-neutral-100",
    "hover:bg-zinc-200 dark:hover:bg-zinc-600",
    "transition-colors shadow-sm backdrop-blur-sm",
    "flex items-center gap-1 text-xs"
  );
  
  const buttonsStyle = {
    position: 'fixed',
    top: isMobile ? '50px' : '5px',
    right: `${rightOffset}px`,
    zIndex: 50,
  } as React.CSSProperties;
  
  return (
    <div ref={containerRef} className="relative">
      <div style={buttonsStyle} className="flex items-center space-x-2">
        {canCollapse && toggleCollapse && (
          <button 
            onClick={(e) => {
              e.stopPropagation();
              toggleCollapse(e);
            }} 
            className={buttonClass} 
            title={isCollapsed ? "Expand code" : "Collapse code"}
          >
            {isCollapsed ? <BsChevronBarExpand size={16} /> : <BsChevronBarContract size={16} />}
            <span>{isCollapsed ? "Expand" : "Collapse"}</span>
          </button>
        )}
        
        <button 
          onClick={(e) => {
            e.stopPropagation();
            handleCopy(e);
          }} 
          className={buttonClass} 
          title={isCopied ? "Copied!" : "Copy code"}
        >
          {isCopied ? <Check size={16} /> : <Copy size={16} />}
          <span>Copy</span>
        </button>
      </div>
    </div>
  );
};

export default StickyButtons;