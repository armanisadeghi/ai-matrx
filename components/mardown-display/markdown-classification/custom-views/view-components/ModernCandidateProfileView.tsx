import { useState, useEffect } from 'react';
import { toast } from '@/lib/toast';
import { Plus, Minus, Briefcase, MapPin, DollarSign, Calendar, Award, MessageSquare } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import DefaultErrorFallback from '@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback';
import FlexibleLoadingComponent from '@/components/mardown-display/markdown-classification/custom-views/common/DefaultLoadingComponent';

interface CandidateExperience {
  company?: string;
  details?: string[];
  [key: string]: unknown;
}

interface CandidateExtracted {
  name?: string;
  intro?: string;
  key_experiences?: CandidateExperience[];
  additional_accomplishments?: string[];
  location?: string[];
  compensation?: string[];
  availability?: string[];
  [key: string]: unknown;
}

interface CandidateProfileData {
  extracted?: CandidateExtracted;
  [key: string]: unknown;
}

const CandidateProfileWithCollapseDisplay = ({ data }: { data: CandidateProfileData }) => {
  // Handle missing or malformed data gracefully
  const extracted = data?.extracted || {};
  const [expandedSections, setExpandedSections] = useState(new Set(['experience-0']));
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const newSet = new Set(prev);
      if (newSet.has(section)) {
        newSet.delete(section);
      } else {
        newSet.add(section);
      }
      return newSet;
    });
  };

  // Section icons mapping for better visual cues
  const sectionIcons = {
    additional_accomplishments: <Award size={18} />,
    location: <MapPin size={18} />,
    compensation: <DollarSign size={18} />,
    availability: <Calendar size={18} />
  };
  
  return (
    <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700">
      {/* Modern Gradient Header */}
      <div className="px-8 pt-5 pb-2 bg-gradient-to-r from-indigo-500/90 via-purple-500/90 to-pink-500/90 text-white">
        <h1 className="text-3xl font-bold">{extracted.name || 'Unnamed Candidate'}</h1>
        <p className="mt-3 text-lg font-light opacity-90">{extracted.intro || 'No introduction available'}</p>
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
              {extracted.key_experiences.map((experience: CandidateExperience, index: number) => (
                <div 
                  key={index} 
                  className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 shadow-sm hover:shadow-md transition-all duration-200 border border-slate-100 dark:border-slate-700"
                >
                  <div 
                    onClick={() => toggleSection(`experience-${index}`)} 
                    className="flex justify-between items-center cursor-pointer"
                  >
                    <h3 className="text-xl font-medium text-slate-900 dark:text-white flex items-center gap-2">
                      <Briefcase size={16} className="text-indigo-400" />
                      {experience.company || 'Unknown Company'}
                    </h3>
                    <span className="text-indigo-500 dark:text-indigo-400">
                      {expandedSections.has(`experience-${index}`) ? (
                        <Minus size={20} strokeWidth={2.5} />
                      ) : (
                        <Plus size={20} strokeWidth={2.5} />
                      )}
                    </span>
                  </div>
                  
                  {expandedSections.has(`experience-${index}`) && (
                    <div className="mt-4 pl-2 animate-fadeIn">
                      {experience.details && experience.details.length > 0 ? (
                        <ul className="space-y-3">
                          {experience.details.map((detail: string, detailIndex: number) => (
                            <li key={detailIndex} className="flex items-start gap-3">
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 mt-2"></span>
                              <span className="text-slate-700 dark:text-slate-300">{detail}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-slate-500 dark:text-slate-400 pl-2">No details available</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400 mt-2">No professional experience data available</p>
          )}
        </div>
        
        {/* Additional Info Sections with Lucide Icons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(['additional_accomplishments', 'location', 'compensation', 'availability'] as const).map((section) => {
            const sectionData = extracted[section];
            const hasData = sectionData && Array.isArray(sectionData) && sectionData.length > 0;
            
            return (
              <div key={section} className="space-y-3">
                <div 
                  onClick={() => toggleSection(section)}
                  className={`flex justify-between items-center cursor-pointer p-4 rounded-xl shadow-sm hover:shadow-md transition-all duration-200 ${
                    expandedSections.has(section) 
                      ? 'bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30' 
                      : 'bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700'
                  }`}
                >
                  <h2 className="text-lg font-medium flex items-center gap-2 text-slate-900 dark:text-white">
                    <span className={expandedSections.has(section) ? 'text-indigo-500' : 'text-slate-500 dark:text-slate-400'}>
                      {sectionIcons[section]}
                    </span>
                    {section.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                  </h2>
                  <span className={expandedSections.has(section) ? 'text-indigo-500' : 'text-slate-500 dark:text-slate-400'}>
                    {expandedSections.has(section) ? (
                      <Minus size={18} strokeWidth={2.5} />
                    ) : (
                      <Plus size={18} strokeWidth={2.5} />
                    )}
                  </span>
                </div>
                
                {expandedSections.has(section) && (
                  <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700 animate-fadeIn">
                    {hasData && sectionData ? (
                      <ul className="space-y-3">
                        {sectionData.map((item: string, index: number) => (
                          <li key={index} className="flex items-start gap-3">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 mt-2"></span>
                            <span className="text-slate-700 dark:text-slate-300">{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500 dark:text-slate-400">No {section.replace(/_/g, ' ')} information available</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* Feedback Section */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
          {!showFeedback ? (
            <button 
              onClick={() => setShowFeedback(true)} 
              className="flex items-center gap-2 text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium transition-colors duration-200"
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
                  className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300"
                >
                  <Minus size={18} />
                </button>
              </div>
              <textarea 
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Enter your feedback about this candidate..."
                className="w-full h-32 p-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all duration-200"
              />
              <div className="flex justify-end">
                <button 
                  onClick={() => {
                    // Handle feedback submission logic here
                    toast.success('Feedback submitted: ' + feedbackText);
                    setFeedbackText('');
                    setShowFeedback(false);
                  }}
                  className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white font-medium rounded-lg shadow-sm hover:shadow transition-all duration-200"
                  disabled={!feedbackText.trim()}
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
        <p>Candidate Profile • Last Updated: {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
};

interface CandidateProfileWithCollapseProps {
  data: CandidateProfileData;
  isLoading?: boolean;
}

// Export component
export default function CandidateProfileWithCollapseView({ data, isLoading = false }: CandidateProfileWithCollapseProps) {
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
    return <FlexibleLoadingComponent 
      baseColor="blue"
      accentColor="violet"
      title="Candidate Profile"
      subtitle="Loading profile information"
      stages={[
        "Retrieving candidate data...",
        "Loading professional experience...",
        "Processing qualifications...",
        "Organizing accomplishments...",
        "Extracting key points...",
        "Organizing key metrics...",
        "Finalizing profile view..."
      ]}
      placeholderItems={3}
      size="large"
    />;
  }

  try {
    if (!data || hasError) {
      return <DefaultErrorFallback
        title="Candidate Profile Error"
        message="There was an error displaying the candidate profile."
      />;
    }
    return <CandidateProfileWithCollapseDisplay data={data} />;
  } catch (error) {
    console.error("Error rendering CandidateProfileWithCollapseDisplay:", error);
    setHasError(true);
    return <DefaultErrorFallback
      title="Candidate Profile Error"
      message="There was an error displaying the candidate profile."
    />;
  }
}