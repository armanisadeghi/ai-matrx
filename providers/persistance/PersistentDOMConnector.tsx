"use client";
import React, { useEffect, useRef } from "react";

/**
 * Component that connects persistent components to their placeholders in the DOM
 * This ensures that components are rendered at their correct locations when visible
 */
export const PersistentDOMConnector: React.FC = () => {
  const observerRef = useRef<MutationObserver | null>(null);
  
  // Function to move persistent components to their placeholders
  const positionComponents = () => {
    // Find all component containers
    const containers = document.querySelectorAll('[data-component-id]');
    
    containers.forEach(container => {
      const id = container.getAttribute('data-component-id');
      if (!id) return;
      
      // Find placeholder for this component
      const placeholder = document.querySelector(`[data-placeholder-for="${id}"]`);
      if (!placeholder) return;
      
      // Check if component is visible
      const isVisible = (container as HTMLElement).style.display !== 'none';
      
      // Only move if visible and not already in the correct place
      if (isVisible && !placeholder.contains(container)) {
        // Clone any existing content to prevent loss
        const existingContent = Array.from(placeholder.childNodes);
        
        // Clear placeholder and append the component
        placeholder.innerHTML = '';
        placeholder.appendChild(container);
        
      }
    });
  };
  
  useEffect(() => {
    // Run initial positioning
    setTimeout(() => {
      positionComponents();
      // console.log("Initial positioning complete");
    }, 100);
    
    // Watch for DOM changes — but only react to the ones that involve a
    // persistent component or its placeholder, once per frame. Scanning the
    // whole document on EVERY mutation made each DOM insertion anywhere cost a
    // full-document querySelectorAll (587 ms over 15 s of mermaid drawing on a
    // 1 MB document, 2026-09-26).
    const RELEVANT = "[data-component-id],[data-placeholder-for]";
    let scheduled = 0;
    const relevant = (records: MutationRecord[]) =>
      records.some((r) => {
        if (r.type === "attributes") {
          const el = r.target as Element;
          return el.hasAttribute?.("data-component-id") || el.hasAttribute?.("data-placeholder-for");
        }
        for (const node of r.addedNodes) {
          if (node.nodeType !== 1) continue;
          const el = node as Element;
          if (el.matches(RELEVANT) || el.querySelector(RELEVANT)) return true;
        }
        return false;
      });
    observerRef.current = new MutationObserver((records) => {
      if (scheduled || !relevant(records)) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        positionComponents();
      });
    });
    
    // Observe the entire document body for changes
    observerRef.current.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'data-placeholder-for', 'data-component-id', 'class']
    });
    
    // Also position on visibility changes and DOM content loaded
    window.addEventListener('visibilitychange', positionComponents);
    document.addEventListener('DOMContentLoaded', positionComponents);
    
    // Position components after tab switches
    const handleTabChange = () => {
      setTimeout(positionComponents, 50);
    };
    
    // Look for tab triggers and add click handlers
    const tabTriggers = document.querySelectorAll('[role="tab"]');
    tabTriggers.forEach(trigger => {
      trigger.addEventListener('click', handleTabChange);
    });
    
    // Cleanup on unmount
    return () => {
      if (scheduled) cancelAnimationFrame(scheduled);
      observerRef.current?.disconnect();
      window.removeEventListener('visibilitychange', positionComponents);
      document.removeEventListener('DOMContentLoaded', positionComponents);
      
      tabTriggers.forEach(trigger => {
        trigger.removeEventListener('click', handleTabChange);
      });
    };
  }, []);
  
  return null;
};