import { useEffect, useState } from 'react';

/**
 * Hook to detect if the main app sidebar is collapsed or expanded
 * Watches the sidebar width to determine state
 */
export function useSidebarState() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const checkSidebarState = () => {
      const sidebar = document.querySelector('aside[class*="w-11"], aside[class*="w-48"]');
      if (sidebar) {
        const width = sidebar.getBoundingClientRect().width;
        // If width is less than 60px, it's collapsed
        setIsCollapsed(width < 60);
      }
    };

    // Initial check
    checkSidebarState();

    // Watch for changes using ResizeObserver
    const sidebar = document.querySelector('aside[class*="w-11"], aside[class*="w-48"]');
    if (sidebar) {
      const resizeObserver = new ResizeObserver(checkSidebarState);
      resizeObserver.observe(sidebar);
      
      return () => {
        resizeObserver.disconnect();
      };
    }
    return undefined;
  }, []);

  return { isCollapsed };
}

