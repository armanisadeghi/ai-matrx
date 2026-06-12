"use client";

import FloatingSheet from "@/components/official/FloatingSheet";
import React, { useState } from "react";

const FloatingSheetDemo = () => {
    const [isSheetOpen, setIsSheetOpen] = useState(false);
    const [selectedDemo, setSelectedDemo] = useState('basic');
    
    // Custom footer component
    const customFooter = (
      <div className="flex justify-end gap-2">
        <button 
          onClick={() => setIsSheetOpen(false)}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:focus:ring-gray-600"
        >
          Cancel
        </button>
        <button 
          onClick={() => setIsSheetOpen(false)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Save Changes
        </button>
      </div>
    );
    
    // Different sheet configurations
    const sheetConfigs = {
      basic: {
        title: "Basic Sheet",
        description: "A simple sheet with default settings",
        width: "md",
        position: "right",
      },
      wide: {
        title: "Wide Sheet",
        description: "A wider sheet with more content space",
        width: "lg",
        position: "right",
      },
      left: {
        title: "Left-Positioned Sheet",
        description: "This sheet slides in from the left",
        width: "md",
        position: "left",
      },
      noHeader: {
        title: "",
        showCloseButton: false,
        width: "md",
        position: "right",
      },
      withFooter: {
        title: "Sheet with Footer",
        description: "This sheet includes action buttons in a footer",
        width: "md",
        position: "right",
        footer: customFooter,
      },
      floating: {
        title: "Floating Sheet",
        description: "A sheet with spacing from edges (floating)",
        width: "md",
        position: "right",
        spacing: "4",
      },
      customStyle: {
        title: "Custom Styled Sheet",
        description: "A sheet with custom styling and more spacing",
        width: "md",
        position: "right",
        spacing: "6",
        rounded: "3xl",
        className: "border-2 border-blue-500 dark:border-blue-400",
      },
    };
    
    const currentConfig = sheetConfigs[selectedDemo];
    
    return (
      <div className="min-h-dvh bg-gray-100 dark:bg-gray-900 p-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Floating Sheet Component Demo</h1>
          
          <div className="bg-textured rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Select a Demo</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-6">
              {Object.keys(sheetConfigs).map((key) => (
                <button
                  key={key}
                  onClick={() => setSelectedDemo(key)}
                  className={`p-3 rounded-md text-left transition-colors ${
                    selectedDemo === key 
                    ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-200 border-2 border-blue-500'
                    : 'bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200'
                  }`}
                >
                  <span className="font-medium">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                </button>
              ))}
            </div>
            
            <div className="flex justify-center">
              <button
                onClick={() => setIsSheetOpen(true)}
                className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Open {selectedDemo.charAt(0).toUpperCase() + selectedDemo.slice(1)} Sheet
              </button>
            </div>
          </div>
          
          {/* Example sheet content based on selected demo */}
          <FloatingSheet
            isOpen={isSheetOpen}
            onClose={() => setIsSheetOpen(false)}
            {...currentConfig}
          >
            <div className="space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Floating Sheet Demo</h3>
                <p className="text-gray-600 dark:text-gray-300">
                  This is a highly customizable floating sheet component that can hold any content while maintaining a gap from the screen edges.
                </p>
              </div>
              
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Current Configuration</h4>
                <div className="space-y-1 text-sm">
                  <p><span className="text-gray-500 dark:text-gray-400">Position:</span> {currentConfig.position}</p>
                  <p><span className="text-gray-500 dark:text-gray-400">Width:</span> {currentConfig.width}</p>
                  <p><span className="text-gray-500 dark:text-gray-400">Has footer:</span> {currentConfig.footer ? 'Yes' : 'No'}</p>
                  <p><span className="text-gray-500 dark:text-gray-400">Spacing:</span> {currentConfig.spacing || '4'}</p>
                </div>
              </div>
              
              <div className="space-y-4">
                <h4 className="font-medium text-gray-900 dark:text-white">Customizable Features</h4>
                <ul className="space-y-2 text-gray-600 dark:text-gray-300">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Position (right, left, top, bottom)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Size (sm, md, lg, xl, 2xl, 3xl, 4xl, full)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Spacing from edges (using tailwind spacing scale)</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Border radius customization</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Optional title and description</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Optional footer for action buttons</span>
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    <span>Custom styling via className props</span>
                  </li>
                </ul>
              </div>
              
              {selectedDemo === 'customStyle' && (
                <div className="space-y-2 border-l-4 border-blue-500 pl-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">Custom Styling Example</h4>
                  <p className="text-gray-600 dark:text-gray-300">
                    This sheet demonstrates custom border styling, different spacing, and a larger border radius.
                  </p>
                </div>
              )}
              
              {/* Sample form content */}
              {selectedDemo === 'withFooter' && (
                <div className="space-y-4 border-t border-border pt-4 mt-4">
                  <h4 className="font-medium text-gray-900 dark:text-white">Sample Form</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                      <input type="text" className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
                      <input type="email" className="w-full rounded-md border border-gray-300 dark:border-gray-600 px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                    </div>
                  </div>
                </div>
              )}
              
              {/* Scrollable content example */}
              <div className="border-t border-border pt-4 mt-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Scroll Example</h4>
                <div className="h-64 overflow-y-auto border-border rounded-md p-4">
                  <p className="text-gray-600 dark:text-gray-300 mb-4">The content area is scrollable when content exceeds the available space:</p>
                  {Array.from({ length: 10 }).map((_, i) => (
                    <p key={i} className="text-gray-600 dark:text-gray-300 mb-4">
                      Scroll example paragraph {i + 1}. This demonstrates that the content area can scroll independently while the header and footer remain fixed.
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </FloatingSheet>
        </div>
      </div>
    );
  };
  
  export default FloatingSheetDemo;
  