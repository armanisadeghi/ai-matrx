import { useEffect, useState } from "react";
import { Image, Rocket, ArrowRight, ExternalLink, Lightbulb, Loader2 } from 'lucide-react';
import { useIsMobile } from "@/hooks/use-mobile";
import DefaultErrorFallback from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback";

interface AppSuggestion {
    app_name?: string;
    app_description?: string;
    image_description?: string;
    [key: string]: unknown; // Allow for other properties
}

interface AppSuggestionsData {
    extracted?: {
        suggestions?: AppSuggestion[];
        title?: string;
    };
    [key: string]: unknown; // Allow for other properties
}

interface AppSuggestionsDisplayProps {
    data: AppSuggestionsData;
    handleGenerate?: (index: number, imageDescription: string) => void;
    handleSelect?: (index: number, suggestion: AppSuggestion) => void;
    imageUrls?: Record<number, string>;
    isLoading?: boolean;
}

const AppSuggestionsDisplay = ({ data, handleGenerate, handleSelect, imageUrls = {}, isLoading = false }: AppSuggestionsDisplayProps) => {
    // Handle missing or malformed data gracefully
    const suggestions = Array.isArray(data?.extracted?.suggestions) ? data.extracted.suggestions : [];
    const title = data?.extracted?.title || "App Suggestions";

    // Track which suggestion's description is expanded
    const [expandedDescription, setExpandedDescription] = useState<number | null>(null);
    const [expandedImageDescription, setExpandedImageDescription] = useState<number | null>(null);
    const [selectedSuggestion, setSelectedSuggestion] = useState<number | null>(null);

    const toggleDescription = (index: number) => {
        setExpandedDescription(expandedDescription === index ? null : index);
    };

    const toggleImageDescription = (index: number) => {
        setExpandedImageDescription(expandedImageDescription === index ? null : index);
    };

    const handleSelectSuggestion = (index: number) => {
        const newSelection = selectedSuggestion === index ? null : index;
        setSelectedSuggestion(newSelection);
        
        // Call the parent callback with selection data
        if (handleSelect) {
            if (newSelection !== null) {
                handleSelect(newSelection, suggestions[newSelection]);
            } else {
                // If deselecting, we could pass null or handle differently
                // For now, let's not call handleSelect when deselecting
            }
        }
    };

    // Function to trigger image generation
    const generateImage = (index: number, imageDescription?: string) => {
        if (handleGenerate && imageDescription) {
            handleGenerate(index, imageDescription);
        }
    };

    return (
        <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
            {/* Header */}
            <div className="px-8 pt-5 pb-2 bg-gradient-to-r from-blue-500/90 via-indigo-500/90 to-violet-500/90 text-white">
                <h1 className="text-3xl font-bold flex items-center gap-3">
                    <Lightbulb size={28} className="text-amber-300" />
                    {title}
                </h1>
                <p className="mt-2 text-lg font-light opacity-90">Review these naming and branding suggestions for new app</p>
            </div>

            {/* Suggestions Container */}
            <div className="p-4 md:p-6 space-y-4">
                {suggestions.length > 0 ? (
                    suggestions.map((suggestion, index) => (
                        <div
                            key={index}
                            className={`bg-slate-50 dark:bg-slate-800/50 hover:shadow-md transition-all duration-200 cursor-pointer ${
                                selectedSuggestion === index
                                    ? "border-2 border-indigo-300 dark:border-indigo-700 rounded-3xl shadow-3xl"
                                    : "border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm"
                            } overflow-hidden`}
                            onClick={() => handleSelectSuggestion(index)}
                        >
                            <div className="p-4 md:p-5">
                                <div className="flex flex-col md:flex-row gap-4 md:items-start">
                                    {/* App Details Section */}
                                    <div className="flex-1 space-y-4">
                                        <div className="flex justify-between items-start">
                                            <h2
                                                className={`text-2xl font-bold ${
                                                    selectedSuggestion === index
                                                        ? "text-indigo-600 dark:text-indigo-400"
                                                        : "text-indigo-600 dark:text-indigo-700"
                                                }`}
                                            >
                                                {suggestion.app_name || "Untitled App"}
                                            </h2>
                                            <button
                                                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                                                    selectedSuggestion === index
                                                        ? "bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-100"
                                                        : "bg-slate-100 dark:bg-indigo-600 text-slate-600 dark:text-slate-300"
                                                }`}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleSelectSuggestion(index);
                                                }}
                                            >
                                                {selectedSuggestion === index ? "Selected" : "Select"}
                                            </button>
                                        </div>

                                        <p
                                            className={`text-slate-700 dark:text-slate-300 ${
                                                expandedDescription === index ? "" : "line-clamp-3"
                                            }`}
                                        >
                                            {suggestion.app_description || "No description available."}
                                        </p>

                                        {suggestion.app_description && suggestion.app_description.length > 180 && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleDescription(index);
                                                }}
                                                className="text-indigo-500 dark:text-indigo-400 font-medium text-sm flex items-center gap-1 hover:underline"
                                            >
                                                {expandedDescription === index ? "Show less" : "Read more"}
                                                <ArrowRight
                                                    size={14}
                                                    className={`transition-transform ${expandedDescription === index ? "rotate-90" : ""}`}
                                                />
                                            </button>
                                        )}
                                    </div>

                                    {/* Image Section */}
                                    <div className="md:w-2/5 space-y-3">
                                        <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                            <Image size={16} />
                                            Visual Inspiration
                                        </h3>

                                        <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3 text-sm text-slate-600 dark:text-slate-300">
                                            {suggestion.image_description ? (
                                                <>
                                                    <p className={`text-xs mb-3 ${
                                                        expandedImageDescription === index ? "" : "line-clamp-3"
                                                    }`}>
                                                        {suggestion.image_description}
                                                    </p>
                                                    
                                                    {suggestion.image_description.length > 120 && (
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                toggleImageDescription(index);
                                                            }}
                                                            className="text-indigo-500 dark:text-indigo-400 font-medium text-xs flex items-center gap-1 hover:underline mb-3"
                                                        >
                                                            {expandedImageDescription === index ? "Show less" : "Read more"}
                                                            <ArrowRight
                                                                size={12}
                                                                className={`transition-transform ${expandedImageDescription === index ? "rotate-90" : ""}`}
                                                            />
                                                        </button>
                                                    )}
                                                </>
                                            ) : (
                                                <p className="text-xs mb-3">No image description available.</p>
                                            )}

                                            {/* Only show generate button if handleGenerate is provided */}
                                            {handleGenerate && suggestion.image_description && (
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        generateImage(index, suggestion.image_description);
                                                    }}
                                                    className="w-full flex items-center justify-center gap-2 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg transition-colors text-sm font-medium"
                                                >
                                                    <Rocket size={16} />
                                                    Generate Image
                                                </button>
                                            )}

                                            {/* Display image if URL exists for this suggestion */}
                                            {imageUrls[index] && (
                                                <div className="mt-3 relative group">
                                                    <img
                                                        src={imageUrls[index]}
                                                        alt={`Generated visual for ${suggestion.app_name || 'App'}`}
                                                        className="w-full h-auto rounded-lg object-cover shadow-sm"
                                                    />
                                                    <a
                                                        href={imageUrls[index]}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="absolute top-2 right-2 p-1.5 bg-white/80 dark:bg-slate-800/80 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <ExternalLink size={14} className="text-indigo-500" />
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-10">
                        <p className="text-slate-500 dark:text-slate-400">No app suggestions available</p>
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 text-center text-slate-600 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
                <p>{suggestions.length} Suggestions • Choose one or request more options</p>
            </div>
        </div>
    );
};


export const AppSuggestionsLoading = () => {
  const [loadingStage, setLoadingStage] = useState(0);
  
  // Simulate multi-stage loading process
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loadingStage < 3) {
        setLoadingStage(prev => prev + 1);
      }
    }, 1500); // Switch stages every 1.5 seconds
    
    return () => clearTimeout(timer);
  }, [loadingStage]);
  
  // Loading stage labels
  const loadingStages = [
    "Analyzing requirements...",
    "Generating app suggestions...",
    "Determiing unique App names...",
    "Writing compelling descriptions...",
    "Coming up with visual inspiration...",
    "Preparing branding options...",
    "Putting it all together...",
    "Finalizing recommendations...",
    "Genearting final output...",
  ];
  
  // Placeholder suggestions for the skeleton UI
  const placeholderSuggestions = [
    {
      app_name: "Loading suggestion...",
      app_description: "This innovative app combines cutting-edge technology with intuitive design to create a seamless user experience that addresses modern challenges in a unique way..."
    },
    {
      app_name: "Preparing concept...",
      app_description: "A revolutionary platform designed to streamline workflows and enhance productivity through intelligent automation and thoughtful user interface elements..."
    },
    {
      app_name: "Generating idea...",
      app_description: "This solution offers a comprehensive approach to solving everyday problems with a focus on accessibility, performance, and engaging visual elements..."
    }
  ];
  
  return (
    <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
      {/* Header with shimmer effect - streamlined height */}
      <div className="px-8 pt-5 pb-2 bg-gradient-to-r from-blue-500/90 via-indigo-500/90 to-violet-500/90 text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent shimmer-animation"></div>
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <Lightbulb size={28} className="text-amber-300 animate-pulse" />
          App Suggestions
        </h1>
        <p className="mt-2 text-lg font-light opacity-90">
          {loadingStages[loadingStage]}
        </p>
      </div>
      
      {/* Suggestions Container with skeleton loading */}
      <div className="p-4 md:p-6 space-y-8">
        {placeholderSuggestions.map((suggestion, index) => (
          <div 
            key={index} 
            className={`bg-slate-50 dark:bg-slate-800/50 border-2 border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden animate-pulse-subtle`}
            style={{ animationDelay: `${index * 200}ms` }}
          >
            <div className="p-4 md:p-5">
              <div className="flex flex-col md:flex-row gap-4 md:items-start">
                {/* App Details Section */}
                <div className="flex-1 space-y-4">
                  <div className="flex justify-between items-start">
                    <h2 className="text-2xl font-bold text-indigo-600/70 dark:text-indigo-700/70 loading-shine">
                      {suggestion.app_name}
                    </h2>
                    <div className="px-3 py-1.5 rounded-full bg-slate-200 dark:bg-slate-700 w-20"></div>
                  </div>
                  
                  <div className="space-y-2">
                    {/* Animated loading lines for description */}
                    {[...Array(3)].map((_, i) => (
                      <div 
                        key={i} 
                        className="h-4 bg-slate-200 dark:bg-slate-700 rounded loading-shine"
                        style={{ 
                          width: `${95 - (i * 15)}%`, 
                          animationDelay: `${i * 150}ms` 
                        }}
                      ></div>
                    ))}
                  </div>
                  
                  <div className="flex items-center gap-1 mt-2">
                    <div className="h-4 w-20 bg-slate-200 dark:bg-slate-700 rounded loading-shine"></div>
                    <ArrowRight size={14} className="text-slate-300 dark:text-slate-600" />
                  </div>
                </div>
                
                {/* Image Section */}
                <div className="md:w-2/5 space-y-3">
                  <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <Image size={16} />
                    Visual Inspiration
                  </h3>
                  
                  <div className="bg-slate-100 dark:bg-slate-700/50 rounded-lg p-3 text-sm">
                    {/* Loading lines for image description */}
                    {[...Array(3)].map((_, i) => (
                      <div 
                        key={i} 
                        className="h-3 bg-slate-200 dark:bg-slate-600 rounded mb-2 loading-shine"
                        style={{ 
                          width: `${85 - (i * 15)}%`, 
                          animationDelay: `${i * 150}ms` 
                        }}
                      ></div>
                    ))}
                    
                    {/* Generate Image button placeholder */}
                    <div className="w-full h-8 mt-3 bg-indigo-400 dark:bg-indigo-600/70 rounded-lg flex items-center justify-center gap-2">
                      <Loader2 size={16} className="text-white animate-spin" />
                      <span className="text-white text-sm font-medium">Processing</span>
                    </div>
                    
                    {/* Image placeholder */}
                    <div className="mt-3 h-8 bg-slate-200 dark:bg-slate-600 rounded-lg loading-shine"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      {/* Footer */}
      <div className="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 text-center text-slate-600 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          <p>Loading suggestions...</p>
        </div>
      </div>
    </div>
  );
};



// Combined and deduplicated styles
const styles = `
.line-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.line-clamp-4 {
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.animate-fadeIn {
  animation: fadeIn 0.3s ease-in-out;
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

export default function AppSuggestionsView({ data, handleGenerate, handleSelect, imageUrls = {}, isLoading = false }: AppSuggestionsDisplayProps) {
    const isMobile = useIsMobile();
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        if (isMobile) {
            console.log("This view doesn't currently have a separate mobile view");
        }
    }, [isMobile]);

    useEffect(() => {
        setHasError(false);
    }, [data]);

    if (isLoading) {
        return <AppSuggestionsLoading />;
    }

    try {
        if (!data || hasError) {
            return <DefaultErrorFallback
                title="App Suggestions Error"
                message="There was an error displaying the app suggestions."
            />;
        }
        return <AppSuggestionsDisplay data={data} handleGenerate={handleGenerate} handleSelect={handleSelect} imageUrls={imageUrls} isLoading={isLoading} />;
    } catch (error) {
        console.error("Error rendering AppSuggestionsDisplay:", error);
        setHasError(true);
        return <DefaultErrorFallback
            title="App Suggestions Error"
            message="There was an error displaying the app suggestions."
        />;
    }
}
