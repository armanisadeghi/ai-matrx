"use client";
import { cn } from "@/lib/utils";
import React, { useRef, useState, useEffect, useCallback, useId } from "react";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  animate,
  useAnimationControls,
  PanInfo,
} from "motion/react";
import { useDraggableCard } from "./draggable-card-context";

interface EnhancedDraggableCardBodyProps {
  className?: string;
  children?: React.ReactNode;
  id?: string;
  initialPosition?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  snapPoints?: { x: number; y: number }[];
  group?: string;
  containerId?: string | null;
}

export const EnhancedDraggableCardBody = ({
  className,
  children,
  id: providedId,
  initialPosition,
  onPositionChange,
  snapPoints,
  group,
  containerId: initialContainerId,
}: EnhancedDraggableCardBodyProps) => {
  const generatedId = useId();
  const id = providedId || generatedId;
  const { 
    registerCard, 
    unregisterCard, 
    updatePosition, 
    assignToContainer,
    checkContainerIntersection
  } = useDraggableCard();
  
  // Track the draggable area container
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Motion values for interactive effects
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Position motion values
  const x = useMotionValue(initialPosition?.x || 0);
  const y = useMotionValue(initialPosition?.y || 0);
  
  const controls = useAnimationControls();
  const [lastValidPos, setLastValidPos] = useState({ x: initialPosition?.x || 0, y: initialPosition?.y || 0 });
  const [currentContainerId, setCurrentContainerId] = useState<string | null>(initialContainerId || null);

  // Register this card with the context
  useEffect(() => {
    registerCard(id, { 
      x: initialPosition?.x || 0, 
      y: initialPosition?.y || 0,
      group,
      containerId: initialContainerId
    });
    
    // Initialize the position motion values
    x.set(initialPosition?.x || 0);
    y.set(initialPosition?.y || 0);
    setLastValidPos({ x: initialPosition?.x || 0, y: initialPosition?.y || 0 });
    
    return () => {
      unregisterCard(id);
    };
  }, [id, registerCard, unregisterCard, initialPosition?.x, initialPosition?.y, group, initialContainerId, x, y]);

  // Update container assignment when currentContainerId changes
  useEffect(() => {
    assignToContainer(id, currentContainerId);
  }, [id, assignToContainer, currentContainerId]);

  // Spring config for animations
  const springConfig = {
    stiffness: 100,
    damping: 20,
    mass: 0.5,
  };

  // Visual effects based on mouse position
  const rotateX = useSpring(
    useTransform(mouseY, [-300, 300], [10, -10]), // Reduced rotation angle for stability
    springConfig,
  );
  
  const rotateY = useSpring(
    useTransform(mouseX, [-300, 300], [-10, 10]), // Reduced rotation angle for stability
    springConfig,
  );

  const opacity = useSpring(
    useTransform(mouseX, [-300, 0, 300], [0.9, 1, 0.9]), // Reduced opacity change for stability
    springConfig,
  );

  const glareOpacity = useSpring(
    useTransform(mouseX, [-300, 0, 300], [0.1, 0, 0.1]), // Reduced glare effect for stability
    springConfig,
  );

  // Handle mouse movement over the card for visual effects
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    
    const { clientX, clientY } = e;
    const { width, height, left, top } = cardRef.current.getBoundingClientRect();
    
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    
    // Calculate delta from center of card
    const deltaX = clientX - centerX;
    const deltaY = clientY - centerY;
    
    // Set mouse position values (used for effects, not positioning)
    mouseX.set(deltaX);
    mouseY.set(deltaY);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  // Handle drag start
  const handleDragStart = useCallback(() => {
    document.body.style.cursor = "grabbing";
    
    // Store the current position as the last valid position
    setLastValidPos({
      x: x.get(),
      y: y.get()
    });
  }, [x, y]);

  // Handle drag motion
  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    // Let Framer Motion handle the drag positioning naturally
    
    // Get current position from motion values
    const newX = x.get();
    const newY = y.get();
    
    // Update context and callback
    updatePosition(id, { x: newX, y: newY });
    
    if (onPositionChange) {
      onPositionChange({ x: newX, y: newY });
    }
    
    // Update the last valid position
    setLastValidPos({ x: newX, y: newY });
  }, [id, onPositionChange, updatePosition, x, y]);

  // Handle drag end
  const handleDragEnd = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    document.body.style.cursor = "default";
    
    // Reset rotation
    controls.start({
      rotateX: 0,
      rotateY: 0,
      transition: {
        type: "spring",
        ...springConfig,
      },
    });
    
    // Only check container intersection if we have a card ref
    if (!cardRef.current) return;
    
    // Get actual card dimensions
    const cardRect = cardRef.current.getBoundingClientRect();
    const cardWidth = cardRect.width;
    const cardHeight = cardRect.height;
    
    // Check if the card is inside any container using DOM positions
    const intersectingContainerId = checkContainerIntersection(
      id, 
      { 
        x: x.get(), 
        y: y.get(), 
        width: cardWidth, 
        height: cardHeight 
      },
      cardRef
    );
    
    // Log for debugging
    console.log('Card position:', { 
      cardRect,
      cssPosition: { x: x.get(), y: y.get() } 
    });
    
    // Update the container assignment
    setCurrentContainerId(intersectingContainerId);
    
    // If inside a container, let the page handle any container-specific snap behavior
    if (intersectingContainerId) {
      return;
    }
    
    // Otherwise, use regular snap points if enabled
    if (snapPoints && snapPoints.length > 0) {
      // Find the closest snap point
      let closestPoint = { x: x.get(), y: y.get() };
      let minDistance = Number.MAX_VALUE;
      
      snapPoints.forEach(point => {
        const distance = Math.sqrt(
          Math.pow(x.get() - point.x, 2) + 
          Math.pow(y.get() - point.y, 2)
        );
        
        if (distance < minDistance) {
          minDistance = distance;
          closestPoint = point;
        }
      });
      
      // Snap to closest point if within threshold (50px)
      if (minDistance <= 50) {
        animate(x, closestPoint.x, {
          type: "spring",
          stiffness: 300,
          damping: 25,
          onUpdate: (latest) => {
            updatePosition(id, { x: latest, y: y.get() });
            if (onPositionChange) {
              onPositionChange({ x: latest, y: y.get() });
            }
          },
        });
        
        animate(y, closestPoint.y, {
          type: "spring",
          stiffness: 300,
          damping: 25,
          onUpdate: (latest) => {
            updatePosition(id, { x: x.get(), y: latest });
            if (onPositionChange) {
              onPositionChange({ x: x.get(), y: latest });
            }
          },
        });
        
        return;
      }
    }
    
    // Use very small velocity values for gentle movement after drag
    const dragVelocityX = info.velocity.x * 0.05;
    const dragVelocityY = info.velocity.y * 0.05;
    
    // Apply gentle physics deceleration
    animate(x, x.get() + dragVelocityX, {
      type: "spring",
      stiffness: 300,
      damping: 25,
      onUpdate: (latest) => {
        if (isNaN(latest) || !isFinite(latest)) {
          // Fallback to last valid position if calculation went wrong
          x.set(lastValidPos.x);
          updatePosition(id, { x: lastValidPos.x });
          if (onPositionChange) {
            onPositionChange({ x: lastValidPos.x, y: y.get() });
          }
          return;
        }
        
        updatePosition(id, { x: latest });
        if (onPositionChange) {
          onPositionChange({ x: latest, y: y.get() });
        }
      },
    });
    
    animate(y, y.get() + dragVelocityY, {
      type: "spring",
      stiffness: 300,
      damping: 25,
      onUpdate: (latest) => {
        if (isNaN(latest) || !isFinite(latest)) {
          // Fallback to last valid position if calculation went wrong
          y.set(lastValidPos.y);
          updatePosition(id, { y: lastValidPos.y });
          if (onPositionChange) {
            onPositionChange({ x: x.get(), y: lastValidPos.y });
          }
          return;
        }
        
        updatePosition(id, { y: latest });
        if (onPositionChange) {
          onPositionChange({ x: x.get(), y: latest });
        }
      },
    });
  }, [controls, id, lastValidPos.x, lastValidPos.y, onPositionChange, snapPoints, springConfig, updatePosition, x, y, checkContainerIntersection]);

  // Reset the velocity after a release
  const decelerate = useCallback(() => {
    mouseX.set(0);
    mouseY.set(0);
  }, [mouseX, mouseY]);

  return (
    <div ref={containerRef} className={cn("[perspective:3000px]", className)}>
      <motion.div
        ref={cardRef}
        drag
        dragPropagation={false}
        dragMomentum={false}
        dragElastic={0}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{
          x,
          y,
          rotateX,
          rotateY,
          opacity,
          willChange: "transform",
          position: "absolute",
          top: 0,
          left: 0,
        }}
        animate={controls}
        whileHover={{ scale: 1.02 }}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "relative min-h-96 w-80 overflow-hidden rounded-md bg-neutral-100 p-6 shadow-2xl transform-3d dark:bg-neutral-900",
          currentContainerId ? "ring-2 ring-blue-500" : "",
          className,
        )}
      >
        {children}
        <motion.div
          style={{
            opacity: glareOpacity,
          }}
          className="pointer-events-none absolute inset-0 bg-white select-none"
        />
      </motion.div>
    </div>
  );
};

export const EnhancedDraggableCardContainer = ({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) => {
  return (
    <div className={cn("relative", className)}>{children}</div>
  );
};

// Create a container that cards can be dropped into
export interface DropContainerProps {
  id: string;
  label: string;
  className?: string;
  children?: React.ReactNode;
  onCardAssigned?: (cardId: string) => void;
}

export const DropContainer: React.FC<DropContainerProps> = ({ 
  id, 
  label, 
  children,
  className
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { registerContainer, unregisterContainer, updateContainerBounds } = useDraggableCard();
  
  const updateBounds = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      
      // Ensure we're using viewport-relative coordinates for consistent positioning
      updateContainerBounds(id, {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom
      });
    }
  }, [id, updateContainerBounds]);
  
  // Register the container when mounted
  useEffect(() => {
    if (containerRef.current) {
      registerContainer(id, {
        bounds: {
          left: 0,
          top: 0,
          right: 0,
          bottom: 0
        },
        label: label || id
      });
      
      // Update bounds after registration
      updateBounds();
      
      // Clean up on unmount
      return () => unregisterContainer(id);
    }
    return undefined;
  }, [id, label, registerContainer, unregisterContainer, updateBounds]);
  
  // Update bounds more aggressively to ensure accurate positioning
  useEffect(() => {
    // Update bounds on all relevant events
    window.addEventListener('resize', updateBounds);
    document.addEventListener('scroll', updateBounds, true);
    
    // Create an intersection observer to detect when container becomes visible
    const observer = new IntersectionObserver(updateBounds, { threshold: 0.1 });
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }
    
    // Update bounds periodically to catch any layout changes
    const interval = setInterval(updateBounds, 500);
    
    // Initial updates at staggered intervals for various layout timings
    setTimeout(updateBounds, 0);
    setTimeout(updateBounds, 100);
    setTimeout(updateBounds, 500);
    
    return () => {
      window.removeEventListener('resize', updateBounds);
      document.removeEventListener('scroll', updateBounds, true);
      clearInterval(interval);
      observer.disconnect();
    };
  }, [updateBounds]);
  
  return (
    <div
      ref={containerRef}
      className={cn(
        "p-4 bg-textured rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-700 min-h-[250px] relative z-0 shadow-sm",
        className
      )}
    >
      <div className="font-medium text-lg mb-2 text-gray-800 dark:text-gray-200">{label || id}</div>
      {children}
    </div>
  );
}; 