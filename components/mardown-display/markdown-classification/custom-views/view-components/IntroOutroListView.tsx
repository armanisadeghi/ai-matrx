import React, { useState, useEffect } from 'react';
import { Lightbulb, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import { useIsMobile } from "@ai-matrx/kit/media-query";
import DefaultErrorFallback from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback";
import MarkdownTextDisplay from "@/components/mardown-display/markdown-classification/custom-views/common/MarkdownTextDisplay";

// Types for the structured content
interface ContentItem {
  id: number;
  title: string;
  text: string | string[];
}

interface ContentData {
  intro: {
    title: string;
    text: string;
  };
  items: ContentItem[];
  outro: {
    title: string;
    text: string;
  };
}

interface IntroOutroListViewProps {
  data: ContentData;
  isLoading?: boolean;
}

// Main Component for displaying the structured content
const IntroOutroListViewDisplay = ({ data }: { data: ContentData }) => {
  const { intro, items, outro } = data;
  const [expandedItems, setExpandedItems] = useState<number[]>([]);
  
  const toggleItem = (id: number) => {
    setExpandedItems(prev => 
      prev.includes(id) 
        ? prev.filter(itemId => itemId !== id) 
        : [...prev, id]
    );
  };

  return (
    <div className="max-w-4xl mx-auto overflow-hidden rounded-xl shadow-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
      {/* Header */}
      <div className="px-8 py-10 bg-gradient-to-r from-blue-600/90 via-indigo-600/90 to-violet-600/90 text-white">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-white/10 rounded-lg">
            <Lightbulb size={24} className="text-amber-300" />
          </div>
          {intro.title && (
            <h1 className="text-3xl font-bold">{intro.title}</h1>
          )}
        </div>
        <div className="text-xl font-medium text-white">
          <MarkdownTextDisplay content={intro.text} className="text-white/90" />
        </div>
      </div>

      {/* Items Container */}
      <div className="p-6 md:p-8 space-y-5">
        {items.map((item) => (
          <div 
            key={item.id}
            className={`
              bg-slate-50 dark:bg-slate-800/50 border-l-4 
              ${expandedItems.includes(item.id) 
                ? 'border-indigo-500 dark:border-indigo-400' 
                : 'border-indigo-300 dark:border-indigo-700'} 
              rounded-lg shadow-sm hover:shadow-md transition-all duration-200
            `}
          >
            <div 
              className="p-5 cursor-pointer"
              onClick={() => toggleItem(item.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className={`
                    w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                    ${expandedItems.includes(item.id) 
                      ? 'bg-indigo-500 text-white' 
                      : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'}
                  `}>
                    {item.id}
                  </div>
                  <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                    {item.title}
                  </h2>
                </div>
                <div className="text-indigo-500 dark:text-indigo-400">
                  {expandedItems.includes(item.id) ? (
                    <ChevronDown size={20} />
                  ) : (
                    <ChevronRight size={20} />
                  )}
                </div>
              </div>
              <div className="pl-11">
                <MarkdownTextDisplay 
                  content={item.text}
                  isCollapsed={!expandedItems.includes(item.id)}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Outro Section */}
      {outro && (
        <div className="mx-6 md:mx-8 mb-8 p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
          <h3 className="text-xl font-bold text-indigo-700 dark:text-indigo-300 mb-2">
            {outro.title}
          </h3>
          <MarkdownTextDisplay content={outro.text} />
        </div>
      )}

      {/* Footer */}
      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 text-center text-slate-600 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
        <p>{items.length} Key Points • Click to expand for details</p>
      </div>
    </div>
  );
};

// Loading Component
export const IntroOutroListViewLoading = () => {
  const [loadingProgress, setLoadingProgress] = useState(0);
  
  // Simulate loading progress
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        const newProgress = prev + Math.random() * 8;
        return newProgress > 100 ? 100 : newProgress;
      });
    }, 300);
    
    return () => clearInterval(interval);
  }, []);
  
  // Generate placeholder items
  const placeholderItems = Array(5).fill(null).map((_, idx) => ({
    id: idx + 1,
    title: "Loading item...",
    text: "This content is being prepared and will be available shortly."
  }));

  return (
    <div className="max-w-4xl mx-auto overflow-hidden rounded-xl shadow-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
      {/* Loading Header */}
      <div className="px-8 py-10 bg-gradient-to-r from-blue-600/90 via-indigo-600/90 to-violet-600/90 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent shimmer-animation"></div>
        
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-white/10 rounded-lg">
            <Lightbulb size={24} className="text-amber-300 animate-pulse" />
          </div>
          <div className="h-8 w-48 bg-white/20 rounded loading-shine"></div>
        </div>
        
        <div className="h-6 w-3/4 bg-white/20 rounded loading-shine"></div>
        
        {/* Progress bar */}
        <div className="mt-8 h-2 bg-white/30 rounded-full overflow-hidden">
          <div 
            className="h-full bg-amber-300 transition-all duration-300 ease-out"
            style={{ width: `${loadingProgress}%` }}
          ></div>
        </div>
        <p className="mt-2 text-sm font-light opacity-80 text-right">
          {Math.round(loadingProgress)}% complete
        </p>
      </div>

      {/* Loading Items Container */}
      <div className="p-6 md:p-8 space-y-5">
        {placeholderItems.map((item) => (
          <div 
            key={item.id}
            className="bg-slate-50 dark:bg-slate-800/50 border-l-4 border-indigo-200 dark:border-indigo-800 rounded-lg shadow-sm overflow-hidden animate-pulse-subtle"
            style={{ animationDelay: `${item.id * 150}ms` }}
          >
            <div className="p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 loading-shine"></div>
                <div className="h-6 w-40 bg-slate-200 dark:bg-slate-700 rounded loading-shine"></div>
              </div>
              
              <div className="pl-11 space-y-2">
                {[...Array(2)].map((_, i) => (
                  <div 
                    key={i} 
                    className="h-4 bg-slate-200 dark:bg-slate-700 rounded loading-shine"
                    style={{ 
                      width: `${90 - (i * 15)}%`, 
                      animationDelay: `${i * 150}ms` 
                    }}
                  ></div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Loading Outro */}
      <div className="mx-6 md:mx-8 mb-8 p-6 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl border border-indigo-100 dark:border-indigo-800/30">
        <div className="h-6 w-48 bg-indigo-200 dark:bg-indigo-800 rounded mb-3 loading-shine"></div>
        <div className="h-4 w-full bg-slate-200 dark:bg-slate-700 rounded loading-shine"></div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 text-center text-slate-600 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          <p>Loading content...</p>
        </div>
      </div>
    </div>
  );
};

// Main wrapper component with error handling
export default function IntroOutroListView({ data, isLoading = false }: IntroOutroListViewProps) {
  const isMobile = useIsMobile();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    if (isMobile) {
      console.log("Using responsive design for mobile view");
    }
  }, [isMobile]);

  useEffect(() => {
    setHasError(false);
  }, [data]);

  if (isLoading) {
    return <IntroOutroListViewLoading />;
  }

  try {
    if (!data || hasError) {
      return (
        <DefaultErrorFallback
          title="Content Display Error"
          message="There was an error displaying the structured content."
        />
      );
    }
    return <IntroOutroListViewDisplay data={data} />;
  } catch (error) {
    console.error("Error rendering IntroOutroListViewDisplay:", error);
    setHasError(true);
    return (
      <DefaultErrorFallback
        title="Content Display Error"
        message="There was an error displaying the structured content."
      />
    );
  }
}

// Combined styles
const styles = `
.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.shimmer-animation {
  animation: shimmer 2s infinite linear;
}
@keyframes pulse-subtle {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}
.animate-pulse-subtle {
  animation: pulse-subtle 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.loading-shine {
  position: relative;
  overflow: hidden;
}
.loading-shine::after {
  content: "";
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  transform: translateX(-100%);
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0,
    rgba(255, 255, 255, 0.2) 20%,
    rgba(255, 255, 255, 0.5) 60%,
    rgba(255, 255, 255, 0)
  );
  animation: shimmer 2s infinite;
}
.dark .loading-shine::after {
  background-image: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0,
    rgba(255, 255, 255, 0.05) 20%,
    rgba(255, 255, 255, 0.1) 60%,
    rgba(255, 255, 255, 0)
  );
}
`;