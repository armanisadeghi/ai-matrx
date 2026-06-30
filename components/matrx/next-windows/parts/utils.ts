// components/matrx/next-windows/parts/color-utils.ts

import { useState, useEffect, RefObject } from "react";

export const useBackgroundPosition = () => {
  const [backgroundPosition, setBackgroundPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setBackgroundPosition({ x: e.clientX / 100, y: e.clientY / 100 });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return { backgroundPosition, setBackgroundPosition };
};

export const useWindowSize = (containerRef: RefObject<HTMLElement | null>) => {
  const [windowSize, setWindowSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        let columns = 4;
        if (containerWidth < 1200) columns = 3;
        if (containerWidth < 1000) columns = 2;
        if (containerWidth < 800) columns = 1;

        const maxWindowWidth = Math.min(
          300,
          (containerWidth - (columns + 1) * 16) / columns,
        );
        const windowHeight = maxWindowWidth * (2 / 3);
        setWindowSize({ width: maxWindowWidth, height: windowHeight });
      }
    };

    handleResize();
    const resizeObserver = new ResizeObserver(handleResize);
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [containerRef]);

  return windowSize;
};
