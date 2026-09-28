// components/admin/AdminIndicator.tsx
import React, { useState, useRef, useEffect } from "react";
import SmallIndicator from "./SmallIndicator";
import MediumIndicator from "./MediumIndicator";
import LargeIndicator from "./LargeIndicator";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdminDebugger } from "@/lib/redux/slices/userSlice";

type IndicatorSize = "small" | "medium" | "large";

interface Position {
  x: number;
  y: number;
}

/**
 * Floating admin chip — registered as `overlayId: "adminIndicator"` in
 * the window-panels registry. The unified renderer mounts this component
 * with `{ isOpen, onClose, ...defaultData }`. We accept the props for
 * contract conformance but the chip ignores `onClose` — closing happens
 * via `dispatch(toggleOverlay({ overlayId: "adminIndicator" }))` from
 * the sidebar / user menu.
 *
 * Self-gates on super-admin so a stray Redux dispatch by a non-admin
 * (e.g. via persisted state) cannot leak the chip into a normal user's UI.
 */
interface AdminIndicatorProps {
  isOpen?: boolean;
  // Accepted for OverlaySurface contract; intentionally unused — the chip
  // is closed via the same toggleOverlay action used to open it.
  onClose?: () => void;
}

const AdminIndicator: React.FC<AdminIndicatorProps> = () => {
  const isSuperAdmin = useAppSelector(selectIsSuperAdminDebugger);
  const [size, setSize] = useState<IndicatorSize>("small");
  const [position, setPosition] = useState<Position>({ x: 50, y: 5 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const indicatorRef = useRef<HTMLDivElement>(null);
  // Drag handling functions
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (indicatorRef.current) {
      const rect = indicatorRef.current.getBoundingClientRect();
      setDragOffset({
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      });
      setIsDragging(true);
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Handle dragging event listeners
  useEffect(() => {
    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    } else {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging]);

  // Size cycling functions
  const cycleSize = (direction: "up" | "down") => {
    const sizes: IndicatorSize[] = ["small", "medium", "large"];
    const currentIndex = sizes.indexOf(size);
    if (direction === "up") {
      const nextIndex = (currentIndex + 1) % sizes.length;
      setSize(sizes[nextIndex]);
    } else if (direction === "down") {
      const prevIndex = (currentIndex - 1 + sizes.length) % sizes.length;
      setSize(sizes[prevIndex]);
    }
  };

  // Render the appropriate indicator based on size
  const renderIndicator = () => {
    switch (size) {
      case "medium":
        return (
          <div
            ref={indicatorRef}
            style={{
              position: "fixed",
              left: `${position.x}px`,
              top: `${position.y}px`,
              zIndex: 9999,
              userSelect: "none",
              cursor: isDragging ? "grabbing" : "default",
              transition: isDragging ? "none" : "all 0.2s ease",
              filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.25))",
            }}
          >
            <MediumIndicator
              onDragStart={handleMouseDown}
              onSizeUp={() => cycleSize("up")}
              onSizeDown={() => cycleSize("down")}
            />
          </div>
        );
      case "large":
        return (
          <LargeIndicator
            onSizeDown={() => setSize("medium")}
            onSizeSmall={() => setSize("small")}
          />
        );
      default: // "small" case
        return (
          <div
            ref={indicatorRef}
            style={{
              position: "fixed",
              left: `${position.x}px`,
              top: `${position.y}px`,
              zIndex: 9999,
              userSelect: "none",
              cursor: isDragging ? "grabbing" : "default",
              transition: isDragging ? "none" : "all 0.2s ease",
              filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.25))",
            }}
          >
            <SmallIndicator
              onDragStart={handleMouseDown}
              onSizeChange={() => cycleSize("up")}
            />
          </div>
        );
    }
  };

  if (!isSuperAdmin) return null;

  return <>{renderIndicator()}</>;
};

export default AdminIndicator;
