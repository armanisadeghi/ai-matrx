import { useState, useEffect } from "react";
import FlexibleLoadingComponent from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultLoadingComponent";
import { useIsMobile } from "@/hooks/use-mobile";
import DefaultErrorFallback from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback";

const CandidateProfileWithCollapseDisplay = ({ data }) => {
  // Handle missing or malformed data gracefully
  const extracted = data?.extracted || {};
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  const toggleSection = (section) => {
    if (expandedSection === section) {
      setExpandedSection(null);
    } else {
      setExpandedSection(section);
    }
  };

  return (
    <div className="max-w-5xl mx-auto rounded-xl shadow-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="px-6 py-8 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-800 dark:to-slate-700">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">
          {extracted.name || "Unnamed Candidate"}
        </h1>
        <p className="mt-2 text-lg italic text-slate-700 dark:text-slate-300">
          {extracted.intro || "No introduction available"}
        </p>
      </div>

      {/* Body Content */}
      <div className="p-6 space-y-6">
        {/* Key Experiences */}
        <div className="space-y-4">
          <h2 className="text-2xl font-semibold pb-2 border-b border-slate-300 dark:border-slate-700">
            Professional Experience
          </h2>

          {extracted.key_experiences && extracted.key_experiences.length > 0 ? (
            <>
              {extracted.key_experiences.map((experience, index) => (
                <div
                  key={index}
                  className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow duration-200"
                >
                  <div
                    onClick={() => toggleSection(`experience-${index}`)}
                    className="flex justify-between items-center cursor-pointer"
                  >
                    <h3 className="text-xl font-medium text-slate-900 dark:text-white">
                      {experience.company || "Unknown Company"}
                    </h3>
                    <span className="text-slate-500 dark:text-slate-400">
                      {expandedSection === `experience-${index}` ? (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          className="h-5 w-5"
                          viewBox="0 0 20 20"
                          fill="currentColor"
                        >
                          <path
                            fillRule="evenodd"
                            d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                            clipRule="evenodd"
                          />
                        </svg>
                      )}
                    </span>
                  </div>

                  {(expandedSection === `experience-${index}` ||
                    index === 0) && (
                    <>
                      {experience.details && experience.details.length > 0 ? (
                        <ul className="mt-3 space-y-2 pl-2">
                          {experience.details.map((detail, detailIndex) => (
                            <li key={detailIndex} className="flex items-start">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 mt-2 mr-2"></span>
                              <span className="text-slate-700 dark:text-slate-300">
                                {detail}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-3 text-slate-500 dark:text-slate-400 pl-2">
                          No details available
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </>
          ) : (
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              No professional experience data available
            </p>
          )}
        </div>

        {/* Additional Info Sections */}
        {[
          "additional_accomplishments",
          "location",
          "compensation",
          "availability",
        ].map((section) => {
          const sectionData = extracted[section];
          const hasData =
            sectionData && Array.isArray(sectionData) && sectionData.length > 0;

          return (
            <div key={section} className="space-y-2">
              <div
                onClick={() => toggleSection(section)}
                className="flex justify-between items-center cursor-pointer bg-slate-100 dark:bg-slate-800 p-3 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200"
              >
                <h2 className="text-xl font-medium text-slate-900 dark:text-white capitalize">
                  {section.replace(/_/g, " ")}
                </h2>
                <span className="text-slate-500 dark:text-slate-400">
                  {expandedSection === section ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5 10a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  ) : (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-5 w-5"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </span>
              </div>

              {expandedSection === section && (
                <div className="pl-4 py-3 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                  {hasData ? (
                    <ul className="space-y-2">
                      {sectionData.map((item, index) => (
                        <li key={index} className="flex items-start">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-slate-500 mt-2 mr-2"></span>
                          <span className="text-slate-700 dark:text-slate-300">
                            {item}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400">
                      No {section.replace(/_/g, " ")} information available
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-slate-200 dark:bg-slate-800 text-center text-slate-600 dark:text-slate-400 text-sm">
        <p>
          Candidate Profile • Last Updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};

interface CandidateProfileWithCollapseProps {
  data: any;
  isLoading?: boolean;
}

export default function CandidateProfileWithCollapse({
  data,
  isLoading = false,
}: CandidateProfileWithCollapseProps) {
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
        baseColor="slate"
        accentColor="indigo"
        title="Candidate Profile"
        subtitle="Loading candidate information"
        stages={[
          "Retrieving profile data...",
          "Processing experience details...",
          "Preparing professional information...",
          "Finalizing candidate profile...",
        ]}
        placeholderItems={3}
        size="medium"
      />
    );
  }

  try {
    if (!data || hasError) {
      return (
        <DefaultErrorFallback
          title="Candidate Profile Error"
          message="There was an error displaying the candidate profile."
        />
      );
    }
    return <CandidateProfileWithCollapseDisplay data={data} />;
  } catch (error) {
    console.error(
      "Error rendering CandidateProfileWithCollapseDisplay:",
      error,
    );
    setHasError(true);
    return (
      <DefaultErrorFallback
        title="Candidate Profile Error"
        message="There was an error displaying the candidate profile."
      />
    );
  }
}
