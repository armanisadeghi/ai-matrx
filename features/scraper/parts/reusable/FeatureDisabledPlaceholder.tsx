"use client";
import React from "react";
import { LightbulbIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FeatureDisabledPlaceholderProps {
  featureName: string;
  description?: string;
  onEnable: () => void;
}

/**
 * Component shown when a feature is disabled, providing an option to enable it
 */
const FeatureDisabledPlaceholder = ({
  featureName,
  description,
  onEnable,
}: FeatureDisabledPlaceholderProps) => {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <div className="bg-gradient-to-br from-gray-50/90 to-white dark:from-gray-900/90 dark:to-gray-800 rounded-xl shadow-md p-10 max-w-md border-border">
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
          <LightbulbIcon className="h-8 w-8 text-white" />
        </div>
        
        <h3 className="text-xl font-bold mb-3 text-gray-800 dark:text-white text-center">
          {featureName} is currently inactive
        </h3>
        
        <p className="text-gray-600 dark:text-gray-300 mb-8 text-center">
          {description || `This feature is currently turned off. Enable it to activate ${featureName}.`}
        </p>
        
        <Button 
          onClick={onEnable}
          className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-medium py-2 rounded-lg transition-all duration-200 shadow-md"
        >
          Activate {featureName}
        </Button>
      </div>
    </div>
  );
};

export default FeatureDisabledPlaceholder;