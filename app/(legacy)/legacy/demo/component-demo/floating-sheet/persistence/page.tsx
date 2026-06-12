"use client";

import React, { useState } from 'react';

// Simplified FloatingSheet for demo purposes
const FloatingSheet = ({ 
  children, 
  isOpen, 
  onClose, 
  title = "Sheet Title",
  position = "right",
  width = "md",
  height = "auto"
}) => {
  // Get position classes based on position prop
  const getPositionClasses = () => {
    const positionMap = {
      right: "top-4 bottom-4 right-4",
      left: "top-4 bottom-4 left-4",
      top: "top-4 left-4 right-4",
      bottom: "bottom-4 left-4 right-4",
      center: "inset-0 flex items-center justify-center"
    };
    return positionMap[position];
  };

  // Get transform classes for animations
  const getTransformClass = () => {
    const transformMap = {
      right: isOpen ? "translate-x-0" : "translate-x-full",
      left: isOpen ? "translate-x-0" : "-translate-x-full",
      top: isOpen ? "translate-y-0" : "-translate-y-full",
      bottom: isOpen ? "translate-y-0" : "translate-y-full",
      center: isOpen ? "scale-100 opacity-100" : "scale-95 opacity-0"
    };
    return transformMap[position];
  };

  // Get width classes
  const getWidthClass = () => {
    const widthMap = {
      sm: "max-w-sm",
      md: "max-w-md",
      lg: "max-w-lg",
      xl: "max-w-xl",
      "2xl": "max-w-2xl",
      full: "max-w-full"
    };
    
    // For top/bottom, use full width by default
    if ((position === "top" || position === "bottom") && width === "md") {
      return "max-w-full";
    }
    
    return widthMap[width];
  };

  // Get height classes
  const getHeightClass = () => {
    if (position === "right" || position === "left") {
      return "";
    }
    
    const heightMap = {
      sm: "max-h-sm",
      md: "max-h-md",
      lg: "max-h-lg",
      xl: "max-h-xl",
      full: "max-h-full",
      auto: position === "center" ? "max-h-[80dvh]" : "max-h-[50dvh]"
    };
    
    return heightMap[height];
  };

  const positionClasses = getPositionClasses();
  const widthClass = getWidthClass();
  const heightClass = getHeightClass();
  const transformClass = getTransformClass();

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Sheet */}
      <div
        className={`fixed ${positionClasses} z-50 ${position === 'center' ? '' : 'w-full'} ${widthClass} ${heightClass} rounded-2xl bg-white dark:bg-slate-900 shadow-lg transform transition-all duration-300 ease-in-out ${transformClass} ${isOpen ? 'visible' : 'invisible'}`}
      >
        <div className={`flex ${position === 'top' || position === 'bottom' ? 'h-full' : ''} flex-col`}>
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100 bg-transparent hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {children}
          </div>
        </div>
      </div>
    </>
  );
};

// Demo component
const PositioningDemo = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState("right");
  const [width, setWidth] = useState("md");
  const [height, setHeight] = useState("auto");

  const positions = ["right", "left", "top", "bottom", "center"];
  const widths = ["sm", "md", "lg", "xl", "2xl", "full"];
  const heights = ["auto", "sm", "md", "lg", "xl", "full"];

  const handleOpen = () => setIsOpen(true);
  const handleClose = () => setIsOpen(false);

  return (
    <div className="min-h-dvh bg-gray-100 dark:bg-gray-900 p-8">
      <div className="max-w-3xl mx-auto bg-textured p-6 rounded-lg shadow">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
          FloatingSheet Positioning Demo
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Position selector */}
          <div>
            <h2 className="font-medium text-gray-900 dark:text-white mb-3">Position</h2>
            <div className="space-y-2">
              {positions.map((pos) => (
                <label key={pos} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="position"
                    value={pos}
                    checked={position === pos}
                    onChange={() => setPosition(pos)}
                    className="text-blue-600"
                  />
                  <span className="text-gray-700 dark:text-gray-300 capitalize">{pos}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Width selector */}
          <div>
            <h2 className="font-medium text-gray-900 dark:text-white mb-3">Width</h2>
            <div className="space-y-2">
              {widths.map((w) => (
                <label key={w} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="width"
                    value={w}
                    checked={width === w}
                    onChange={() => setWidth(w)}
                    className="text-blue-600"
                  />
                  <span className="text-gray-700 dark:text-gray-300">{w}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Height selector (for top/bottom/center) */}
          <div>
            <h2 className="font-medium text-gray-900 dark:text-white mb-3">Height</h2>
            <div className="space-y-2">
              {heights.map((h) => (
                <label key={h} className="flex items-center space-x-2">
                  <input
                    type="radio"
                    name="height"
                    value={h}
                    checked={height === h}
                    onChange={() => setHeight(h)}
                    className="text-blue-600"
                  />
                  <span className="text-gray-700 dark:text-gray-300">{h}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="text-sm p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg text-blue-800 dark:text-blue-200 mb-6">
          <strong>Current Configuration:</strong> Position: {position}, Width: {width}, Height: {height}
          {position === "top" || position === "bottom" ? 
            <div className="mt-2">
              <strong>Note:</strong> Top and bottom positions default to full width unless specified otherwise.
            </div> : null
          }
        </div>

        <div className="flex justify-center">
          <button
            onClick={handleOpen}
            className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Open Sheet
          </button>
        </div>
      </div>

      <FloatingSheet
        isOpen={isOpen}
        onClose={handleClose}
        title={`${position.charAt(0).toUpperCase() + position.slice(1)} Sheet`}
        position={position}
        width={width}
        height={height}
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-300">
            This is a {position}-positioned sheet with width: {width} and height: {height}.
          </p>
          
          <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
            <h3 className="font-medium text-gray-900 dark:text-white mb-2">Position Details</h3>
            <ul className="list-disc pl-5 text-gray-600 dark:text-gray-300 space-y-1">
              <li><strong>Right:</strong> Slides in from the right side</li>
              <li><strong>Left:</strong> Slides in from the left side</li>
              <li><strong>Top:</strong> Slides in from the top (full-width by default)</li>
              <li><strong>Bottom:</strong> Slides in from the bottom (full-width by default)</li>
              <li><strong>Center:</strong> Appears in the center with scale+fade animation</li>
            </ul>
          </div>
          
          {/* Sample content to demonstrate scrolling */}
          <div className="border-t border-border pt-4 mt-4">
            <h3 className="font-medium text-gray-900 dark:text-white mb-2">Sample Content</h3>
            {Array.from({ length: 5 }).map((_, i) => (
              <p key={i} className="text-gray-600 dark:text-gray-300 mb-4">
                Paragraph {i + 1}: This is some sample content to demonstrate scrolling behavior 
                in different sheet positions and sizes.
              </p>
            ))}
          </div>
        </div>
      </FloatingSheet>
    </div>
  );
};

export default PositioningDemo;