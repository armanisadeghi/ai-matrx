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
  useDragControls,
  PanInfo,
} from "motion/react";
import { useDraggableCard } from "./draggable-card-context";
import { X } from "lucide-react";

export interface TransformableCardProps {
  className?: string;
  children?: React.ReactNode;
  id?: string;
  initialPosition?: { x: number; y: number };
  onPositionChange?: (position: { x: number; y: number }) => void;
  pillView?: React.ReactNode;
  pillClassName?: string;
  group?: string;
  containerId?: string | null;
}

export const TransformableCard: React.FC<TransformableCardProps> = ({
  className,
  children,
  id: providedId,
  initialPosition,
  onPositionChange,
  pillView,
  pillClassName,
  group,
  containerId: initialContainerId,
}) => {
  const generatedId = useId();
  const id = providedId || generatedId;
  const { 
    registerCard, 
    unregisterCard, 
    updatePosition, 
    assignToContainer,
    checkContainerIntersection,
    getCardPosition
  } = useDraggableCard();
  
  // Track the draggable area container
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  
  // Controls for animations and dragging
  const controls = useAnimationControls();
  const dragControls = useDragControls();
  
  // Motion values for interactive effects
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  
  // Position motion values
  const x = useMotionValue(initialPosition?.x || 0);
  const y = useMotionValue(initialPosition?.y || 0);
  
  // Scale for transformation effect
  const scale = useMotionValue(1);
  
  const [lastValidPos, setLastValidPos] = useState({ x: initialPosition?.x || 0, y: initialPosition?.y || 0 });
  const [currentContainerId, setCurrentContainerId] = useState<string | null>(initialContainerId || null);
  const [isPill, setIsPill] = useState(!!initialContainerId);
  const [isDragging, setIsDragging] = useState(false);

  // State for returning to card from pill
  const [isReturningToCard, setIsReturningToCard] = useState(false);
  const [returnOrigin, setReturnOrigin] = useState<{ x: number, y: number } | null>(null);

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
    
    // Only update the appearance if the pill state needs to change
    if (!!currentContainerId !== isPill) {
      // Simply update the state without animation during initialization
      if (returnOrigin === null && !isReturningToCard) {
        setIsPill(!!currentContainerId);
        return;
      }
      
      // We're changing state, add a transition effect
      if (currentContainerId) {
        // Card to pill transformation - ensure it completes
        animate(scale, 0.6, {
          type: "spring",
          stiffness: 300,
          damping: 25,
          onComplete: () => {
            setIsPill(true);
            scale.set(1); // Reset scale for next animation
          }
        });
      } else {
        // Pill to card transformation - ensure it happens immediately
        setIsPill(false);
        scale.set(0.6);
        animate(scale, 1, {
          type: "spring",
          stiffness: 300,
          damping: 25
        });
      }
    }
  }, [id, assignToContainer, currentContainerId, isPill, scale, isReturningToCard, returnOrigin]);

  // Spring config for animations
  const springConfig = {
    stiffness: 100,
    damping: 20,
    mass: 0.5,
  };

  // Visual effects based on mouse position
  const rotateX = useSpring(
    useTransform(mouseY, [-300, 300], [5, -5]),
    springConfig,
  );
  
  const rotateY = useSpring(
    useTransform(mouseX, [-300, 300], [-5, 5]),
    springConfig,
  );

  // Handle mouse movement over the card for visual effects
  const handleMouseMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!cardRef.current || isPill || isDragging) return;

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

    // Start the drag manually when user holds the mouse button down (works better with dragControls)
    if (e.buttons === 1) {
      dragControls.start(e, { snapToCursor: false });
    }
  };

  const handleMouseLeave = () => {
    if (!isDragging) {
      mouseX.set(0);
      mouseY.set(0);
    }
  };

  // Handle drag start
  const handleDragStart = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    document.body.style.cursor = "grabbing";
    setIsDragging(true);
    
    // If this is a pill being dragged out, mark it for returning to card mode
    if (isPill && !isReturningToCard) {
      setIsReturningToCard(true);
      setReturnOrigin({ x: x.get(), y: y.get() });
    }
    
    // Store the current position as the last valid position
    setLastValidPos({
      x: x.get(),
      y: y.get()
    });
    
    // Apply a slight scale-up effect when dragging begins
    animate(scale, 1.05, {
      type: "spring",
      stiffness: 300,
      damping: 25
    });
  }, [isPill, isReturningToCard, x, y, scale]);

  // Handle drag motion
  const handleDrag = useCallback((_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
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
    
    // If we're returning to card mode from pill, complete the transition
    if (isReturningToCard && !isPill) {
      setIsReturningToCard(false);
      setReturnOrigin(null);
    }
  }, [id, isPill, isReturningToCard, onPositionChange, updatePosition, x, y]);

  // Handle drag end
  const handleDragEnd = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    document.body.style.cursor = "default";
    setIsDragging(false);
    
    // Return scale to normal
    animate(scale, 1, {
      type: "spring",
      stiffness: 300,
      damping: 25
    });
    
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
    
    // Update the container assignment
    setCurrentContainerId(intersectingContainerId);
    
    // If we were returning to card mode but got dropped in a container, cancel the return
    if (isReturningToCard && intersectingContainerId) {
      setIsReturningToCard(false);
      setReturnOrigin(null);
    }
    
    // Apply gentle physics deceleration if not in a container
    if (!intersectingContainerId) {
      animate(x, x.get() + info.velocity.x * 0.05, {
        type: "spring",
        stiffness: 300,
        damping: 25,
        onUpdate: (latest) => {
          if (isNaN(latest) || !isFinite(latest)) {
            x.set(lastValidPos.x);
            updatePosition(id, { x: lastValidPos.x });
            return;
          }
          
          updatePosition(id, { x: latest });
          if (onPositionChange) {
            onPositionChange({ x: latest, y: y.get() });
          }
        },
      });
      
      animate(y, y.get() + info.velocity.y * 0.05, {
        type: "spring",
        stiffness: 300,
        damping: 25,
        onUpdate: (latest) => {
          if (isNaN(latest) || !isFinite(latest)) {
            y.set(lastValidPos.y);
            updatePosition(id, { y: lastValidPos.y });
            return;
          }
          
          updatePosition(id, { y: latest });
          if (onPositionChange) {
            onPositionChange({ x: x.get(), y: latest });
          }
        },
      });
    }
  }, [controls, id, isReturningToCard, lastValidPos.x, lastValidPos.y, onPositionChange, springConfig, updatePosition, x, y, checkContainerIntersection, scale]);

  // Handle pill click to return to card
  const handlePillClick = () => {
    if (!isPill || isDragging) return;
    
    // Set returning state and store original position
    setIsReturningToCard(true);
    setReturnOrigin({ x: x.get(), y: y.get() });
    
    // Remove from container
    setCurrentContainerId(null);
    
    // Animate to a position outside the container
    // This would need to be calculated based on layout
    const newX = x.get() + 70; // Move slightly to the right
    const newY = y.get() - 120; // Move up
    
    animate(x, newX, {
      type: "spring",
      stiffness: 400,
      damping: 30,
      onUpdate: (latest) => {
        updatePosition(id, { x: latest });
      },
    });
    
    animate(y, newY, {
      type: "spring",
      stiffness: 400,
      damping: 30,
      onUpdate: (latest) => {
        updatePosition(id, { y: latest });
      },
    });
    
    // Animate scale to smoothly transition back to card
    animate(scale, 1, {
      type: "spring",
      stiffness: 400,
      damping: 30
    });
  };

  // Render the card in pill form if in a container
  if (isPill) {
    return (
      <div ref={containerRef} className="relative z-20">
        <motion.div
          ref={cardRef}
          drag={true}
          dragControls={dragControls}
          dragPropagation={false}
          dragMomentum={true}
          dragElastic={0.1}
          dragTransition={{ 
            power: 0.3,
            timeConstant: 200,
            modifyTarget: (target) => Math.round(target / 10) * 10
          }}
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          style={{
            x,
            y,
            scale,
            position: "absolute",
            top: 0,
            left: 0,
            zIndex: isDragging ? 50 : 20,
          }}
          whileHover={{ scale: 1.05 }}
          onClick={handlePillClick}
          className={cn(
            "flex items-center gap-2 px-3 py-2 bg-textured border-2 border-blue-400 dark:border-blue-600 rounded-full shadow-sm cursor-pointer transition-all",
            currentContainerId ? "ring-1 ring-blue-500" : "",
            isDragging ? "ring-2 ring-blue-500 shadow-lg z-50" : "",
            pillClassName
          )}
        >
          {pillView || (
            <>
              <span className="text-sm font-medium truncate">{id}</span>
              <X size={14} className="text-gray-500" />
            </>
          )}
        </motion.div>
      </div>
    );
  }

  // Render the card in full form
  return (
    <div ref={containerRef} className={cn("[perspective:3000px] z-20 relative")}>
      <motion.div
        ref={cardRef}
        drag={true}
        dragControls={dragControls}
        dragPropagation={false}
        dragMomentum={true}
        dragElastic={0.1}
        dragTransition={{ 
          power: 0.3,
          timeConstant: 200,
          modifyTarget: (target) => Math.round(target / 10) * 10
        }}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        style={{
          x,
          y,
          scale,
          rotateX: isReturningToCard ? 0 : rotateX,
          rotateY: isReturningToCard ? 0 : rotateY,
          willChange: "transform",
          position: "absolute",
          top: 0,
          left: 0,
          zIndex: isDragging ? 50 : 20,
        }}
        animate={controls}
        whileHover={{ scale: 1.02 }}
        onPointerMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className={cn(
          "relative min-h-80 w-80 overflow-hidden rounded-md bg-white p-6 border-2 border-indigo-400 dark:border-indigo-600 shadow-md dark:bg-gray-800 transition-all",
          isReturningToCard ? "ring-2 ring-blue-500" : "",
          isDragging ? "shadow-xl ring-2 ring-indigo-500 dark:ring-indigo-400" : "",
          className
        )}
      >
        {children}
      </motion.div>
    </div>
  );
};

export const TransformableCardContainer = ({
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