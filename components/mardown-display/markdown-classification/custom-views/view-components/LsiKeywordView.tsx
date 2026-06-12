import { useState, useEffect, type CSSProperties } from "react";
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
  GripVertical,
} from "lucide-react";
import { DragDropContext, Droppable, Draggable } from "@hello-pangea/dnd";
import FlexibleLoadingComponent from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultLoadingComponent";
import { useIsMobile } from "@/hooks/use-mobile";
import DefaultErrorFallback from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback";
import { PiMagicWandFill } from "react-icons/pi";

const KeywordHierarchyDisplay = ({ data }) => {
  const extracted = data?.extracted || {};
  const [expandedSection, setExpandedSection] = useState("all"); // All sections open by default
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [editingItem, setEditingItem] = useState(null);
  const [newKeywords, setNewKeywords] = useState({}); // Track new keywords for each section
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

  // Initialize new keywords tracking
  useEffect(() => {
    setNewKeywords({
      naturalLSIs: "",
      parentLSIs: "",
      childLSIs: "",
      longTailVariations: "",
    });
  }, []);

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
    const keyword = newKeywords[section];
    if (keyword?.trim()) {
      const newData = { ...keywordData };
      newData[section].push(keyword.trim());
      setKeywordData(newData);
      setNewKeywords((prev) => ({ ...prev, [section]: "" }));
    }
  };

  const removeKeyword = (section, index) => {
    const newData = { ...keywordData };
    newData[section].splice(index, 1);
    setKeywordData(newData);
  };

  const handleDragEnd = (result) => {
    const { destination, source, draggableId } = result;

    // If no destination, do nothing
    if (!destination) return;

    // If dropped in the same position, do nothing
    if (
      destination.droppableId === source.droppableId &&
      destination.index === source.index
    ) {
      return;
    }

    const sourceSection = source.droppableId;
    const destinationSection = destination.droppableId;

    // Get the keyword being moved
    const keyword = keywordData[sourceSection][source.index];

    const newData = { ...keywordData };

    // Remove from source
    newData[sourceSection].splice(source.index, 1);

    // Add to destination
    newData[destinationSection].splice(destination.index, 0, keyword);

    setKeywordData(newData);
  };

  const handleNewKeywordChange = (section, value) => {
    setNewKeywords((prev) => ({ ...prev, [section]: value }));
  };

  // Section icons mapping for better visual cues
  const sectionIcons = {
    naturalLSIs: <Brain size={16} />,
    parentLSIs: <Users size={16} />,
    childLSIs: <Search size={16} />,
    longTailVariations: <TrendingUp size={16} />,
  };

  const sectionLabels = {
    naturalLSIs: "Natural LSIs",
    parentLSIs: "Parent LSIs",
    childLSIs: "Child LSIs",
    longTailVariations: "Long-Tail Variations",
  };

  const sectionDescriptions = {
    naturalLSIs: "Semantic variations",
    parentLSIs: "Broader category keywords",
    childLSIs: "Related specific terms",
    longTailVariations: "Specific search phrases",
  };

  // Reorder sections to put naturalLSIs first
  const sectionOrder = [
    "naturalLSIs",
    "parentLSIs",
    "childLSIs",
    "longTailVariations",
  ];

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
        {/* Reduced Header */}
        <div className="px-6 py-2 bg-gradient-to-r from-blue-500/90 via-purple-500/90 to-indigo-500/90 text-white">
          <div className="flex items-center gap-3">
            <PiMagicWandFill size={32} />
            <div>
              <p
                className="mt-2 text-2xl font-bold cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setEditingItem("primary")}
              >
                Primary Keyword:{" "}
                {keywordData.primaryKeyword || "No primary keyword available"}
              </p>
            </div>
          </div>
        </div>
        {/* Compact Stats Summary */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                1
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Primary
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                {keywordData.naturalLSIs.length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Natural
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                {keywordData.parentLSIs.length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Parent
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                {keywordData.childLSIs.length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Child
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                {keywordData.longTailVariations.length}
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Long-tail
              </div>
            </div>
          </div>
        </div>

        {/* Content Container with reduced padding */}
        <div className="p-2 space-y-3">
          {/* Keyword Sections - All open by default */}
          <div className="space-y-4">
            {sectionOrder.map((section) => {
              const sectionData = keywordData[section];
              const hasData =
                sectionData &&
                Array.isArray(sectionData) &&
                sectionData.length > 0;

              return (
                <div
                  key={section}
                  className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700"
                >
                  {/* Compact Section Header */}
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500 dark:text-slate-400">
                        {sectionIcons[section]}
                      </span>
                      <div>
                        <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                          {sectionLabels[section]} ({sectionData.length})
                        </h3>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Add keyword inline */}
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={newKeywords[section] || ""}
                          onChange={(e) =>
                            handleNewKeywordChange(section, e.target.value)
                          }
                          onKeyDown={(e) =>
                            e.key === "Enter" && addKeyword(section)
                          }
                          placeholder="Add New Keyword..."
                          className="w-96 px-4 py-1 text-xs bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-slate-100 placeholder-slate-400"
                        />
                        <button
                          onClick={() => addKeyword(section)}
                          className="p-1 bg-blue-500 hover:bg-blue-600 text-white rounded transition-colors"
                        >
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Keywords List - Always visible with drag and drop */}
                  <div className="pl-0 space-y-2">
                    {hasData ? (
                      <Droppable droppableId={section}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`space-y-2 min-h-[40px] p-2 rounded-lg transition-colors ${
                              snapshot.isDraggingOver
                                ? "bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-200 dark:border-blue-600"
                                : "bg-transparent"
                            }`}
                          >
                            {sectionData.map((keyword, index) => (
                              <Draggable
                                key={`${section}-${index}`}
                                draggableId={`${section}-${index}`}
                                index={index}
                              >
                                {(provided, snapshot) => {
                                  const { style, ...draggableProps } =
                                    provided.draggableProps;
                                  return (
                                    <div
                                      ref={provided.innerRef}
                                      {...draggableProps}
                                      style={style as CSSProperties | undefined}
                                      className={`group transition-transform ${
                                        snapshot.isDragging
                                          ? "rotate-2 scale-105"
                                          : ""
                                      }`}
                                    >
                                      {editingItem === `${section}-${index}` ? (
                                        <input
                                          type="text"
                                          value={keyword}
                                          onChange={(e) =>
                                            updateKeyword(
                                              section,
                                              index,
                                              e.target.value,
                                            )
                                          }
                                          onBlur={() => setEditingItem(null)}
                                          onKeyDown={(e) =>
                                            e.key === "Enter" &&
                                            setEditingItem(null)
                                          }
                                          className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-900 dark:text-slate-100"
                                          autoFocus
                                        />
                                      ) : (
                                        <div
                                          className={`flex items-center justify-between w-full p-2 rounded border transition-all ${
                                            snapshot.isDragging
                                              ? "bg-white dark:bg-slate-700 border-blue-300 dark:border-blue-600 shadow-lg"
                                              : "bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600 hover:border-slate-300 dark:hover:border-slate-500"
                                          }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <div
                                              {...provided.dragHandleProps}
                                              className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                                            >
                                              <GripVertical
                                                size={14}
                                                className="text-slate-400 dark:text-slate-500"
                                              />
                                            </div>
                                            <span className="w-1 h-1 rounded-full bg-blue-400 dark:bg-blue-500"></span>
                                            <span className="text-sm text-slate-700 dark:text-slate-300">
                                              {keyword}
                                            </span>
                                          </div>
                                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                              onClick={() =>
                                                setEditingItem(
                                                  `${section}-${index}`,
                                                )
                                              }
                                              className="p-1 rounded hover:bg-white dark:hover:bg-slate-600 transition-all"
                                            >
                                              <Edit3
                                                size={12}
                                                className="text-slate-500 dark:text-slate-400"
                                              />
                                            </button>
                                            <button
                                              onClick={() =>
                                                removeKeyword(section, index)
                                              }
                                              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                                            >
                                              <X
                                                size={12}
                                                className="text-red-500 dark:text-red-400"
                                              />
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                }}
                              </Draggable>
                            ))}
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    ) : (
                      <Droppable droppableId={section}>
                        {(provided, snapshot) => (
                          <div
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`min-h-[40px] p-4 rounded-lg border-2 border-dashed transition-colors ${
                              snapshot.isDraggingOver
                                ? "border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                                : "border-slate-200 dark:border-slate-600"
                            }`}
                          >
                            <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
                              No {sectionLabels[section].toLowerCase()}{" "}
                              available - drag keywords here
                            </p>
                            {provided.placeholder}
                          </div>
                        )}
                      </Droppable>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Feedback Section */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            {!showFeedback ? (
              <button
                onClick={() => setShowFeedback(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-100 hover:bg-blue-200 dark:bg-blue-900/30 dark:hover:bg-blue-800/40 text-blue-700 dark:text-blue-300 text-sm font-medium transition-colors"
              >
                <MessageSquare size={16} />
                Add Feedback
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium flex items-center gap-2">
                    <MessageSquare size={16} className="text-blue-500" />
                    Feedback
                  </h3>
                  <button
                    onClick={() => setShowFeedback(false)}
                    className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  >
                    <X size={16} />
                  </button>
                </div>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Enter your feedback about this keyword analysis..."
                  className="w-full h-24 p-3 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800/50 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      // Here you would typically save the feedback
                      alert("Feedback saved!");
                      setFeedbackText("");
                    }}
                    className="px-4 py-2 text-sm rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
                  >
                    Submit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DragDropContext>
  );
};

interface KeywordHierarchyProps {
  data: any;
  isLoading?: boolean;
}

export default function KeywordHierarchyView({
  data,
  isLoading = false,
}: KeywordHierarchyProps) {
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
      <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
        {/* Header */}
        <div className="px-6 py-2 bg-gradient-to-r from-blue-500/90 via-purple-500/90 to-indigo-500/90 text-white">
          <div className="flex items-center gap-3">
            <PiMagicWandFill size={32} />
            <div>
              <p className="mt-2 text-2xl font-bold">
                Primary Keyword:{" "}
                <span className="animate-pulse bg-white/20 rounded px-2 py-1 inline-block w-48 h-8"></span>
              </p>
            </div>
          </div>
        </div>

        {/* Stats Summary */}
        <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-blue-200 dark:border-blue-700 border-t-blue-600 dark:border-t-blue-400 mx-auto"></div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Primary
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                <div
                  className="animate-spin rounded-full h-8 w-8 border-2 border-purple-200 dark:border-purple-700 border-t-purple-600 dark:border-t-purple-400 mx-auto"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Natural
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-green-600 dark:text-green-400">
                <div
                  className="animate-spin rounded-full h-8 w-8 border-2 border-green-200 dark:border-green-700 border-t-green-600 dark:border-t-green-400 mx-auto"
                  style={{ animationDelay: "0.4s" }}
                ></div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Parent
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">
                <div
                  className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-200 dark:border-indigo-700 border-t-indigo-600 dark:border-t-indigo-400 mx-auto"
                  style={{ animationDelay: "0.6s" }}
                ></div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Child
              </div>
            </div>
            <div>
              <div className="text-xl font-bold text-orange-600 dark:text-orange-400">
                <div
                  className="animate-spin rounded-full h-8 w-8 border-2 border-orange-200 dark:border-orange-700 border-t-orange-600 dark:border-t-orange-400 mx-auto"
                  style={{ animationDelay: "0.8s" }}
                ></div>
              </div>
              <div className="text-xs text-slate-600 dark:text-slate-400">
                Long-tail
              </div>
            </div>
          </div>
        </div>

        {/* Content Container */}
        <div className="p-2 space-y-3">
          {/* Keyword Sections Loading */}
          <div className="space-y-4">
            {[
              {
                key: "naturalLSIs",
                label: "Natural LSIs",
                icon: <Brain size={16} />,
                description: "Semantic variations",
              },
              {
                key: "parentLSIs",
                label: "Parent LSIs",
                icon: <Users size={16} />,
                description: "Broader category keywords",
              },
              {
                key: "childLSIs",
                label: "Child LSIs",
                icon: <Search size={16} />,
                description: "Related specific terms",
              },
              {
                key: "longTailVariations",
                label: "Long-Tail Variations",
                icon: <TrendingUp size={16} />,
                description: "Specific search phrases",
              },
            ].map((section) => (
              <div
                key={section.key}
                className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700"
              >
                {/* Section Header */}
                <div className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500 dark:text-slate-400">
                      {section.icon}
                    </span>
                    <div>
                      <h3 className="text-sm font-medium text-slate-900 dark:text-white">
                        {section.label}{" "}
                        <span
                          className="animate-pulse bg-slate-200 dark:bg-slate-700 rounded px-2 py-1 inline-block w-8 h-4 ml-1"
                          style={{ animationDelay: "0.3s" }}
                        ></span>
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {section.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="animate-pulse bg-slate-200 dark:bg-slate-700 rounded w-96 h-8"
                      style={{ animationDelay: "0.1s" }}
                    ></div>
                    <div
                      className="animate-spin rounded-full h-8 w-8 border-2 border-blue-200 dark:border-blue-700 border-t-blue-600 dark:border-t-blue-400"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                  </div>
                </div>

                {/* Loading Placeholder Keywords */}
                <div className="pl-0 space-y-2">
                  <div className="space-y-2 min-h-[40px] p-2 rounded-lg">
                    {[...Array(3)].map((_, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between w-full p-2 rounded border bg-slate-50 dark:bg-slate-700 border-slate-100 dark:border-slate-600 animate-pulse"
                        style={{ animationDelay: `${index * 0.1}s` }}
                      >
                        <div className="flex items-center gap-2">
                          <div className="p-1 rounded">
                            <GripVertical
                              size={14}
                              className="text-slate-400 dark:text-slate-500"
                            />
                          </div>
                          <span className="w-1 h-1 rounded-full bg-blue-400 dark:bg-blue-500 animate-pulse"></span>
                          <div
                            className="bg-slate-200 dark:bg-slate-600 rounded h-4 animate-pulse"
                            style={{ width: `${80 + index * 20}px` }}
                          ></div>
                        </div>
                        <div className="flex items-center gap-1">
                          <div
                            className="bg-slate-200 dark:bg-slate-600 rounded w-6 h-6 animate-pulse"
                            style={{ animationDelay: `${index * 0.15}s` }}
                          ></div>
                          <div
                            className="bg-slate-200 dark:bg-slate-600 rounded w-6 h-6 animate-pulse"
                            style={{ animationDelay: `${index * 0.2}s` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Loading Status */}
          <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-center gap-2 p-4">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Processing semantic keyword intelligence...
              </span>
            </div>
          </div>
        </div>
      </div>
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

    return <KeywordHierarchyDisplay data={data} />;
  } catch (error) {
    console.error("Error rendering KeywordHierarchyDisplay:", error);
    setHasError(true);
    return (
      <DefaultErrorFallback
        title="Keyword Analysis Error"
        message="There was an error displaying the keyword analysis."
      />
    );
  }
}
