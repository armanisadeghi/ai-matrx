import { useState, useEffect } from "react";
import {
  Plus,
  Minus,
  Briefcase,
  MapPin,
  DollarSign,
  Calendar,
  Award,
  Building,
  MessageSquare,
} from "lucide-react";
import FlexibleLoadingComponent from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultLoadingComponent";
import { useIsMobile } from "@/hooks/use-mobile";
import DefaultErrorFallback from "@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback";

const ModernOneColumnProfileDisplay = ({ data }) => {
  // Handle missing or malformed data gracefully
  const extracted = data?.extracted || {};
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");

  const toggleSection = (section) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // Section icons mapping for better visual cues
  const sectionIcons = {
    additional_accomplishments: <Award size={18} />,
    location: <MapPin size={18} />,
    compensation: <DollarSign size={18} />,
    availability: <Calendar size={18} />,
  };

  return (
    <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
      {/* Modern Gradient Header */}
      <div className="px-8 py-10 bg-gradient-to-r from-indigo-500/90 via-purple-500/90 to-pink-500/90 text-white">
        <h1 className="text-3xl font-bold">
          {extracted.name || "Unnamed Candidate"}
        </h1>
        <p className="mt-3 text-lg font-light opacity-90">
          {extracted.intro || "No introduction available"}
        </p>
      </div>

      {/* Content Container */}
      <div className="p-6 md:p-8 space-y-6">
        {/* Professional Experience Section */}
        <div className="space-y-5">
          <h2 className="text-2xl font-semibold pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <Briefcase size={20} className="text-indigo-500" />
            Professional Experience
          </h2>

          {extracted.key_experiences && extracted.key_experiences.length > 0 ? (
            <div className="space-y-4">
              {extracted.key_experiences.map((experience, index) => (
                <div
                  key={index}
                  className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 border border-slate-100 dark:border-slate-700"
                >
                  <div
                    onClick={() => toggleSection(`experience-${index}`)}
                    className="flex justify-between items-center cursor-pointer"
                  >
                    <h3 className="text-xl font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      <Building size={18} className="text-indigo-500" />
                      {experience.company || "Unknown Company"}
                    </h3>
                    <span className="text-indigo-500 dark:text-indigo-400">
                      {expandedSection === `experience-${index}` ? (
                        <Minus size={20} strokeWidth={2.5} />
                      ) : (
                        <Plus size={20} strokeWidth={2.5} />
                      )}
                    </span>
                  </div>

                  {expandedSection === `experience-${index}` && (
                    <div className="mt-4 pl-2 animate-fadeIn">
                      {experience.details && experience.details.length > 0 ? (
                        <ul className="space-y-3">
                          {experience.details.map((detail, detailIndex) => (
                            <li
                              key={detailIndex}
                              className="flex items-start gap-3"
                            >
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 mt-2"></span>
                              <span className="text-slate-700 dark:text-slate-300">
                                {detail}
                              </span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-500 dark:text-slate-400 pl-2">
                          No details available
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400 mt-2">
              No professional experience data available
            </p>
          )}
        </div>

        {/* Additional Info Sections with Lucide Icons - Single column for better expanded view */}
        <div className="space-y-4">
          {[
            "additional_accomplishments",
            "location",
            "compensation",
            "availability",
          ].map((section) => {
            const sectionData = extracted[section];
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
                      ? "bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30"
                      : "bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700"
                  }`}
                >
                  <h2 className="text-lg font-medium flex items-center gap-2 text-slate-900 dark:text-white">
                    <span
                      className={
                        expandedSection === section
                          ? "text-indigo-500"
                          : "text-slate-500 dark:text-slate-400"
                      }
                    >
                      {sectionIcons[section]}
                    </span>
                    {section
                      .replace(/_/g, " ")
                      .replace(/\b\w/g, (l) => l.toUpperCase())}
                  </h2>
                  <span
                    className={
                      expandedSection === section
                        ? "text-indigo-500"
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
                      <ul className="space-y-3">
                        {sectionData.map((item, index) => (
                          <li key={index} className="flex items-start gap-3">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 mt-2"></span>
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

        {/* Feedback Section */}
        <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          {!showFeedback ? (
            <button
              onClick={() => setShowFeedback(true)}
              className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:hover:bg-indigo-800/40 text-indigo-700 dark:text-indigo-300 font-medium transition-colors duration-200"
            >
              <MessageSquare size={18} />
              Add Feedback
            </button>
          ) : (
            <div className="space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium flex items-center gap-2">
                  <MessageSquare size={18} className="text-indigo-500" />
                  Candidate Feedback
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
                placeholder="Enter your feedback about this candidate..."
                className="w-full h-32 p-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800/50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all duration-200"
              />
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    // Here you would typically save the feedback
                    alert("Feedback saved!");
                    setFeedbackText("");
                  }}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors duration-200"
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
          Candidate Profile • Last Updated: {new Date().toLocaleDateString()}
        </p>
      </div>
    </div>
  );
};

interface ModernOneColumnProfileProps {
  data: any;
  isLoading?: boolean;
}

export default function ModernOneColumnProfileView({
  data,
  isLoading = false,
}: ModernOneColumnProfileProps) {
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
        baseColor="indigo"
        accentColor="violet"
        title="Candidate Profile"
        subtitle="Loading detailed candidate information"
        stages={[
          "Retrieving candidate details...",
          "Processing experience history...",
          "Analyzing qualifications...",
          "Preparing comprehensive profile...",
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
          title="Candidate Profile Error"
          message="There was an error displaying the candidate profile."
        />
      );
    }
    return <ModernOneColumnProfileDisplay data={data} />;
  } catch (error) {
    console.error("Error rendering ModernOneColumnProfileDisplay:", error);
    setHasError(true);
    return (
      <DefaultErrorFallback
        title="Candidate Profile Error"
        message="There was an error displaying the candidate profile."
      />
    );
  }
}
