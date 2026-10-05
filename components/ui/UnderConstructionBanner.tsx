import React from 'react';
import { AlertTriangle, Construction } from 'lucide-react';

interface UnderConstructionBannerProps {
  title?: string;
  message?: string;
  variant?: 'default' | 'subtle';
}

const UnderConstructionBanner = ({
  title = 'Under Construction',
  message = 'This page is currently being built and is for preview only. Check back soon for the completed version.',
  variant = 'default'
}: UnderConstructionBannerProps) => {
  if (variant === 'subtle') {
    return (
      <div className="w-full p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
        <div className="flex items-center">
          <Construction size={18} className="mr-2 flex-shrink-0" />
          <div>
            <p className="type-title">{message}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full mb-8 rounded-lg overflow-hidden">
      <div className="px-4 py-2 bg-amber-500 dark:bg-amber-600 text-white flex items-center">
        <AlertTriangle size={18} className="mr-2" />
        <h3 className="font-medium">{title}</h3>
      </div>
      <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/50 text-amber-800 dark:text-amber-300">
        <div className="flex">
          <Construction size={20} className="mr-3 flex-shrink-0 mt-0.5" />
          <p>{message}</p>
        </div>
      </div>
    </div>
  );
};

export default UnderConstructionBanner; 