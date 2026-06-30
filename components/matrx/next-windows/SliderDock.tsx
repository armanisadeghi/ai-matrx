import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, useAnimation } from "motion/react";
import { Settings, Layout, Columns2, Columns3, Columns4 } from "lucide-react";

const SliderDock = ({ items, initialIndex = 0, className, onItemClick }) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const containerRef = useRef<HTMLDivElement>(null);
  const controls = useAnimation();

  const visibleItems = 3;
  const itemWidth = 32; // Smaller size to fit in the corner
  const containerWidth = visibleItems * itemWidth;

  const getVisibleItems = () => {
    const start = Math.max(0, currentIndex - 1);
    const end = Math.min(items.length, start + visibleItems);
    return items.slice(start, end);
  };

  const handleMouseMove = (event) => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;

      const edgeThreshold = itemWidth;
      if (x < edgeThreshold) {
        setCurrentIndex(Math.max(0, currentIndex - 0.1));
      } else if (x > containerWidth - edgeThreshold) {
        setCurrentIndex(
          Math.min(items.length - visibleItems, currentIndex + 0.1),
        );
      }
    }
  };

  useEffect(() => {
    controls.start({ x: -currentIndex * itemWidth });
  }, [currentIndex, controls]);

  return (
    <div
      ref={containerRef}
      className={`relative overflow-hidden rounded-full bg-primary ${className}`}
      style={{ width: `${containerWidth}px`, height: `${itemWidth}px` }}
      onMouseMove={handleMouseMove}
    >
      <motion.div
        className="flex absolute left-0 top-0 h-full"
        animate={controls}
      >
        {items.map((item, index) => (
          <motion.button
            key={item.ratio}
            className="flex items-center justify-center text-primary-foreground"
            style={{
              width: itemWidth,
              height: itemWidth,
            }}
            onClick={() => onItemClick(item)}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            {item.icon}
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
};

const LayoutControl = ({ currentLayout, onLayoutChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  const layoutOptions = [
    { ratio: "2/4", columns: 4, icon: <Columns4 size={16} /> },
    { ratio: "2/3", columns: 4, icon: <Columns4 size={16} /> },
    { ratio: "2/2", columns: 4, icon: <Columns4 size={16} /> },
    { ratio: "3/2", columns: 3, icon: <Columns3 size={16} /> },
    { ratio: "4/2", columns: 3, icon: <Columns3 size={16} /> },
    { ratio: "6/2", columns: 2, icon: <Columns2 size={16} /> },
    { ratio: "8/2", columns: 2, icon: <Columns2 size={16} /> },
  ];

  const handleLayoutChange = (layout) => {
    onLayoutChange(layout);
    setIsOpen(false);
  };

  return (
    <div className="absolute top-2 right-2 z-50">
      <motion.button
        className="bg-primary text-primary-foreground p-2 rounded-full shadow-lg"
        onClick={() => setIsOpen(!isOpen)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
      >
        <Settings size={16} />
      </motion.button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-10 right-0 bg-popover text-popover-foreground p-2 rounded-lg shadow-lg"
          >
            <SliderDock
              items={layoutOptions}
              initialIndex={layoutOptions.findIndex(
                (option) => option.ratio === currentLayout.ratio,
              )}
              onItemClick={handleLayoutChange}
              className="mb-2"
            />
            <div className="text-xs mt-2 text-center">
              {currentLayout.ratio} ({currentLayout.columns} columns)
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default LayoutControl;
