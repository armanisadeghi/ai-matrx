import React, { useState, useEffect } from 'react';
import { 
  Briefcase, 
  MapPin, 
  DollarSign, 
  Clock, 
  Award, 
  ChevronRight,
  User,
  Calendar
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import DefaultErrorFallback from '@/components/mardown-display/markdown-classification/custom-views/common/DefaultErrorFallback';


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

interface CandidateProfileDisplayProps {
  data: CandidateProfileData;
  isLoading?: boolean;
}

const CandidateProfileDisplay = ({ data, isLoading = false }: CandidateProfileDisplayProps) => {
  // Handle missing or malformed data gracefully
  const extracted = data?.extracted || {};
  
  return (
    <div className="max-w-5xl mx-auto rounded-xl overflow-hidden shadow-lg bg-white dark:bg-slate-800 transition-colors duration-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-600 to-slate-700 dark:from-slate-700 dark:to-slate-900 px-6 py-8">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-slate-600 dark:text-slate-200">
            <User size={30} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">{extracted.name || 'Unnamed Candidate'}</h1>
            <p className="text-slate-200 mt-1 italic">{extracted.intro || 'No introduction available'}</p>
          </div>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-6 bg-slate-50 dark:bg-slate-800">
        {/* Experience Section */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Briefcase className="text-slate-500 dark:text-slate-400 mr-2" size={20} />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Professional Experience</h2>
          </div>
          
          {extracted.key_experiences && extracted.key_experiences.length > 0 ? (
            <div className="space-y-6">
              {extracted.key_experiences.map((experience: CandidateExperience, index: number) => (
                <div 
                  key={index} 
                  className="bg-white dark:bg-slate-700 rounded-lg p-5 shadow-sm border border-slate-100 dark:border-slate-600"
                >
                  <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-3">{experience.company || 'Unknown Company'}</h3>
                  {experience.details && experience.details.length > 0 ? (
                    <ul className="space-y-2">
                      {experience.details.map((detail: string, detailIndex: number) => (
                        <li key={detailIndex} className="flex items-start">
                          <ChevronRight className="text-slate-400 dark:text-slate-500 mr-2 mt-1 flex-shrink-0" size={16} />
                          <span className="text-slate-600 dark:text-slate-300">{detail}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-slate-500 dark:text-slate-400">No details available</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">No professional experience data available</p>
          )}
        </div>
        
        {/* Additional Accomplishments */}
        <div className="mb-8">
          <div className="flex items-center mb-4">
            <Award className="text-slate-500 dark:text-slate-400 mr-2" size={20} />
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-100">Additional Accomplishments</h2>
          </div>
          
          {extracted.additional_accomplishments && extracted.additional_accomplishments.length > 0 ? (
            <div className="bg-white dark:bg-slate-700 rounded-lg p-5 shadow-sm border border-slate-100 dark:border-slate-600">
              <ul className="space-y-2">
                {extracted.additional_accomplishments.map((accomplishment: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <ChevronRight className="text-slate-400 dark:text-slate-500 mr-2 mt-1 flex-shrink-0" size={16} />
                    <span className="text-slate-600 dark:text-slate-300">{accomplishment}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="text-slate-500 dark:text-slate-400">No additional accomplishments data available</p>
          )}
        </div>
        
        {/* Bottom Grid: Location, Compensation, Availability */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Location */}
          <div className="bg-white dark:bg-slate-700 rounded-lg p-5 shadow-sm border border-slate-100 dark:border-slate-600">
            <div className="flex items-center mb-3">
              <MapPin className="text-slate-500 dark:text-slate-400 mr-2" size={18} />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Location</h3>
            </div>
            {extracted.location && extracted.location.length > 0 ? (
              <ul className="space-y-2">
                {extracted.location.map((item: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <ChevronRight className="text-slate-400 dark:text-slate-500 mr-2 mt-1 flex-shrink-0" size={16} />
                    <span className="text-slate-600 dark:text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">No location information available</p>
            )}
          </div>
          
          {/* Compensation */}
          <div className="bg-white dark:bg-slate-700 rounded-lg p-5 shadow-sm border border-slate-100 dark:border-slate-600">
            <div className="flex items-center mb-3">
              <DollarSign className="text-slate-500 dark:text-slate-400 mr-2" size={18} />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Compensation</h3>
            </div>
            {extracted.compensation && extracted.compensation.length > 0 ? (
              <ul className="space-y-2">
                {extracted.compensation.map((item: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <ChevronRight className="text-slate-400 dark:text-slate-500 mr-2 mt-1 flex-shrink-0" size={16} />
                    <span className="text-slate-600 dark:text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">No compensation information available</p>
            )}
          </div>
          
          {/* Availability */}
          <div className="bg-white dark:bg-slate-700 rounded-lg p-5 shadow-sm border border-slate-100 dark:border-slate-600">
            <div className="flex items-center mb-3">
              <Clock className="text-slate-500 dark:text-slate-400 mr-2" size={18} />
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Availability</h3>
            </div>
            {extracted.availability && extracted.availability.length > 0 ? (
              <ul className="space-y-2">
                {extracted.availability.map((item: string, index: number) => (
                  <li key={index} className="flex items-start">
                    <ChevronRight className="text-slate-400 dark:text-slate-500 mr-2 mt-1 flex-shrink-0" size={16} />
                    <span className="text-slate-600 dark:text-slate-300">{item}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-slate-500 dark:text-slate-400">No availability information available</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const CandidateProfileSkeleton = () => {
  // Section icons for visual consistency with the loaded component
  const sectionIcons = {
    additional_accomplishments: <Award size={18} className="text-slate-300 dark:text-slate-600" />,
    location: <MapPin size={18} className="text-slate-300 dark:text-slate-600" />,
    compensation: <DollarSign size={18} className="text-slate-300 dark:text-slate-600" />,
    availability: <Calendar size={18} className="text-slate-300 dark:text-slate-600" />
  };

  // Array of section keys for mapping
  const sectionKeys: (keyof typeof sectionIcons)[] = ['additional_accomplishments', 'location', 'compensation', 'availability'];
  
  return (
    <div className="max-w-5xl mx-auto overflow-hidden rounded-xl shadow-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-700 relative">
      {/* Shimmer overlay for the entire component */}
      <div className="absolute inset-0 skeleton-shimmer"></div>
      
      {/* Header Skeleton */}
      <div className="px-8 py-10 bg-gradient-to-r from-indigo-400/30 via-purple-400/30 to-pink-400/30">
        {/* Name skeleton */}
        <div className="h-9 w-64 bg-white/20 rounded-lg animate-pulse"></div>
        {/* Intro skeleton */}
        <div className="mt-4 h-6 w-full max-w-md bg-white/10 rounded-md animate-pulse"></div>
      </div>
      
      {/* Content Container */}
      <div className="p-6 md:p-8 space-y-6">
        {/* Professional Experience Section Skeleton */}
        <div className="space-y-5">
          <h2 className="text-2xl font-semibold pb-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
            <Briefcase size={20} className="text-slate-300 dark:text-slate-600" />
            <div className="h-7 w-48 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse"></div>
          </h2>
          
          {/* Experience items skeleton */}
          <div className="space-y-4">
            {[1, 2, 3].map((_, index) => (
              <div 
                key={index} 
                className="bg-slate-50 dark:bg-slate-800/50 rounded-xl p-5 shadow-sm border border-slate-100 dark:border-slate-700"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Briefcase size={16} className="text-slate-300 dark:text-slate-600" />
                    <div className="h-6 w-40 md:w-56 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse"></div>
                  </div>
                  <div className="h-5 w-5 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse"></div>
                </div>
                
                {/* First item shows some content for better visual representation */}
                {index === 0 && (
                  <div className="mt-4 pl-2">
                    <ul className="space-y-3">
                      {[1, 2, 3].map((_, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 mt-2"></span>
                          <div className="h-4 flex-1 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        
        {/* Additional Info Sections Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sectionKeys.map((section, index) => (
            <div key={section} className="space-y-3">
              <div className="flex justify-between items-center p-4 rounded-xl shadow-sm bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <span>{sectionIcons[section]}</span>
                  <div className="h-5 w-32 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse"></div>
                </div>
                <div className="h-5 w-5 bg-slate-200 dark:bg-slate-700 rounded-full animate-pulse"></div>
              </div>
              
              {/* First section shows content for better visual representation */}
              {index === 0 && (
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm border border-slate-100 dark:border-slate-700">
                  <ul className="space-y-3">
                    {[1, 2].map((_, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 mt-2"></span>
                        <div className="h-4 flex-1 bg-slate-200 dark:bg-slate-700 rounded animate-pulse"></div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
        
        {/* Feedback Button Skeleton */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="h-8 w-32 bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse"></div>
        </div>
      </div>
      
      {/* Footer Skeleton */}
      <div className="px-6 py-4 bg-slate-100 dark:bg-slate-800/80 text-center border-t border-slate-200 dark:border-slate-700">
        <div className="h-4 w-48 mx-auto bg-slate-200 dark:bg-slate-700 rounded-md animate-pulse"></div>
      </div>
    </div>
  );
};

// Add the skeleton shimmer animation and pulse animations
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

@keyframes shimmer {
  0% {
    background-position: -200% 0;
  }
  100% {
    background-position: 200% 0;
  }
}

.skeleton-shimmer {
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0) 0%,
    rgba(255, 255, 255, 0.05) 20%,
    rgba(255, 255, 255, 0.1) 60%,
    rgba(255, 255, 255, 0) 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
  pointer-events: none;
}

/* Dark mode adjustments */
.dark .skeleton-shimmer {
  background: linear-gradient(
    90deg,
    rgba(30, 41, 59, 0) 0%,
    rgba(30, 41, 59, 0.1) 20%,
    rgba(30, 41, 59, 0.2) 60%,
    rgba(30, 41, 59, 0) 100%
  );
}
`;



export default function CandidateProfileView({ data, isLoading = false }: CandidateProfileDisplayProps) {
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
    return <CandidateProfileSkeleton />;
  }

  try {
    if (!data || hasError) {
      return <DefaultErrorFallback
        title="Candidate Profile Error"
        message="There was an error displaying the candidate profile."
      />;
    }
    return <CandidateProfileDisplay data={data} />;
  } catch (error) {
    console.error("Error rendering CandidateProfileDisplay:", error);
    setHasError(true);
    return <DefaultErrorFallback
      title="Candidate Profile Error"
      message="There was an error displaying the candidate profile."
    />;
  }
}