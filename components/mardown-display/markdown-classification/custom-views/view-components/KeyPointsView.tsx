import { useState, useEffect } from "react";
import { ChevronRight, CheckCircle2, Info, Lightbulb, ArrowRight, Loader2 } from 'lucide-react';
import { useIsMobile } from "@ai-matrx/kit/media-query";
import DefaultErrorFallback from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback";
import MarkdownTextDisplay from "@/components/mardown-display/markdown-classification/custom-views/common/MarkdownTextDisplay";

interface KeyPoint {
  id: number;
  title: string;
  text: string | string[];
}

interface Section {
  title: string;
  text: string;
}

interface KeyPointsData {
  intro: Section;
  items: KeyPoint[];
  outro: Section;
}

interface KeyPointsDisplayProps {
  data: KeyPointsData;
  isLoading?: boolean;
}

const KeyPointsDisplay = ({ data }: KeyPointsDisplayProps) => {
  const [expandedItem, setExpandedItem] = useState<number | null>(null);
  const [activeItem, setActiveItem] = useState<number | null>(null);

  const toggleExpand = (id: number) => {
    setExpandedItem(expandedItem === id ? null : id);
  };

  const setActive = (id: number) => {
    setActiveItem(id);
  };

  return (
    <div className="max-w-4xl mx-auto overflow-hidden rounded-xl shadow-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      {/* Header */}
      <div className="px-6 py-8 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white/20 rounded-lg">
            <Lightbulb size={24} className="text-amber-300" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">
              {data.intro.title || "Key Points"}
            </h1>
            <p className="text-white/90 leading-relaxed">
              {data.intro.text}
            </p>
          </div>
        </div>
      </div>

      {/* Items List */}
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {data.items.map((item) => (
          <div 
            key={item.id}
            className={`transition-all duration-200 ${
              activeItem === item.id 
                ? "bg-blue-50 dark:bg-slate-700/50" 
                : "bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700/30"
            }`}
          >
            <div 
              className="px-6 py-5 cursor-pointer"
              onClick={() => toggleExpand(item.id)}
              onMouseEnter={() => setActive(item.id)}
              onMouseLeave={() => setActiveItem(null)}
            >
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full ${
                  activeItem === item.id 
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" 
                    : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"
                }`}>
                  <span className="font-semibold text-sm">{item.id}</span>
                </div>
                
                <div className="flex-1">
                  <div className="flex justify-between items-center">
                    <h3 className={`font-bold text-lg ${
                      activeItem === item.id 
                        ? "text-blue-700 dark:text-blue-400" 
                        : "text-slate-800 dark:text-slate-200"
                    }`}>
                      {item.title}
                    </h3>
                    <ChevronRight 
                      size={18} 
                      className={`transition-transform duration-300 text-slate-400 dark:text-slate-500 ${
                        expandedItem === item.id ? "rotate-90" : ""
                      }`} 
                    />
                  </div>
                  
                  <div className="mt-1 text-slate-600 dark:text-slate-300">
                    <MarkdownTextDisplay 
                      content={item.text} 
                      isCollapsed={expandedItem !== item.id}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      {data.outro && (
        <div className="px-6 py-6 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-start gap-4">
            <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg text-amber-600 dark:text-amber-400">
              <Info size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 dark:text-slate-200 mb-1">
                {data.outro.title}
              </h3>
              <div className="text-sm">
                <MarkdownTextDisplay content={data.outro.text} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const KeyPointsLoading = () => {
  return (
    <div className="max-w-4xl mx-auto overflow-hidden rounded-xl shadow-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
      {/* Loading Header */}
      <div className="px-6 py-8 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-white/20 rounded-lg animate-pulse">
            <Loader2 size={24} className="text-amber-300 animate-spin" />
          </div>
          <div className="w-full">
            <div className="h-7 w-1/3 bg-white/30 rounded-md animate-pulse mb-3"></div>
            <div className="h-4 w-full bg-white/20 rounded-md animate-pulse mb-2"></div>
            <div className="h-4 w-2/3 bg-white/20 rounded-md animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Loading Items */}
      <div className="divide-y divide-slate-100 dark:divide-slate-700">
        {[1, 2, 3, 4].map((item) => (
          <div key={item} className="px-6 py-5 bg-white dark:bg-slate-800">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse"></div>
              <div className="flex-1">
                <div className="h-5 w-1/3 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse mb-3"></div>
                <div className="h-4 w-full bg-slate-100 dark:bg-slate-700/50 rounded-md animate-pulse mb-2"></div>
                <div className="h-4 w-2/3 bg-slate-100 dark:bg-slate-700/50 rounded-md animate-pulse"></div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Loading Footer */}
      <div className="px-6 py-6 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-amber-100/50 dark:bg-amber-900/20 rounded-lg animate-pulse">
            <div className="w-5 h-5"></div>
          </div>
          <div className="w-full">
            <div className="h-5 w-1/4 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse mb-3"></div>
            <div className="h-4 w-full bg-slate-100 dark:bg-slate-700/50 rounded-md animate-pulse"></div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main component with error handling
export default function KeyPointsView({ data, isLoading = false }: KeyPointsDisplayProps) {
  const isMobile = useIsMobile();
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [data]);

  if (isLoading) {
    return <KeyPointsLoading />;
  }

  try {
    if (!data || hasError) {
      return <DefaultErrorFallback
        title="Content Display Error"
        message="There was an error displaying this content."
      />;
    }
    return <KeyPointsDisplay data={data} />;
  } catch (error) {
    console.error("Error rendering KeyPointsDisplay:", error);
    setHasError(true);
    return <DefaultErrorFallback
      title="Content Display Error"
      message="There was an error displaying this content."
    />;
  }
}