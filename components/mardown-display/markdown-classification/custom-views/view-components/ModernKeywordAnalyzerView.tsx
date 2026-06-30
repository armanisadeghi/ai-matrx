import { useState, useEffect } from "react";
import {
  Plus,
  Minus,
  Search,
  Target,
  Users,
  TrendingUp,
  Brain,
  Edit3,
  X,
  MessageSquare,
} from "lucide-react";
import FlexibleLoadingComponent from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultLoadingComponent";
import { useIsMobile } from "@/hooks/use-mobile";
import DefaultErrorFallback from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback";

const ModernKeywordAnalyzerDisplay = ({ data }) => {
  const extracted = data?.extracted || {};
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [newKeyword, setNewKeyword] = useState("");
  const [keywordData, setKeywordData] = useState({
    primaryKeyword: "",
    parentLSIs: [],
    childLSIs: [],
    longTailVariations: [],
    naturalLSIs: [],
  });

  // Parse the structured data on mount
  useEffect(() => {
    // Handle both data.extracted.parsedContent and direct data array
    const contentArray = data?.extracted?.parsedContent || data;

    if (contentArray && Array.isArray(contentArray)) {
      const parseStructuredData = (content) => {
        const sections = {
          primaryKeyword: "",
          parentLSIs: [],
          childLSIs: [],
          longTailVariations: [],
          naturalLSIs: [],
        };

        content.forEach((item) => {
          if (item.type === "heading" && item.depth === 1) {
            // Extract primary keyword
            const match = item.content.match(/Primary Keyword:\s*(.+)/i);
            if (match) {
              sections.primaryKeyword = match[1].trim();
            }
          } else if (
            item.type === "heading" &&
            item.depth === 2 &&
            item.children
          ) {
            // Map section names to our data structure
            const sectionMap = {
              "Parent LSIs": "parentLSIs",
              "Child LSIs": "childLSIs",
              "Long-Tail Variations": "longTailVariations",
              "Natural LSIs": "naturalLSIs",
            };

            const sectionKey = sectionMap[item.content];
            if (sectionKey) {
              sections[sectionKey] = item.children
                .filter((child) => child.type === "listItem - text - paragraph")
                .map((child) => child.content);
            }
          }
        });

        return sections;
      };

      setKeywordData(parseStructuredData(contentArray));
    }
  }, [data]);

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const updateKeyword = (section, index, value) => {
    const newData = { ...keywordData };
    if (section === "primaryKeyword") {
      newData.primaryKeyword = value;
    } else {
      newData[section][index] = value;
    }
    setKeywordData(newData);
    setEditingItem(null);
  };

  const addKeyword = (section) => {
    if (newKeyword.trim()) {
      const newData = { ...keywordData };
      newData[section].push(newKeyword.trim());
      setKeywordData(newData);
      setNewKeyword("");
    }
  };

  const removeKeyword = (section, index) => {
    const newData = { ...keywordData };
    newData[section].splice(index, 1);
    setKeywordData(newData);
  };

  // Section icons mapping for better visual cues
  const sectionIcons = {
    parentLSIs: <Users size={18} />,
    childLSIs: <Search size={18} />,
    longTailVariations: <TrendingUp size={18} />,
    naturalLSIs: <Brain size={18} />,
  };

  const sectionLabels = {
    parentLSIs: "Parent LSIs",
    childLSIs: "Child LSIs",
    longTailVariations: "Long-Tail Variations",
    naturalLSIs: "Natural LSIs",
  } as const;

  type KeywordSection = keyof typeof sectionLabels;
  const keywordSections: KeywordSection[] = [
    "parentLSIs",
    "childLSIs",
    "longTailVariations",
    "naturalLSIs",
  ];

  const sectionDescriptions = {
    parentLSIs: "Broader category keywords",
    childLSIs: "Related specific terms",
    longTailVariations: "Specific search phrases",
    naturalLSIs: "Semantic variations",
  };

  return (
    <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
      {/* Modern Gradient Header */}
      <div className="px-8 py-10 bg-gradient-to-r from-blue-500/90 via-purple-500/90 to-indigo-500/90 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Target size={24} />
            <div>
              <h1 className="text-3xl font-bold">Primary Target Keyword</h1>
              {editingItem === "primary" ? (
                <input
                  type="text"
                  value={keywordData.primaryKeyword}
                  onChange={(e) =>
                    updateKeyword("primaryKeyword", null, e.target.value)
                  }
                  onBlur={() => setEditingItem(null)}
                  onKeyPress={(e) => e.key === "Enter" && setEditingItem(null)}
                  className="mt-3 text-xl font-light bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg px-3 py-2 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50"
                  autoFocus
                />
              ) : (
                <p className="mt-3 text-xl font-light opacity-90">
                  {keywordData.primaryKeyword || "No primary keyword available"}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() =>
              setEditingItem(editingItem === "primary" ? null : "primary")
            }
            className="p-3 bg-white/20 backdrop-blur-sm rounded-lg hover:bg-white/30 transition-all"
          >
            <Edit3 size={20} />
          </button>
        </div>
      </div>

      {/* Content Container */}
      <div className="p-6 md:p-8 space-y-6">
        {/* Keyword Categories Section */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
              <Brain size={20} className="text-blue-500" />
              Keyword Intelligence Analysis
            </h2>
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-700 dark:text-blue-300 font-medium transition-colors duration-200"
            >
              <Edit3 size={16} />
              {isEditing ? "Done Editing" : "Edit Keywords"}
            </button>
          </div>
        </div>

        {/* Keyword Sections - Single column for better expanded view */}
        <div className="space-y-4">
          {keywordSections.map((section) => {
            const sectionData = keywordData[section];
            const hasData =
              sectionData &&
              Array.isArray(sectionData) &&
              sectionData.length > 0;

            return (
              <div key={section} className="space-y-3">
                <div
                  onClick={() => toggleSection(section)}
                  className={`flex justify-between items-center cursor-pointer p-4 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 ${
                    expandedSection === section
                      ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30"
                      : "bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        expandedSection === section
                          ? "text-blue-500"
                          : "text-slate-500 dark:text-slate-400"
                      }
                    >
                      {sectionIcons[section]}
                    </span>
                    <div>
                      <h2 className="text-lg font-medium text-slate-900 dark:text-white">
                        {sectionLabels[section]}
                      </h2>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {sectionDescriptions[section]} • {sectionData.length}{" "}
                        keywords
                      </p>
                    </div>
                  </div>
                  <span
                    className={
                      expandedSection === section
                        ? "text-blue-500"
                        : "text-slate-500 dark:text-slate-400"
                    }
                  >
                    {expandedSection === section ? (
                      <Minus size={18} strokeWidth={2.5} />
                    ) : (
                      <Plus size={18} strokeWidth={2.5} />
                    )}
                  </span>
                </div>

                {expandedSection === section && (
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 animate-fadeIn">
                    {hasData ? (
                      <div className="space-y-3">
                        {sectionData.map((keyword, index) => (
                          <div key={index} className="group relative">
                            {editingItem === `${section}-${index}` ? (
                              <input
                                type="text"
                                value={keyword}
                                onChange={(e) =>
                                  updateKeyword(section, index, e.target.value)
                                }
                                onBlur={() => setEditingItem(null)}
                                onKeyPress={(e) =>
                                  e.key === "Enter" && setEditingItem(null)
                                }
                                className="w-full px-4 py-3 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-slate-900 dark:text-slate-100"
                                autoFocus
                              />
                            ) : (
                              <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg border border-slate-100 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500 transition-all duration-200">
                                <div className="flex items-start gap-3">
                                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 dark:bg-blue-500 mt-2"></span>
                                  <span className="text-slate-700 dark:text-slate-300 font-medium">
                                    {keyword}
                                  </span>
                                </div>
                                {isEditing && (
                                  <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() =>
                                        setEditingItem(`${section}-${index}`)
                                      }
                                      className="p-1.5 rounded-md hover:bg-white dark:hover:bg-slate-600 transition-all"
                                    >
                                      <Edit3 className="h-3 w-3 text-slate-600 dark:text-slate-400" />
                                    </button>
                                    <button
                                      onClick={() =>
                                        removeKeyword(section, index)
                                      }
                                      className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                    >
                                      <X className="h-3 w-3 text-red-600 dark:text-red-400" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}

                        {isEditing && (
                          <div className="flex items-center space-x-3 mt-4 pt-3 border-t border-slate-200 dark:border-slate-600">
                            <input
                              type="text"
                              value={newKeyword}
                              onChange={(e) => setNewKeyword(e.target.value)}
                              onKeyPress={(e) =>
                                e.key === "Enter" && addKeyword(section)
                              }
                              placeholder="Add new keyword..."
                              className="flex-1 px-4 py-3 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
                            />
                            <button
                              onClick={() => addKeyword(section)}
                              className="p-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors flex items-center gap-2"
                            >
                              <Plus size={16} />
                              Add
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-slate-500 dark:text-slate-400">
                        No {sectionLabels[section].toLowerCase()} available
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Stats Summary */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-6 border border-slate-100 dark:border-slate-700">
          <h3 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">
            Keyword Analysis Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                1
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Primary Keyword
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {keywordData.parentLSIs.length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Parent LSIs
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {keywordData.childLSIs.length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Child LSIs
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                {keywordData.longTailVariations.length +
                  keywordData.naturalLSIs.length}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-400">
                Total Variations
              </div>
            </div>
          </div>
        </div>

        {/* Feedback Section */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          {!showFeedback ? (
            <button
              onClick={() => setShowFeedback(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-700 dark:text-blue-300 font-medium transition-colors duration-200"
            >
              <MessageSquare size={18} />
              Add Feedback
            </button>
          ) : (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <MessageSquare size={18} className="text-blue-500" />
                  Keyword Analysis Feedback
                </h3>
                <button
                  onClick={() => setShowFeedback(false)}
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                >
                  <Minus size={18} />
                </button>
              </div>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Enter your feedback about this keyword analysis..."
                className="w-full h-32 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800/50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all duration-200"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    // Here you would typically save the feedback
                    alert("Feedback saved!");
                    setFeedbackText("");
                  }}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors duration-200"
                >
                  Submit Feedback
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modern Footer */}
      <div className="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 text-center text-slate-600 dark:text-slate-400 text-sm border-t border-slate-200 dark:border-slate-700">
        <p>
          Keyword Analysis • Last Updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};

interface ModernKeywordAnalyzerProps {
  data: any;
  isLoading?: boolean;
}

export default function ModernKeywordAnalyzerView({
  data,
  isLoading = false,
}: ModernKeywordAnalyzerProps) {
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
    return (
      <FlexibleLoadingComponent
        baseColor="blue"
        accentColor="purple"
        title="Keyword Analysis"
        subtitle="Processing semantic keyword intelligence"
        stages={[
          "Extracting primary keywords...",
          "Analyzing LSI relationships...",
          "Processing long-tail variations...",
          "Generating semantic analysis...",
        ]}
        placeholderItems={4}
        size="large"
      />
    );
  }

  try {
    if (!data || hasError) {
      return (
        <DefaultErrorFallback
          title="Keyword Analysis Error"
          message="There was an error displaying the keyword analysis."
        />
      );
    }

    return <ModernKeywordAnalyzerDisplay data={data} />;
  } catch (error) {
    console.error("Error rendering ModernKeywordAnalyzerDisplay:", error);
    setHasError(true);
    return (
      <DefaultErrorFallback
        title="Keyword Analysis Error"
        message="There was an error displaying the keyword analysis."
      />
    );
  }
}
