"use client";
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { 
  BookOpen, ExternalLink, ChevronDown, ChevronRight, 
  Maximize2, Minimize2, Search, TrendingUp, AlertTriangle,
  CheckCircle2, Target, Lightbulb, Award, Eye, Filter,
  BarChart3, Users, Briefcase, Scale, Clock, Star, Printer
} from 'lucide-react';
import { useCanvas } from '@/features/canvas/hooks/useCanvas';

interface ResearchFinding {
  id: string;
  title: string;
  primarySource: string;
  additionalSources: string[];
  urls: string[];
  keyDetails: string;
  significance: string;
  futureImplications: string;
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
}

interface ResearchSection {
  id: string;
  title: string;
  subtitle?: string;
  findings: ResearchFinding[];
}

interface ResearchChallenge {
  id: string;
  title: string;
  description: string;
  currentSolutions?: string;
  researchGaps?: string;
  category: 'technical' | 'ethical' | 'regulatory' | 'other';
}

interface ResearchRecommendation {
  id: string;
  recommendation: string;
  target: 'researchers' | 'industry' | 'policymakers' | 'general';
}

interface UnrecognizedSection {
  id: string;
  title: string;
  content: string;
  rawLines: string[];
}

interface ParsedSection {
  id: string;
  title: string;
  content: string;
  rawLines: string[];
  level: number;
  recognized: boolean;
}

interface ResearchData {
  title: string;
  overview: string;
  researchScope?: string;
  keyFocusAreas?: string;
  analysisPeriod?: string;
  executiveSummary?: string;
  introduction: string;
  researchQuestions: string[];
  sections: ResearchSection[];
  convergentThemes: Array<{theme: string; description: string}>;
  conflictingEvidence?: {
    disagreement: string;
    perspectives: string;
    resolution: string;
  };
  shortTermOutlook: string[];
  mediumTermOutlook: string[];
  longTermVision: string[];
  challenges: ResearchChallenge[];
  recommendations: ResearchRecommendation[];
  conclusion: string;
  keyTakeaways: string[];
  methodology?: {
    searchStrategy: string;
    selectionCriteria: string;
    analysisFramework: string;
  };
  sourceQuality?: {
    peerReviewed: number;
    industryReports: number;
    expertInterviews: number;
    governmentPubs: number;
  };
  limitations: string[];
  metadata: {
    researchDate?: string;
    lastUpdated?: string;
    confidenceRating?: string;
    biasAssessment?: string;
  };
  // Debug and raw data
  allSections: ParsedSection[];
  unrecognizedSections: UnrecognizedSection[];
  rawContent: string;
  parsingStats: {
    totalLines: number;
    processedLines: number;
    recognizedSections: number;
    unrecognizedSections: number;
  };
}

interface ResearchBlockProps {
  research: ResearchData;
  taskId?: string; // Task ID for canvas deduplication
}

const ResearchBlock: React.FC<ResearchBlockProps> = ({ research, taskId }) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const blockContentRef = useRef<HTMLDivElement>(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const handlePrint = useCallback(async () => {
    if (!blockContentRef.current || isPrinting) return;
    setIsPrinting(true);
    try {
      const { captureBlockElement } = await import('@/features/chat/utils/dom-capture-block-printer');
      await captureBlockElement(blockContentRef.current, research.title.replace(/\s+/g, '-').toLowerCase() || 'research', 'portrait');
    } catch (err) {
      console.error('[ResearchBlock] Print failed:', err);
    } finally {
      setIsPrinting(false);
    }
  }, [research.title, isPrinting]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [expandedFindings, setExpandedFindings] = useState<Set<string>>(new Set());
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'HIGH' | 'MEDIUM' | 'LOW'>('all');
  const [activeTab, setActiveTab] = useState<'overview' | 'findings' | 'analysis' | 'recommendations' | 'debug'>('overview');
  const { open: openCanvas } = useCanvas();

  // Filter findings by confidence level
  const filteredSections = useMemo(() => {
    if (selectedFilter === 'all') return research.sections;
    
    return research.sections.map(section => ({
      ...section,
      findings: section.findings.filter(finding => finding.confidenceLevel === selectedFilter)
    })).filter(section => section.findings.length > 0);
  }, [research.sections, selectedFilter]);

  const toggleSection = (sectionId: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(sectionId)) {
      newExpanded.delete(sectionId);
    } else {
      newExpanded.add(sectionId);
    }
    setExpandedSections(newExpanded);
  };

  const toggleFinding = (findingId: string) => {
    const newExpanded = new Set(expandedFindings);
    if (newExpanded.has(findingId)) {
      newExpanded.delete(findingId);
    } else {
      newExpanded.add(findingId);
    }
    setExpandedFindings(newExpanded);
  };

  const getConfidenceBadge = (level: 'HIGH' | 'MEDIUM' | 'LOW') => {
    const styles = {
      HIGH: 'bg-green-100 dark:bg-green-950/30 text-green-800 dark:text-green-300 border-green-300 dark:border-green-700',
      MEDIUM: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700',
      LOW: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-300 border-red-300 dark:border-red-700'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${styles[level]}`}>
        {level}
      </span>
    );
  };

  const getRecommendationIcon = (target: string) => {
    switch (target) {
      case 'researchers': return <Search className="h-4 w-4" />;
      case 'industry': return <Briefcase className="h-4 w-4" />;
      case 'policymakers': return <Scale className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  return (
    <>
      {/* Fullscreen Backdrop */}
      {isFullScreen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setIsFullScreen(false)}
        />
      )}

      <div className={`w-full ${isFullScreen ? 'fixed inset-0 z-50 flex items-center justify-center p-4' : 'py-6'}`}>
        <div className={`max-w-7xl mx-auto ${isFullScreen ? 'bg-textured rounded-2xl shadow-2xl h-full max-h-[95dvh] w-full flex flex-col overflow-hidden' : ''}`}>
          
          {/* Fullscreen Header */}
          {isFullScreen && (
            <div className="flex-shrink-0 px-6 py-4 border-b border-border flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
              <div className="flex items-center gap-3">
                <BookOpen className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200">Research Analysis</h3>
              </div>
              <button
                onClick={() => setIsFullScreen(false)}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-textured hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium transition-all shadow-sm"
              >
                <Minimize2 className="h-4 w-4" />
                <span>Exit</span>
              </button>
            </div>
          )}

          {/* Scrollable Content */}
          <div className={isFullScreen ? 'flex-1 overflow-y-auto' : ''}>
            <div className="p-6 space-y-6">

              {/* Header Section */}
              <div className="bg-gradient-to-br from-emerald-100 via-teal-50 to-cyan-100 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-cyan-950/40 rounded-2xl p-6 shadow-lg border-2 border-emerald-200 dark:border-emerald-800/50">
                <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-emerald-500 dark:bg-emerald-600 rounded-xl shadow-md">
                      <BookOpen className="h-8 w-8 text-white" />
                    </div>
                    <div className="flex-1">
                      <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">
                        {research.title}
                      </h1>
                      {research.overview && (
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                          {research.overview}
                        </p>
                      )}
                    </div>
                  </div>

                  {!isFullScreen && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openCanvas({
                          type: 'research',
                          data: research,
                          metadata: { 
                            title: research.title,
                            sourceTaskId: taskId
                          }
                        })}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-purple-500 dark:bg-purple-600 text-white text-sm font-semibold shadow-md hover:bg-purple-600 dark:hover:bg-purple-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <ExternalLink className="h-4 w-4" />
                        <span>Canvas</span>
                      </button>
                      <button
                        onClick={handlePrint}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-500 dark:bg-slate-600 text-white text-sm font-semibold shadow-md hover:bg-slate-600 dark:hover:bg-slate-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <Printer className="h-4 w-4" />
                        <span>Print</span>
                      </button>
                      <button
                        onClick={() => setIsFullScreen(true)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 dark:bg-emerald-600 text-white text-sm font-semibold shadow-md hover:bg-emerald-600 dark:hover:bg-emerald-700 hover:shadow-lg transform hover:scale-105 transition-all"
                      >
                        <Maximize2 className="h-4 w-4" />
                        <span>Research View</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Research Metadata */}
                {(research.researchScope || research.keyFocusAreas || research.analysisPeriod) && (
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    {research.researchScope && (
                      <div className="bg-textured/50 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800/50">
                        <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 mb-1">
                          <Target className="h-4 w-4" />
                          <span className="text-xs font-medium">Scope</span>
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{research.researchScope}</div>
                      </div>
                    )}
                    {research.keyFocusAreas && (
                      <div className="bg-textured/50 rounded-lg p-3 border border-teal-200 dark:border-teal-800/50">
                        <div className="flex items-center gap-2 text-teal-600 dark:text-teal-400 mb-1">
                          <Eye className="h-4 w-4" />
                          <span className="text-xs font-medium">Focus Areas</span>
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{research.keyFocusAreas}</div>
                      </div>
                    )}
                    {research.analysisPeriod && (
                      <div className="bg-textured/50 rounded-lg p-3 border border-cyan-200 dark:border-cyan-800/50">
                        <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 mb-1">
                          <Clock className="h-4 w-4" />
                          <span className="text-xs font-medium">Period</span>
                        </div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{research.analysisPeriod}</div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Navigation */}
                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'overview', label: 'Overview', icon: Eye },
                    { id: 'findings', label: 'Findings', icon: Search },
                    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
                    { id: 'recommendations', label: 'Recommendations', icon: Lightbulb },
                    { id: 'debug', label: 'Debug', icon: AlertTriangle }
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as any)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        activeTab === tab.id
                          ? 'bg-textured text-emerald-700 dark:text-emerald-300 shadow-md border border-emerald-300 dark:border-emerald-700'
                          : 'text-gray-600 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-white/50 dark:hover:bg-gray-800/50'
                      }`}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Tab Content */}
              <div ref={blockContentRef}>
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Executive Summary */}
                  {research.executiveSummary && (
                    <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        Executive Summary
                      </h2>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed">{research.executiveSummary}</p>
                    </div>
                  )}

                  {/* Introduction */}
                  {research.introduction && (
                    <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Introduction</h2>
                      <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-4">{research.introduction}</p>
                      
                      {/* Research Questions */}
                      {research.researchQuestions.length > 0 && (
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Key Research Questions</h3>
                          <ul className="space-y-2">
                            {research.researchQuestions.map((question, index) => (
                              <li key={index} className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 rounded-full flex items-center justify-center text-xs font-bold">
                                  {index + 1}
                                </span>
                                <span className="text-gray-700 dark:text-gray-300">{question}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'findings' && (
                <div className="space-y-6">
                  {/* Filter Controls */}
                  <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Research Findings</h2>
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                      <select
                        value={selectedFilter}
                        onChange={(e) => setSelectedFilter(e.target.value as any)}
                        className="text-sm px-3 py-1.5 rounded-lg bg-textured border-border text-gray-700 dark:text-gray-300"
                      >
                        <option value="all">All Confidence Levels</option>
                        <option value="HIGH">High Confidence</option>
                        <option value="MEDIUM">Medium Confidence</option>
                        <option value="LOW">Low Confidence</option>
                      </select>
                    </div>
                  </div>

                  {/* Research Sections */}
                  {filteredSections.map((section) => (
                    <div key={section.id} className="bg-textured rounded-xl shadow-lg border-border overflow-hidden">
                      <button
                        onClick={() => toggleSection(section.id)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                      >
                        <div className="text-left">
                          <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{section.title}</h3>
                          {section.subtitle && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{section.subtitle}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500 dark:text-gray-400">{section.findings.length} findings</span>
                          {expandedSections.has(section.id) ? 
                            <ChevronDown className="h-5 w-5 text-gray-500 dark:text-gray-400" /> :
                            <ChevronRight className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                          }
                        </div>
                      </button>

                      {expandedSections.has(section.id) && (
                        <div className="border-t border-border">
                          {section.findings.map((finding) => (
                            <div key={finding.id} className="border-b border-gray-100 dark:border-gray-700/50 last:border-b-0">
                              <button
                                onClick={() => toggleFinding(finding.id)}
                                className="w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-2">{finding.title}</h4>
                                    <div className="flex items-center gap-2 mb-2">
                                      {getConfidenceBadge(finding.confidenceLevel)}
                                      <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {finding.primarySource}
                                      </span>
                                    </div>
                                  </div>
                                  {expandedFindings.has(finding.id) ? 
                                    <ChevronDown className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-1" /> :
                                    <ChevronRight className="h-4 w-4 text-gray-500 dark:text-gray-400 mt-1" />
                                  }
                                </div>
                              </button>

                              {expandedFindings.has(finding.id) && (
                                <div className="px-6 pb-4 space-y-4">
                                  {/* Key Details */}
                                  <div>
                                    <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Key Details</h5>
                                    <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{finding.keyDetails}</p>
                                  </div>

                                  {/* Significance */}
                                  {finding.significance && (
                                    <div>
                                      <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Significance</h5>
                                      <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{finding.significance}</p>
                                    </div>
                                  )}

                                  {/* Future Implications */}
                                  {finding.futureImplications && (
                                    <div>
                                      <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2 flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                        Future Implications
                                      </h5>
                                      <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">{finding.futureImplications}</p>
                                    </div>
                                  )}

                                  {/* Sources */}
                                  <div>
                                    <h5 className="font-medium text-gray-900 dark:text-gray-100 mb-2">Sources</h5>
                                    <div className="space-y-1">
                                      <p className="text-sm text-gray-700 dark:text-gray-300">
                                        <span className="font-medium">Primary:</span> {finding.primarySource}
                                      </p>
                                      {finding.additionalSources.length > 0 && (
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                          <span className="font-medium">Additional:</span> {finding.additionalSources.join(', ')}
                                        </p>
                                      )}
                                      {finding.urls.length > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                          {finding.urls.map((url, urlIndex) => (
                                            <a
                                              key={urlIndex}
                                              href={url}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 text-xs rounded-md hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                                            >
                                              <ExternalLink className="h-3 w-3" />
                                              Source {urlIndex + 1}
                                            </a>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'analysis' && (
                <div className="space-y-6">
                  {/* Convergent Themes */}
                  {research.convergentThemes.length > 0 && (
                    <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <BarChart3 className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                        Convergent Themes
                      </h2>
                      <div className="grid md:grid-cols-2 gap-4">
                        {research.convergentThemes.map((theme, index) => (
                          <div key={index} className="p-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg border border-purple-200 dark:border-purple-800/50">
                            <h3 className="font-semibold text-purple-900 dark:text-purple-200 mb-2">{theme.theme}</h3>
                            <p className="text-purple-700 dark:text-purple-300 text-sm">{theme.description}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Future Outlook */}
                  <div className="grid lg:grid-cols-3 gap-6">
                    {research.shortTermOutlook.length > 0 && (
                      <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                          <Clock className="h-5 w-5 text-green-600 dark:text-green-400" />
                          Short-term (1-2 years)
                        </h3>
                        <ul className="space-y-2">
                          {research.shortTermOutlook.map((item, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300 text-sm">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {research.mediumTermOutlook.length > 0 && (
                      <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                          <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                          Medium-term (3-5 years)
                        </h3>
                        <ul className="space-y-2">
                          {research.mediumTermOutlook.map((item, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300 text-sm">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {research.longTermVision.length > 0 && (
                      <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                          <Star className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                          Long-term (5+ years)
                        </h3>
                        <ul className="space-y-2">
                          {research.longTermVision.map((item, index) => (
                            <li key={index} className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-purple-600 dark:text-purple-400 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300 text-sm">{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Conclusion and Key Takeaways */}
                  {(research.conclusion || research.keyTakeaways.length > 0) && (
                    <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4">Conclusion</h2>
                      {research.conclusion && (
                        <p className="text-gray-700 dark:text-gray-300 leading-relaxed mb-6">{research.conclusion}</p>
                      )}
                      
                      {research.keyTakeaways.length > 0 && (
                        <div>
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Key Takeaways</h3>
                          <ul className="space-y-2">
                            {research.keyTakeaways.map((takeaway, index) => (
                              <li key={index} className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 rounded-full flex items-center justify-center text-xs font-bold">
                                  {index + 1}
                                </span>
                                <span className="text-gray-700 dark:text-gray-300">{takeaway}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'recommendations' && (
                <div className="space-y-6">
                  {/* Recommendations by Target */}
                  {['researchers', 'industry', 'policymakers', 'general'].map(target => {
                    const targetRecs = research.recommendations.filter(rec => rec.target === target);
                    if (targetRecs.length === 0) return null;

                    return (
                      <div key={target} className="bg-textured rounded-xl p-6 shadow-lg border-border">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                          {getRecommendationIcon(target)}
                          For {target.charAt(0).toUpperCase() + target.slice(1)}
                        </h2>
                        <ul className="space-y-3">
                          {targetRecs.map((rec) => (
                            <li key={rec.id} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                              <Lightbulb className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                              <span className="text-gray-700 dark:text-gray-300">{rec.recommendation}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}

                  {/* Challenges and Limitations */}
                  {(research.challenges.length > 0 || research.limitations.length > 0) && (
                    <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        Challenges & Limitations
                      </h2>
                      
                      {research.limitations.length > 0 && (
                        <div className="mb-6">
                          <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Study Limitations</h3>
                          <ul className="space-y-2">
                            {research.limitations.map((limitation, index) => (
                              <li key={index} className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400 mt-0.5 flex-shrink-0" />
                                <span className="text-gray-700 dark:text-gray-300 text-sm">{limitation}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Debug Tab */}
              {activeTab === 'debug' && (
                <div className="space-y-6">
                  {/* Parsing Statistics */}
                  <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                      <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      Parsing Statistics
                    </h2>
                    <div className="grid md:grid-cols-4 gap-4">
                      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{research.parsingStats.totalLines}</div>
                        <div className="text-sm text-blue-700 dark:text-blue-300">Total Lines</div>
                      </div>
                      <div className="bg-green-50 dark:bg-green-950/30 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-green-600 dark:text-green-400">{research.parsingStats.recognizedSections}</div>
                        <div className="text-sm text-green-700 dark:text-green-300">Recognized Sections</div>
                      </div>
                      <div className="bg-orange-50 dark:bg-orange-950/30 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{research.parsingStats.unrecognizedSections}</div>
                        <div className="text-sm text-orange-700 dark:text-orange-300">Unrecognized Sections</div>
                      </div>
                      <div className="bg-purple-50 dark:bg-purple-950/30 rounded-lg p-4 text-center">
                        <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{research.allSections.length}</div>
                        <div className="text-sm text-purple-700 dark:text-purple-300">Total Sections</div>
                      </div>
                    </div>
                  </div>

                  {/* Unrecognized Sections */}
                  {research.unrecognizedSections.length > 0 && (
                    <div className="bg-textured rounded-xl p-6 shadow-lg border border-orange-200 dark:border-orange-800">
                      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                        Unrecognized Sections ({research.unrecognizedSections.length})
                      </h2>
                      <div className="space-y-4">
                        {research.unrecognizedSections.map((section) => (
                          <div key={section.id} className="border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                            <h3 className="font-semibold text-orange-700 dark:text-orange-300 mb-2">{section.title}</h3>
                            <div className="bg-orange-50 dark:bg-orange-950/30 rounded p-3">
                              <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-x-auto">
                                {section.content}
                              </pre>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All Sections Overview */}
                  <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                      All Sections Overview
                    </h2>
                    <div className="space-y-2">
                      {research.allSections.map((section) => (
                        <div key={section.id} className={`flex items-center justify-between p-3 rounded-lg ${
                          section.recognized 
                            ? 'bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800' 
                            : 'bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800'
                        }`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                              section.recognized ? 'bg-green-500' : 'bg-red-500'
                            }`}>
                              {section.level}
                            </div>
                            <span className={`font-medium ${
                              section.recognized 
                                ? 'text-green-700 dark:text-green-300' 
                                : 'text-red-700 dark:text-red-300'
                            }`}>
                              {section.title}
                            </span>
                          </div>
                          <div className={`px-2 py-1 rounded text-xs font-medium ${
                            section.recognized 
                              ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' 
                              : 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                          }`}>
                            {section.recognized ? 'Recognized' : 'Unrecognized'}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Raw Content */}
                  <div className="bg-textured rounded-xl p-6 shadow-lg border-border">
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                      Raw Content
                    </h2>
                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-96 overflow-y-auto">
                      <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {research.rawContent}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
              </div>

            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default ResearchBlock;
