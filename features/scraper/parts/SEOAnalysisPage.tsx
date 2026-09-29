import React, { useState, useMemo } from 'react';
import ScraperDataUtils from '../utils/data-utils';

const SEOAnalysisPage = ({ overview = {}, structuredData = {} }) => {
  const [activeSection, setActiveSection] = useState('overview');
  
  // Use ScraperDataUtils for all SEO analysis
  const seoAnalysis = useMemo(() => {
    console.log("[SEO ANALYSIS] Raw overview data:", overview);
    console.log("[SEO ANALYSIS] Raw structured data:", structuredData);
    
    try {
      const analysis = ScraperDataUtils.performSEOAnalysis(overview, structuredData);
      console.log("[SEO ANALYSIS] Complete analysis result:", analysis);
      return analysis;
    } catch (error) {
      console.error("[SEO ANALYSIS] Error performing analysis:", error);
      // Return safe defaults
      return {
        titleAnalysis: {
          length: 0,
          status: 'Too short' as const,
          statusClass: 'text-yellow-500 dark:text-yellow-400',
          title: ''
        },
        contentMetrics: {
          charCount: 0,
          estimatedWordCount: 0,
          hasStructuredContent: false,
          tableCount: 0,
          codeBlockCount: 0,
          listCount: 0,
          contentLengthStatus: 'short' as const,
          contentLengthClass: 'bg-red-500',
          contentLengthMessage: 'No content available'
        },
        headerAnalysis: {
          headers: [],
          groupedHeaders: {},
          totalHeaders: 0,
          hasProperH1: false,
          hasProperHierarchy: false,
          h1Count: 0,
          hierarchyIssues: []
        },
        suggestions: [],
        seoScore: 0
      };
    }
  }, [overview, structuredData]);

  // Safe data extraction using ScraperDataUtils
  const safeOverviewData = useMemo(() => {
    return ScraperDataUtils.getOverview(overview);
  }, [overview]);

  const {
    titleAnalysis,
    contentMetrics,
    headerAnalysis,
    suggestions,
    seoScore
  } = seoAnalysis;

  // Safe access to overview data with fallbacks
  const url = safeOverviewData.url || '';
  const website = safeOverviewData.website || '';
  const pageTitle = titleAnalysis.title || 'No title';

  // TODO: Create component for FAQ schema opportunities detection
  const faqOpportunities = useMemo(() => {
    const h4Headers = headerAnalysis.groupedHeaders.H4 || [];
    console.log("[SEO ANALYSIS] FAQ opportunities from H4 headers:", h4Headers);
    // TODO: Create FAQSchemaAnalyzer component
    return h4Headers;
  }, [headerAnalysis.groupedHeaders]);

  return (
    <div className="w-full h-full bg-textured text-gray-800 dark:text-gray-200 p-4 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Page Title */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">SEO Analysis</h1>
          <div className="flex items-center">
            <span className="text-gray-500 dark:text-gray-400 text-sm">{website}</span>
            {website && url && <span className="mx-2 text-gray-400">•</span>}
            {url && (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm truncate">
                {url}
              </a>
            )}
          </div>
        </div>
        
        {/* Navigation Tabs */}
        <div className="mb-6 border-b border-border">
          <nav className="flex space-x-6">
            <button
              onClick={() => setActiveSection('overview')}
              className={`py-3 px-1 font-medium text-sm border-b-2 ${
                activeSection === 'overview'
                  ? 'border-blue-500 text-blue-500 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveSection('content')}
              className={`py-3 px-1 font-medium text-sm border-b-2 ${
                activeSection === 'content'
                  ? 'border-blue-500 text-blue-500 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Content Structure
            </button>
            <button
              onClick={() => setActiveSection('suggestions')}
              className={`py-3 px-1 font-medium text-sm border-b-2 ${
                activeSection === 'suggestions'
                  ? 'border-blue-500 text-blue-500 dark:text-blue-400 dark:border-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              Suggestions
            </button>
          </nav>
        </div>
        
        {/* Overview Section */}
        {activeSection === 'overview' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {/* Score Card */}
              <div className="bg-textured rounded-lg shadow p-6 border-border">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">SEO Score</h3>
                  <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 text-sm font-medium px-2.5 py-0.5 rounded">Beta</div>
                </div>
                <div className="flex items-center justify-center">
                  <div className="relative w-32 h-32">
                    <svg className="w-full h-full" viewBox="0 0 36 36">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#E5E7EB"
                        strokeWidth="3"
                        strokeDasharray="100, 100"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#4F46E5"
                        strokeWidth="3"
                        strokeDasharray={`${seoScore}, 100`}
                      />
                      <text x="18" y="20.5" textAnchor="middle" fontSize="10" fill="currentColor" className="font-bold">{seoScore}/100</text>
                    </svg>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {seoScore >= 80 ? 'Excellent SEO metrics' : 
                     seoScore >= 60 ? 'Good SEO metrics, with some improvements needed' :
                     seoScore >= 40 ? 'Moderate SEO metrics, improvements recommended' :
                     'SEO metrics need significant improvement'}
                  </p>
                </div>
              </div>
              
              {/* Page Title Card */}
              <div className="bg-textured rounded-lg shadow p-6 border-border">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Page Title</h3>
                <p className="mb-2 text-sm text-gray-600 dark:text-gray-400">
                  Length: <span className={titleAnalysis.statusClass}>{titleAnalysis.length} characters</span>
                </p>
                <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                  Status: <span className={titleAnalysis.statusClass}>{titleAnalysis.status}</span>
                </p>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded border-border">
                  <p className="text-sm font-medium">{pageTitle || 'No title available'}</p>
                </div>
              </div>
              
              {/* Content Metrics Card */}
              <div className="bg-textured rounded-lg shadow p-6 border-border">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Content Metrics</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Character Count</span>
                    <span className="text-sm font-medium">{contentMetrics.charCount?.toLocaleString() || '0'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Lists</span>
                    <span className="text-sm font-medium">{contentMetrics.listCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Tables</span>
                    <span className="text-sm font-medium">{contentMetrics.tableCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Code Blocks</span>
                    <span className="text-sm font-medium">{contentMetrics.codeBlockCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Structured Content</span>
                    <span className="text-sm font-medium">{contentMetrics.hasStructuredContent ? 'Yes' : 'No'}</span>
                  </div>
                </div>
              </div>
            </div>
            
            {/* SEO Quick Actions */}
            <div className="bg-textured rounded-lg shadow p-6 border-border mb-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Quick Actions</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <button className="flex items-center justify-center px-4 py-2 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
                  </svg>
                  Preview in SERP
                </button>
                <button className="flex items-center justify-center px-4 py-2 bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-md text-sm font-medium hover:bg-green-100 dark:hover:bg-green-800 transition-colors">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"></path>
                  </svg>
                  Generate Meta Description
                </button>
                <button className="flex items-center justify-center px-4 py-2 bg-purple-50 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-md text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-800 transition-colors">
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"></path>
                  </svg>
                  Keyword Suggestions
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Content Structure Section */}
        {activeSection === 'content' && (
          <div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Heading Structure Card */}
              <div className="bg-textured rounded-lg shadow p-6 border-border">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Heading Structure</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">H1</span>
                    <div className="flex items-center">
                      <span className="text-sm mr-3">{headerAnalysis.groupedHeaders.H1?.length || 0}</span>
                      <div className={`w-16 h-2 rounded-full ${headerAnalysis.hasProperH1 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">H2</span>
                    <div className="flex items-center">
                      <span className="text-sm mr-3">{headerAnalysis.groupedHeaders.H2?.length || 0}</span>
                      <div className={`w-16 h-2 rounded-full ${(headerAnalysis.groupedHeaders.H2?.length || 0) > 0 ? 'bg-green-500' : 'bg-red-500'}`}></div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">H3</span>
                    <div className="flex items-center">
                      <span className="text-sm mr-3">{headerAnalysis.groupedHeaders.H3?.length || 0}</span>
                      <div className="w-16 h-2 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium">H4</span>
                    <div className="flex items-center">
                      <span className="text-sm mr-3">{headerAnalysis.groupedHeaders.H4?.length || 0}</span>
                      <div className="w-16 h-2 rounded-full bg-gray-300 dark:bg-gray-600"></div>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Content Length Analysis */}
              <div className="bg-textured rounded-lg shadow p-6 border-border">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Content Length</h3>
                <div className="mb-4">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Character Count</span>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{contentMetrics.charCount.toLocaleString()}</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                    <div 
                      className={`h-2.5 rounded-full ${contentMetrics.contentLengthClass}`} 
                      style={{ width: `${Math.min((contentMetrics.charCount / 5000) * 100, 100)}%` }}
                    ></div>
                  </div>
                </div>
                <div className="mb-4">
                  <div className="flex justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Estimated Word Count</span>
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{contentMetrics.estimatedWordCount.toLocaleString()}</span>
                  </div>
                </div>
                <div className="p-3 bg-gray-50 dark:bg-gray-700 rounded border-border">
                  <div className="flex items-center">
                    <div className={`w-3 h-3 rounded-full mr-2 ${contentMetrics.contentLengthClass.replace('bg-', 'bg-')}`}></div>
                    <p className="text-sm">{contentMetrics.contentLengthMessage}</p>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Heading Structure Visualization */}
            <div className="bg-textured rounded-lg shadow p-6 border-border mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Page Outline</h3>
                <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                  Check Hierarchy
                </button>
              </div>
              <div className="space-y-3">
                {headerAnalysis.headers.length > 0 ? (
                  headerAnalysis.headers.map((header, index) => {
                    const level = header.tag;
                    const text = header.text;
                    
                    let paddingClass = 'pl-0';
                    let colorClass = 'text-gray-900 dark:text-white';
                    
                    if (level === 'H2') {
                      paddingClass = 'pl-4';
                      colorClass = 'text-gray-800 dark:text-gray-200';
                    } else if (level === 'H3') {
                      paddingClass = 'pl-8';
                      colorClass = 'text-gray-700 dark:text-gray-300';
                    } else if (level === 'H4') {
                      paddingClass = 'pl-12';
                      colorClass = 'text-gray-600 dark:text-gray-400';
                    }
                    
                    return (
                      <div key={index} className={`flex items-start ${paddingClass}`}>
                        <span className="inline-block w-8 text-xs font-semibold text-gray-500 dark:text-gray-400">{level}:</span>
                        <span className={`text-sm ${colorClass}`}>{text}</span>
                      </div>
                    );
                  })
                ) : (
                  <p className="text-gray-500 dark:text-gray-400 text-center py-4">No headers found in content.</p>
                )}
              </div>
            </div>
          </div>
        )}
        
        {/* Suggestions Section */}
        {activeSection === 'suggestions' && (
          <div>
            <div className="bg-textured rounded-lg shadow p-6 border-border mb-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">SEO Improvement Suggestions</h3>
                <button className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 flex items-center">
                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path>
                  </svg>
                  Export Report
                </button>
              </div>
              
              {suggestions.length > 0 ? (
                <div className="space-y-4">
                  {suggestions.map((suggestion, index) => (
                    <div key={index} className="flex items-start p-3 bg-gray-50 dark:bg-gray-700 rounded border-border">
                      <div className={`flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full mr-3 ${
                        suggestion.priority === 'high' ? 'bg-red-100 dark:bg-red-900' :
                        suggestion.priority === 'medium' ? 'bg-yellow-100 dark:bg-yellow-900' :
                        'bg-blue-100 dark:bg-blue-900'
                      }`}>
                        <svg className={`w-4 h-4 ${
                          suggestion.priority === 'high' ? 'text-red-600 dark:text-red-400' :
                          suggestion.priority === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
                          'text-blue-600 dark:text-blue-400'
                        }`} fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
                        </svg>
                      </div>
                      <div>
                        <div className="flex items-center mb-1">
                          <span className={`text-xs font-medium px-2 py-1 rounded ${
                            suggestion.priority === 'high' ? 'bg-red-200 text-red-800 dark:bg-red-800 dark:text-red-200' :
                            suggestion.priority === 'medium' ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200' :
                            'bg-blue-200 text-blue-800 dark:bg-blue-800 dark:text-blue-200'
                          }`}>
                            {suggestion.priority.toUpperCase()}
                          </span>
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{suggestion.type}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{suggestion.message}</p>
                        <button className="mt-2 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300">
                          Fix automatically
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center p-6 bg-gray-50 dark:bg-gray-700 rounded border-border">
                  <svg className="w-6 h-6 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                  </svg>
                  <p className="text-gray-700 dark:text-gray-300">No suggestions found. This page follows all SEO best practices!</p>
                </div>
              )}
            </div>
            
            {/* Additional Improvement Tools */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="bg-textured rounded-lg shadow p-6 border-border">
                <div className="flex items-center mb-4">
                  <svg className="w-5 h-5 text-blue-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Keyword Analysis</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Analyze keyword usage and identify opportunities for improvement.</p>
                <button className="w-full px-4 py-2 bg-blue-50 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-md text-sm font-medium hover:bg-blue-100 dark:hover:bg-blue-800 transition-colors">
                  Run Analysis
                </button>
              </div>
              
              <div className="bg-textured rounded-lg shadow p-6 border-border">
                <div className="flex items-center mb-4">
                  <svg className="w-5 h-5 text-purple-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path>
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Content Enhancement</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Get AI-powered suggestions to improve content quality.</p>
                <button className="w-full px-4 py-2 bg-purple-50 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded-md text-sm font-medium hover:bg-purple-100 dark:hover:bg-purple-800 transition-colors">
                  Enhance Content
                </button>
              </div>
              
              <div className="bg-textured rounded-lg shadow p-6 border-border">
                <div className="flex items-center mb-4">
                  <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path>
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white">Schema Markup</h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Generate schema markup to help search engines understand your content.</p>
                <button className="w-full px-4 py-2 bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-300 rounded-md text-sm font-medium hover:bg-green-100 dark:hover:bg-green-800 transition-colors">
                  Generate Schema
                </button>
              </div>
            </div>
            
            {/* FAQ Schema Section */}
            <div className="bg-textured rounded-lg shadow p-6 border-border">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">FAQ Schema Opportunity</h3>
                <span className={`text-xs font-medium px-2.5 py-0.5 rounded ${
                  faqOpportunities.length > 0 
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' 
                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
                }`}>
                  {faqOpportunities.length > 0 ? 'High Impact' : 'Low Impact'}
                </span>
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                {faqOpportunities.length > 0 
                  ? `We've detected ${faqOpportunities.length} potential FAQ items on this page. Adding FAQ schema can improve how you appear in Google's search results.`
                  : 'No FAQ items detected. Consider adding FAQ content to improve how you show up in search.'}
              </p>
              
              {faqOpportunities.length > 0 && (
                <div className="bg-gray-50 dark:bg-gray-700 rounded p-4 mb-4 border-border">
                  <h4 className="font-medium text-sm mb-2">Detected FAQs:</h4>
                  <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                    {faqOpportunities.slice(0, 4).map((faq, index) => (
                      <li key={index} className="flex items-center">
                        <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        {faq}
                      </li>
                    ))}
                    {faqOpportunities.length > 4 && (
                      <li className="flex items-center">
                        <svg className="w-4 h-4 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path>
                        </svg>
                        <span className="text-gray-400">+{faqOpportunities.length - 4} more questions</span>
                      </li>
                    )}
                  </ul>
                </div>
              )}
              
              <div className="flex space-x-3">
                <button className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-md text-sm font-medium transition-colors">
                  Generate FAQ Schema
                </button>
                <button className="px-4 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-md text-sm font-medium transition-colors">
                  Preview
                </button>
              </div>
            </div>
          </div>
        )}
        
        {/* Footer with Options */}
        <div className="mt-8 flex justify-between items-center">
          <div className="flex space-x-2">
            <button className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              Export Report
            </button>
            <button className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">
              Schedule Analysis
            </button>
          </div>
          
          <button className="px-3 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex items-center">
            <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Rescan Page
          </button>
        </div>
      </div>
    </div>
  );
};

export default SEOAnalysisPage;