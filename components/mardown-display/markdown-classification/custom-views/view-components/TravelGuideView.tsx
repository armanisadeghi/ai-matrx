import React, { useState, useEffect } from "react";
import {
  Compass,
  ChevronDown,
  ChevronRight,
  Map,
  Calendar,
  Luggage,
  Smartphone,
  Globe,
  Shield,
  Sun,
  Moon,
  BookOpen,
  X,
  Check,
  Loader2,
  MapPin,
  Plane,
  Train,
  Coffee,
  Utensils,
  Hotel,
  Camera,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import DefaultErrorFallback from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback";

// Type definitions
interface ListItem {
  id: string;
  text: string;
  subItems?: ListItem[];
}

interface Section {
  id: string;
  title: string;
  type: "heading" | "list" | "table" | "paragraph";
  depth?: number;
  content: string | ListItem[] | { headers: string[]; rows: string[][] };
}

interface TravelGuideProps {
  data: {
    sections: Section[];
    hasNestedLists: boolean;
  };
  darkMode?: boolean;
  toggleDarkMode?: () => void;
}

interface TravelGuideViewProps extends TravelGuideProps {
  isLoading?: boolean;
}

// Helper function to convert markdown-style formatting to HTML
const formatText = (text: string) => {
  // Bold text
  let formattedText = text.replace(
    /\*\*(.*?)\*\*/g,
    '<span class="font-bold">$1</span>',
  );

  // Italic text
  formattedText = formattedText.replace(
    /\*(.*?)\*/g,
    '<span class="italic">$1</span>',
  );

  return formattedText;
};

// Icon mapping for different section titles
const getIconForTitle = (title: string) => {
  const titleLower = title.toLowerCase();

  if (titleLower.includes("itinerary")) return <Compass className="w-5 h-5" />;
  if (titleLower.includes("eurail") || titleLower.includes("train"))
    return <Train className="w-5 h-5" />;
  if (titleLower.includes("pack")) return <Luggage className="w-5 h-5" />;
  if (titleLower.includes("app")) return <Smartphone className="w-5 h-5" />;
  if (titleLower.includes("local") || titleLower.includes("tips"))
    return <MapPin className="w-5 h-5" />;
  if (titleLower.includes("border") || titleLower.includes("safety"))
    return <Shield className="w-5 h-5" />;
  if (titleLower.includes("food") || titleLower.includes("restaurant"))
    return <Utensils className="w-5 h-5" />;
  if (titleLower.includes("hotel") || titleLower.includes("stay"))
    return <Hotel className="w-5 h-5" />;

  // Default icon
  return <BookOpen className="w-5 h-5" />;
};

// Component for rendering a collapsible section
const CollapsibleSection = ({ title, children, icon, depth = 2 }) => {
  const [isOpen, setIsOpen] = useState(true);

  const toggleSection = () => {
    setIsOpen(!isOpen);
  };

  const headingClasses = {
    2: "text-2xl font-bold",
    3: "text-xl font-semibold",
    4: "text-lg font-semibold",
  };

  return (
    <div className="mb-6">
      <button
        onClick={toggleSection}
        className={`flex items-center w-full text-left ${depth <= 2 ? "bg-gradient-to-r from-blue-500/10 to-indigo-500/10 dark:from-blue-900/30 dark:to-indigo-900/30 p-3 rounded-lg" : "py-2"}`}
      >
        {depth <= 2 && (
          <div className="mr-3 p-2 bg-blue-500 dark:bg-blue-600 rounded-full text-white">
            {icon}
          </div>
        )}
        <h2 className={`${headingClasses[depth] || headingClasses[2]} flex-1`}>
          {title}
        </h2>
        {isOpen ? (
          <ChevronDown className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        ) : (
          <ChevronRight className="w-5 h-5 text-blue-500 dark:text-blue-400" />
        )}
      </button>

      {isOpen && (
        <div className={`mt-3 ${depth <= 2 ? "pl-4" : "pl-2"}`}>{children}</div>
      )}
    </div>
  );
};

// Component for rendering a list item with potential sub-items
const ListItemComponent = ({ item }: { item: ListItem }) => {
  const [isOpen, setIsOpen] = useState(true);

  const subItems = item.subItems;
  const hasSubItems = subItems !== undefined && subItems.length > 0;

  return (
    <li className="mb-2">
      <div className="flex items-start">
        <div className="min-w-6 mt-1 mr-2">
          {hasSubItems ? (
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {isOpen ? (
                <ChevronDown className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-blue-500 dark:text-blue-400" />
              )}
            </button>
          ) : (
            <div className="w-4 h-4 rounded-full border-2 border-blue-500 dark:border-blue-400 mt-1"></div>
          )}
        </div>
        <div className="flex-1">
          <div
            dangerouslySetInnerHTML={{ __html: formatText(item.text) }}
            className="text-gray-800 dark:text-gray-200"
          />

          {hasSubItems && isOpen && (
            <ul className="pl-4 mt-2 space-y-1 border-l-2 border-gray-200 dark:border-gray-700">
              {subItems.map((subItem) => (
                <li key={subItem.id} className="relative pl-4">
                  <div className="absolute left-0 top-2 w-3 h-0.5 bg-gray-300 dark:bg-gray-600"></div>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: formatText(subItem.text),
                    }}
                    className="text-gray-700 dark:text-gray-300"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
};

// Component for rendering a table
const TableComponent = ({
  data,
}: {
  data: { headers: string[]; rows: string[][] };
}) => {
  return (
    <div className="overflow-x-auto rounded-lg border-border mb-6">
      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
        <thead className="bg-gray-50 dark:bg-gray-800">
          <tr>
            {data.headers.map((header, index) => (
              <th
                key={index}
                scope="col"
                className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
              >
                <div dangerouslySetInnerHTML={{ __html: formatText(header) }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-textured divide-y divide-gray-200 dark:divide-gray-800">
          {data.rows.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={
                rowIndex % 2 === 0
                  ? "bg-textured"
                  : "bg-gray-50 dark:bg-gray-800/50"
              }
            >
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 dark:text-gray-200"
                >
                  <div dangerouslySetInnerHTML={{ __html: formatText(cell) }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Main component
const TravelGuide: React.FC<TravelGuideProps> = ({
  data,
  darkMode = false,
  toggleDarkMode,
}) => {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [showTableOfContents, setShowTableOfContents] = useState(true);

  // Get all heading sections for the table of contents
  const headingSections = data.sections.filter(
    (section) =>
      section.type === "heading" && section.depth && section.depth <= 2,
  );

  // Function to scroll to a section
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
      setActiveSection(id);
    }
  };

  // Update active section based on scroll position
  useEffect(() => {
    const handleScroll = () => {
      const headingElements = headingSections
        .map((section) => document.getElementById(section.id))
        .filter(Boolean);

      for (let i = headingElements.length - 1; i >= 0; i--) {
        const element = headingElements[i];
        if (element) {
          const rect = element.getBoundingClientRect();
          if (rect.top <= 100) {
            setActiveSection(element.id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [headingSections]);

  // Render different section types
  const renderSection = (section: Section) => {
    switch (section.type) {
      case "heading":
        if (!section.depth) return null;

        // Only render CollapsibleSection for depth 2 and 3
        if (section.depth <= 3) {
          const icon = getIconForTitle(section.title);
          return (
            <div id={section.id} key={section.id}>
              <CollapsibleSection
                title={section.title}
                icon={icon}
                depth={section.depth}
              >
                {/* Find all sections that should be nested under this heading */}
                {data.sections
                  .filter((s) => {
                    // Find the index of the current section
                    const currentIndex = data.sections.findIndex(
                      (sec) => sec.id === section.id,
                    );
                    // Find the index of the next heading with the same or lower depth
                    const nextHeadingIndex = data.sections.findIndex(
                      (sec, idx) =>
                        idx > currentIndex &&
                        sec.type === "heading" &&
                        sec.depth &&
                        sec.depth <= (section.depth || 0),
                    );

                    // If there's no next heading, include all remaining sections
                    if (nextHeadingIndex === -1) {
                      return currentIndex < data.sections.indexOf(s);
                    }

                    // Otherwise, include only sections between current and next heading
                    return (
                      currentIndex < data.sections.indexOf(s) &&
                      data.sections.indexOf(s) < nextHeadingIndex
                    );
                  })
                  .map(renderSection)}
              </CollapsibleSection>
            </div>
          );
        } else {
          // For deeper headings, just render the title
          return (
            <div id={section.id} key={section.id} className="mb-4">
              <h3 className="text-lg font-semibold">{section.title}</h3>
            </div>
          );
        }

      case "paragraph":
        if (typeof section.content === "string") {
          return (
            <div
              key={section.id}
              className="mb-6 text-gray-800 dark:text-gray-200 leading-relaxed"
              dangerouslySetInnerHTML={{ __html: formatText(section.content) }}
            />
          );
        }
        return null;

      case "list":
        if (Array.isArray(section.content)) {
          return (
            <div key={section.id} className="mb-6">
              {section.title && (
                <h3 className="text-lg font-semibold mb-3">{section.title}</h3>
              )}
              <ul className="space-y-3">
                {section.content.map((item) => (
                  <ListItemComponent key={item.id} item={item} />
                ))}
              </ul>
            </div>
          );
        }
        return null;

      case "table":
        if (
          typeof section.content === "object" &&
          "headers" in section.content
        ) {
          return (
            <div key={section.id}>
              {section.title && (
                <h3 className="text-lg font-semibold mb-3">{section.title}</h3>
              )}
              <TableComponent data={section.content} />
            </div>
          );
        }
        return null;

      default:
        return null;
    }
  };

  return (
    <div className={`${darkMode ? "dark" : ""}`}>
      <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        {/* Header */}
        <header className="sticky top-0 z-10 bg-textured shadow-md">
          <div className="container mx-auto px-4 py-4 flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <Compass className="h-8 w-8 text-blue-500 dark:text-blue-400" />
              <h1 className="text-xl font-bold text-gray-800 dark:text-white">
                Travel Guide
              </h1>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowTableOfContents(!showTableOfContents)}
                className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                aria-label="Toggle table of contents"
              >
                <BookOpen className="h-5 w-5 text-gray-600 dark:text-gray-300" />
              </button>

              {toggleDarkMode && (
                <button
                  onClick={toggleDarkMode}
                  className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                  aria-label="Toggle dark mode"
                >
                  {darkMode ? (
                    <Sun className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                  ) : (
                    <Moon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                  )}
                </button>
              )}
            </div>
          </div>
        </header>

        <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row">
          {/* Table of Contents - Sidebar */}
          {showTableOfContents && (
            <aside className="md:w-64 lg:w-72 flex-shrink-0 mb-8 md:mb-0 md:sticky md:top-24 md:h-[calc(100dvh-6rem)] md:overflow-y-auto">
              <div className="bg-textured rounded-lg shadow-md p-4">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                    Contents
                  </h2>
                  <button
                    onClick={() => setShowTableOfContents(false)}
                    className="md:hidden p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <X className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  </button>
                </div>

                <nav>
                  <ul className="space-y-2">
                    {headingSections.map((section) => (
                      <li key={section.id}>
                        <button
                          onClick={() => scrollToSection(section.id)}
                          className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                            activeSection === section.id
                              ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium"
                              : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                          }`}
                        >
                          <div className="flex items-center">
                            {getIconForTitle(section.title)}
                            <span className="ml-2">{section.title}</span>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                </nav>
              </div>
            </aside>
          )}

          {/* Main Content */}
          <main className={`flex-1 ${showTableOfContents ? "md:ml-8" : ""}`}>
            <div className="bg-textured rounded-lg shadow-md p-6 md:p-8">
              {/* Hero section with the first paragraph */}
              {data.sections[0] && data.sections[0].type === "paragraph" && (
                <div className="mb-8 pb-8 border-b border-border">
                  <div
                    className="text-lg text-gray-800 dark:text-gray-200 leading-relaxed"
                    dangerouslySetInnerHTML={{
                      __html: formatText(data.sections[0].content as string),
                    }}
                  />
                </div>
              )}

              {/* Render all sections except the first paragraph */}
              {data.sections.slice(1).map((section) => {
                // Skip rendering headings with depth 2 or 3 here as they're handled by CollapsibleSection
                if (
                  section.type === "heading" &&
                  section.depth &&
                  section.depth <= 3
                ) {
                  return renderSection(section);
                }

                // For other sections, render them directly
                return renderSection(section);
              })}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
};

// Loading Component
export const TravelGuideLoading = () => {
  const [loadingProgress, setLoadingProgress] = useState(0);

  // Simulate loading progress
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingProgress((prev) => {
        const newProgress = prev + Math.random() * 8;
        return newProgress > 100 ? 100 : newProgress;
      });
    }, 300);

    return () => clearInterval(interval);
  }, []);

  // Generate placeholder headings and sections
  const placeholderHeadings = [
    "Suggested Itinerary",
    "Travel Tips",
    "Packing List",
    "Local Tips",
    "Safety Information",
  ];

  return (
    <div className="min-h-dvh bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
      {/* Loading Header */}
      <header className="sticky top-0 z-10 bg-textured shadow-md">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Compass className="h-8 w-8 text-blue-500 dark:text-blue-400 animate-pulse" />
            <div className="h-7 w-32 bg-gray-200 dark:bg-gray-700 rounded loading-shine"></div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-700">
              <BookOpen className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
            <div className="p-2 rounded-full bg-gray-100 dark:bg-gray-700">
              <Moon className="h-5 w-5 text-gray-400 dark:text-gray-500" />
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row">
        {/* Table of Contents Skeleton */}
        <aside className="md:w-64 lg:w-72 flex-shrink-0 mb-8 md:mb-0 md:sticky md:top-24 md:h-[calc(100dvh-6rem)] md:overflow-y-auto">
          <div className="bg-textured rounded-lg shadow-md p-4">
            <div className="flex justify-between items-center mb-4">
              <div className="h-6 w-24 bg-gray-200 dark:bg-gray-700 rounded loading-shine"></div>
            </div>

            <nav>
              <ul className="space-y-3">
                {placeholderHeadings.map((_, index) => (
                  <li
                    key={index}
                    className="animate-pulse-subtle"
                    style={{ animationDelay: `${index * 150}ms` }}
                  >
                    <div className="flex items-center p-2 bg-gray-100 dark:bg-gray-700/50 rounded">
                      <div className="w-4 h-4 mr-2 bg-blue-200 dark:bg-blue-900 rounded-full"></div>
                      <div className="h-5 w-32 bg-gray-200 dark:bg-gray-700 rounded loading-shine"></div>
                    </div>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </aside>

        {/* Main Content Skeleton */}
        <main className="flex-1 md:ml-8">
          <div className="bg-textured rounded-lg shadow-md p-6 md:p-8">
            {/* Progress indicator */}
            <div className="mb-8 pb-6 border-b border-border">
              <div className="space-y-3">
                <div className="h-5 w-3/4 bg-gray-200 dark:bg-gray-700 rounded loading-shine"></div>
                <div className="h-5 w-full bg-gray-200 dark:bg-gray-700 rounded loading-shine"></div>
                <div className="h-5 w-2/3 bg-gray-200 dark:bg-gray-700 rounded loading-shine"></div>
              </div>

              {/* Progress bar */}
              <div className="mt-8 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${loadingProgress}%` }}
                ></div>
              </div>
              <p className="mt-2 text-sm font-light text-gray-500 dark:text-gray-400 text-right">
                Loading travel guide... {Math.round(loadingProgress)}%
              </p>
            </div>

            {/* Content Skeletons */}
            {[...Array(3)].map((_, sectionIndex) => (
              <div
                key={sectionIndex}
                className="mb-8 animate-pulse-subtle"
                style={{ animationDelay: `${sectionIndex * 200}ms` }}
              >
                <div className="flex items-center mb-4">
                  <div className="mr-3 p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                    <div className="w-5 h-5 bg-blue-200 dark:bg-blue-800 rounded-full"></div>
                  </div>
                  <div className="h-7 w-56 bg-gray-200 dark:bg-gray-700 rounded loading-shine"></div>
                </div>

                <div className="pl-4 space-y-4">
                  {[...Array(2)].map((_, itemIndex) => (
                    <div key={itemIndex} className="flex items-start">
                      <div className="min-w-6 mt-1 mr-2">
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-gray-600"></div>
                      </div>
                      <div className="flex-1">
                        <div className="h-5 w-full bg-gray-200 dark:bg-gray-700 rounded loading-shine"></div>
                        <div className="h-5 w-3/4 mt-2 bg-gray-200 dark:bg-gray-700 rounded loading-shine"></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {/* Table Skeleton */}
            <div className="overflow-x-auto rounded-lg border-border mb-6">
              <div className="min-w-full bg-gray-50 dark:bg-gray-800 p-4">
                <div className="grid grid-cols-2 gap-4">
                  {[...Array(6)].map((_, rowIndex) => (
                    <React.Fragment key={rowIndex}>
                      <div
                        className="h-5 bg-gray-200 dark:bg-gray-700 rounded loading-shine"
                        style={{ animationDelay: `${rowIndex * 100}ms` }}
                      ></div>
                      <div
                        className="h-5 bg-gray-200 dark:bg-gray-700 rounded loading-shine"
                        style={{ animationDelay: `${rowIndex * 100 + 50}ms` }}
                      ></div>
                    </React.Fragment>
                  ))}
                </div>
              </div>
            </div>

            {/* Loading indicator at the bottom */}
            <div className="flex items-center justify-center mt-8 text-gray-500 dark:text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span>Loading travel guide content...</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

// Main wrapper component with error handling
export default function TravelGuideView({
  data,
  isLoading = false,
  darkMode = false,
  toggleDarkMode,
}: TravelGuideViewProps) {
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
    return <TravelGuideLoading />;
  }

  try {
    if (!data || hasError) {
      return (
        <DefaultErrorFallback
          title="Travel Guide Error"
          message="There was an error displaying the travel guide content."
        />
      );
    }
    return (
      <TravelGuide
        data={data}
        darkMode={darkMode}
        toggleDarkMode={toggleDarkMode}
      />
    );
  } catch (error) {
    console.error("Error rendering TravelGuide:", error);
    setHasError(true);
    return (
      <DefaultErrorFallback
        title="Travel Guide Error"
        message="There was an error displaying the travel guide content."
      />
    );
  }
}

// Combined styles
const styles = `
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
