'use client';

import React, { useState, useEffect } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import DefaultErrorFallback from '@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback';
import { Loader2 } from 'lucide-react';

interface DynamicViewProps {
  data: unknown;
  isLoading?: boolean;
  title?: string;
}

// Component to recursively render any data structure
const DynamicDataRenderer = ({ data, depth = 0 }: { data: unknown; depth?: number }) => {
  // Base case: null or undefined
  if (data === null || data === undefined) {
    return <span className="text-slate-400 dark:text-slate-500 italic">No data</span>;
  }

  // Handle primitive types
  if (typeof data !== 'object') {
    return <span className="text-slate-700 dark:text-slate-300">{String(data)}</span>;
  }

  // Handle arrays
  if (Array.isArray(data)) {
    if (data.length === 0) {
      return <span className="text-slate-400 dark:text-slate-500 italic">Empty array</span>;
    }

    return (
      <ul className="space-y-1 pl-4">
        {data.map((item, index) => (
          <li key={index} className="flex items-start">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 mt-2 mr-2 flex-shrink-0"></span>
            <DynamicDataRenderer data={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }

  // Handle objects
  const entries = Object.entries(data as Record<string, unknown>);
  if (entries.length === 0) {
    return <span className="text-slate-400 dark:text-slate-500 italic">Empty object</span>;
  }

  return (
    <div className={`space-y-2 ${depth > 0 ? 'pl-4' : ''}`}>
      {entries.map(([key, value]) => (
        <div key={key} className="group">
          <div className="flex flex-col">
            <h3 className={`font-medium text-slate-800 dark:text-slate-200 ${depth === 0 ? 'text-lg capitalize border-b border-slate-200 dark:border-slate-700 pb-1 mb-2' : ''}`}>
              {key.replace(/_/g, ' ')}
            </h3>
            <div className="pl-2">
              <DynamicDataRenderer data={value} depth={depth + 1} />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

const DynamicDataDisplay = ({ data, title }: { data: unknown; title?: string }) => {
  return (
    <div className="max-w-5xl mx-auto rounded-xl overflow-hidden shadow-lg bg-white dark:bg-slate-800 transition-colors duration-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-500 to-slate-600 dark:from-slate-700 dark:to-slate-800 px-6 py-5">
        <h1 className="text-xl font-bold text-white">
          {title || 'Dynamic Data View'}
        </h1>
      </div>
      
      {/* Content */}
      <div className="p-6 bg-slate-50 dark:bg-slate-800">
        <DynamicDataRenderer data={data} />
      </div>
      
      {/* Footer */}
      <div className="px-6 py-3 bg-slate-100 dark:bg-slate-700 text-center text-slate-500 dark:text-slate-400 text-sm">
        <p>Dynamic Data View • Generated: {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
};

const DynamicSkeleton = ({ title }: { title?: string }) => {
  return (
    <div className="max-w-5xl mx-auto rounded-xl overflow-hidden shadow-lg bg-white dark:bg-slate-800">
      {/* Header Skeleton */}
      <div className="bg-gradient-to-r from-slate-500 to-slate-600 dark:from-slate-700 dark:to-slate-800 px-6 py-5">
        <div className="h-6 w-48 bg-white/20 rounded-md animate-pulse"></div>
      </div>
      
      {/* Content Skeleton */}
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((section) => (
          <div key={section} className="space-y-2">
            <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse"></div>
            <div className="pl-4 space-y-2">
              {Array(Math.floor(Math.random() * 3) + 1).fill(0).map((_, i) => (
                <div key={i} className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
              ))}
            </div>
          </div>
        ))}
      </div>
      
      {/* Footer Skeleton */}
      <div className="px-6 py-3 bg-slate-100 dark:bg-slate-700 text-center">
        <div className="h-4 w-48 mx-auto bg-slate-200 dark:bg-slate-600 rounded-md animate-pulse"></div>
      </div>
    </div>
  );
};

export default function DynamicView({ data, isLoading = false, title }: DynamicViewProps) {
  const isMobile = useIsMobile();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (isMobile) {
      console.log("DynamicView uses the same display for mobile and desktop");
    }
  }, [isMobile]);

  useEffect(() => {
    setHasError(false);
  }, [data]);

  if (isLoading) {
    return <DynamicSkeleton title={title} />;
  }

  try {
    if (!data || hasError) {
      return <DefaultErrorFallback
        title="Data Display Error"
        message="There was an error displaying the data."
      />;
    }
    return <DynamicDataDisplay data={data} title={title} />;
  } catch (error) {
    console.error("Error rendering DynamicDataDisplay:", error);
    setHasError(true);
    return <DefaultErrorFallback
      title="Data Display Error"
      message="There was an error displaying the data."
    />;
  }
}

// Add loading animation styles for skeleton
const styles = `
@keyframes pulse {
  0%, 100% {
    opacity: 0.6;
  }
  50% {
    opacity: 0.3;
  }
}

.animate-pulse {
  animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
`; 