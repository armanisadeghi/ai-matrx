"use client";
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { copyToClipboard } from "../utils/scraper-utils";
import { formatJson } from "@/utils/json/json-cleaner-utility";
import { CopyIcon, RefreshCw } from "lucide-react";

// Helper functions for JSON navigation and display
const getObjectKeys = (obj) => {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj);
};

const getValueType = (value) => {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
};

const isNavigable = (value) => {
  return value !== null && (typeof value === 'object' || Array.isArray(value));
};

const renderNavigationKeys = (keys, onKeyClick) => {
  if (!keys || keys.length === 0) return null;
  
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {keys.map((key) => (
        <Button 
          key={key} 
          size="sm" 
          variant="outline" 
          onClick={() => onKeyClick(key)}
          className="text-xs"
        >
          {key}
        </Button>
      ))}
    </div>
  );
};

const formatDisplayValue = (value) => {
  if (Array.isArray(value)) {
    return `${value.length} Items`;
  } else if (value === null) {
    return "null";
  } else if (typeof value === 'object') {
    return `{${Object.keys(value).length} properties}`;
  } else {
    return String(value);
  }
};

const FancyJsonExplorer = ({ pageData }) => {
  const [currentData, setCurrentData] = useState(pageData);
  const [navigationPath, setNavigationPath] = useState([]);
  const [currentKeys, setCurrentKeys] = useState([]);
  
  useEffect(() => {
    // Initialize with the cleaned data
    const initialData = pageData ? JSON.parse(formatJson(pageData)) : null;
    setCurrentData(initialData);
    setCurrentKeys(getObjectKeys(initialData));
  }, [pageData]);
  
  const handleReset = () => {
    const initialData = pageData ? JSON.parse(formatJson(pageData)) : null;
    setCurrentData(initialData);
    setNavigationPath([]);
    setCurrentKeys(getObjectKeys(initialData));
  };
  
  const handleKeyClick = (key) => {
    if (currentData && currentData[key] !== undefined) {
      const newValue = currentData[key];
      setNavigationPath([...navigationPath, key]);
      setCurrentData(newValue);
      setCurrentKeys(getObjectKeys(newValue));
    }
  };
  
  const renderContent = () => {
    if (!currentData) {
      return <div className="text-gray-500 dark:text-gray-400">No data available</div>;
    }
    
    if (Array.isArray(currentData)) {
      return (
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
          {currentData.map((item, index) => (
            <div key={index} className="mb-4 border-b border-border pb-2">
              <div className="font-medium text-gray-700 dark:text-gray-300 mb-1">Item {index}</div>
              <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200">
                {formatJson(item)}
              </pre>
            </div>
          ))}
        </div>
      );
    }
    
    if (typeof currentData === 'object' && currentData !== null) {
      return (
        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-md">
          {Object.entries(currentData).map(([key, value]) => (
            <div key={key} className="mb-4 border-b border-border pb-2">
              <div className="flex justify-between">
                <div className="font-medium text-gray-700 dark:text-gray-300">{key}</div>
                {isNavigable(value) && (
                  <Button 
                    size="sm" 
                    variant="ghost" 
                    onClick={() => handleKeyClick(key)}
                    className="text-xs p-1 h-6"
                  >
                    {formatDisplayValue(value)}
                  </Button>
                )}
              </div>
              {!isNavigable(value) && (
                <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 mt-1">
                  {typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
                </pre>
              )}
            </div>
          ))}
        </div>
      );
    }
    
    // Primitive value display
    return (
      <pre className="whitespace-pre-wrap bg-gray-50 dark:bg-gray-800 p-4 rounded-md text-sm text-gray-800 dark:text-gray-200">
        {typeof currentData === 'string' ? currentData : JSON.stringify(currentData, null, 2)}
      </pre>
    );
  };
  
  const jsonStr = formatJson(currentData);
  
  return (
    <div className="w-full">
      <div className="mb-4 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Path: {navigationPath.length > 0 ? '/' + navigationPath.join('/') : '/'}
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleReset}
            title="Reset"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={() => copyToClipboard(jsonStr)}
            title="Copy JSON"
          >
            <CopyIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>
      
      {renderNavigationKeys(currentKeys, handleKeyClick)}
      
      <div className="overflow-auto max-h-[70dvh]">
        {renderContent()}
      </div>
    </div>
  );
};

export default FancyJsonExplorer;