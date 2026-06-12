import React, { useState, useMemo } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { BarChart, ExternalLink, FileText, Search } from "lucide-react";
import ScraperDataUtils from "../utils/data-utils";

interface Overview {
  uuid: string;
  website: string;
  url: string;
  unique_page_name: string;
  page_title: string;
  has_structured_content: boolean;
  table_count: number;
  code_block_count: number;
  list_count: number;
  outline: { [key: string]: string[] };
  char_count: number;
}

const HeaderAnalysis = ({ overview }: { overview: Overview }) => {
  const [activeTab, setActiveTab] = useState("headers");

  // Use ScraperDataUtils for all data processing
  const headerAnalysis = useMemo(() => {
    return ScraperDataUtils.analyzeHeaders(overview.outline);
  }, [overview.outline]);

  const headerDistribution = useMemo(() => {
    return ScraperDataUtils.getHeaderDistribution(headerAnalysis.groupedHeaders);
  }, [headerAnalysis.groupedHeaders]);

  const headerColors = {
    H1: { bg: "bg-gradient-to-r from-purple-600 to-indigo-600", text: "text-white", hover: "hover:from-purple-700 hover:to-indigo-700" },
    H2: { bg: "bg-gradient-to-r from-blue-500 to-cyan-500", text: "text-white", hover: "hover:from-blue-600 hover:to-cyan-600" },
    H3: { bg: "bg-gradient-to-r from-teal-500 to-emerald-500", text: "text-white", hover: "hover:from-teal-600 hover:to-emerald-600" },
    H4: { bg: "bg-gradient-to-r from-amber-500 to-orange-500", text: "text-white", hover: "hover:from-amber-600 hover:to-orange-600" },
    H5: { bg: "bg-gradient-to-r from-rose-500 to-pink-500", text: "text-white", hover: "hover:from-rose-600 hover:to-pink-600" },
    H6: { bg: "bg-gradient-to-r from-gray-500 to-slate-500", text: "text-white", hover: "hover:from-gray-600 hover:to-slate-600" },
  };

  const headerSizes = {
    H1: "text-2xl font-bold",
    H2: "text-xl font-semibold",
    H3: "text-lg font-medium",
    H4: "text-base font-medium",
    H5: "text-sm font-medium",
    H6: "text-sm font-normal",
  };

  return (
    <div className="w-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 min-h-dvh">
      <div className="max-w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* Hero section */}
        <div className="mb-8 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-xl overflow-hidden">
          <div className="px-6 py-12 sm:px-12 sm:py-16 md:py-20 lg:py-24 relative">
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 to-indigo-700/30 backdrop-blur-sm"></div>
            <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between">
              <div className="mb-6 md:mb-0">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-4 leading-tight">
                  SEO Header Analysis
                </h1>
                <div className="flex items-center">
                  <ExternalLink className="text-white/80 mr-2 h-5 w-5" />
                  <a 
                    href={overview.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-white/90 hover:text-white underline decoration-1 underline-offset-4 text-lg font-medium"
                  >
                    {overview.url}
                  </a>
                </div>
              </div>
              
              <div className="flex space-x-3">
                <div className="bg-white/10 backdrop-blur-md rounded-lg px-4 py-3 text-center">
                  <div className="text-white/80 text-sm font-medium mb-1">Headers</div>
                  <div className="text-white text-2xl font-bold">{headerAnalysis.totalHeaders}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-lg px-4 py-3 text-center">
                  <div className="text-white/80 text-sm font-medium mb-1">Tables</div>
                  <div className="text-white text-2xl font-bold">{overview.table_count}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-lg px-4 py-3 text-center">
                  <div className="text-white/80 text-sm font-medium mb-1">Lists</div>
                  <div className="text-white text-2xl font-bold">{overview.list_count}</div>
                </div>
                <div className="bg-white/10 backdrop-blur-md rounded-lg px-4 py-3 text-center">
                  <div className="text-white/80 text-sm font-medium mb-1">Code</div>
                  <div className="text-white text-2xl font-bold">{overview.code_block_count}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="mb-8 flex space-x-2 overflow-x-auto pb-2">
          <button
            onClick={() => setActiveTab("headers")}
            className={`px-5 py-3 rounded-lg flex items-center font-medium transition-all duration-200 ${
              activeTab === "headers"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200"
            }`}
          >
            <FileText className="mr-2 h-5 w-5" />
            Headers Analysis
          </button>
          <button
            onClick={() => setActiveTab("overview")}
            className={`px-5 py-3 rounded-lg flex items-center font-medium transition-all duration-200 ${
              activeTab === "overview"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200"
            }`}
          >
            <BarChart className="mr-2 h-5 w-5" />
            Content Overview
          </button>
          <button
            onClick={() => setActiveTab("seo")}
            className={`px-5 py-3 rounded-lg flex items-center font-medium transition-all duration-200 ${
              activeTab === "seo"
                ? "bg-indigo-600 text-white shadow-md"
                : "bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200"
            }`}
          >
            <Search className="mr-2 h-5 w-5" />
            SEO Recommendations
          </button>
        </div>

        {/* Main content */}
        {activeTab === "headers" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Header Distribution */}
            <div className="bg-textured rounded-xl shadow-md p-6 border-border">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Header Distribution</h2>
              
              <div className="space-y-4">
                {Object.entries(headerDistribution).map(([tag, stats]) => (
                  <div key={tag} className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{tag}</span>
                      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{stats.count}</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div 
                        className={`${headerColors[tag].bg} rounded-full h-3`} 
                        style={{ width: `${stats.percentage}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Header Hierarchy Check */}
            <div className="bg-textured rounded-xl shadow-md p-6 border-border">
              <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Header Hierarchy</h2>
              
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg mb-4">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full ${
                    headerAnalysis.hasProperH1 ? 'bg-green-500' : 'bg-amber-500'
                  } mr-2`}></div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {headerAnalysis.hasProperH1 
                      ? 'One H1 tag (recommended)' 
                      : headerAnalysis.h1Count > 1 
                        ? `Multiple H1 tags (${headerAnalysis.h1Count})`
                        : 'No H1 tag found'}
                  </p>
                </div>
              </div>
              
              <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg mb-4">
                <div className="flex items-center">
                  <div className={`w-3 h-3 rounded-full ${
                    headerAnalysis.hasProperHierarchy ? 'bg-green-500' : 'bg-red-500'
                  } mr-2`}></div>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {headerAnalysis.hasProperHierarchy 
                      ? 'Proper header hierarchy' 
                      : 'Improper header hierarchy'}
                  </p>
                </div>
              </div>
              
              {headerAnalysis.hierarchyIssues.length > 0 && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg mb-4">
                  <h4 className="text-sm font-medium text-red-800 dark:text-red-300 mb-2">Issues Found:</h4>
                  <ul className="text-sm text-red-700 dark:text-red-400 space-y-1">
                    {headerAnalysis.hierarchyIssues.map((issue, index) => (
                      <li key={index}>• {issue}</li>
                    ))}
                  </ul>
                </div>
              )}
              
              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p>Proper hierarchy follows H1 → H2 → H3 → H4 → H5 → H6 without skipping levels.</p>
              </div>
            </div>

            {/* Header Details */}
            <div className="bg-textured rounded-xl shadow-md col-span-1 lg:col-span-2 border-border">
              <div className="p-6">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Header Details</h2>
              </div>

              {Object.keys(headerAnalysis.groupedHeaders).length === 0 ? (
                <div className="px-6 pb-6">
                  <p className="text-gray-500 dark:text-gray-400 text-center py-8">No headers found in the outline.</p>
                </div>
              ) : (
                <div className="px-2 pb-6">
                  <Accordion type="multiple" className="w-full space-y-3">
                    {Object.entries(headerAnalysis.groupedHeaders).map(([tag, texts], index) => (
                      <AccordionItem key={tag} value={`item-${index}`} className="border-none px-4">
                        <AccordionTrigger
                          className={`${headerColors[tag].bg} ${headerColors[tag].hover} rounded-lg px-4 py-3 transition-all duration-200 shadow-sm`}
                        >
                          <div className="flex items-center">
                            <span className={`${headerColors[tag].text} ${headerSizes[tag]}`}>
                              {tag}
                            </span>
                            <div className="ml-3 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5">
                              <span className="text-white text-sm font-medium">{texts.length}</span>
                            </div>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="mt-3 space-y-2 px-1">
                          {texts.map((text, idx) => (
                            <div
                              key={idx}
                              className="p-4 rounded-lg bg-textured shadow-sm border-border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                            >
                              <span className={`${headerSizes[tag]} text-gray-800 dark:text-gray-200`}>{text}</span>
                            </div>
                          ))}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "overview" && (
          <div className="bg-textured rounded-xl shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">Content Overview</h2>
            <p className="text-gray-600 dark:text-gray-400">Content overview statistics and detailed information will appear here.</p>
          </div>
        )}

        {activeTab === "seo" && (
          <div className="bg-textured rounded-xl shadow-md p-6">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">SEO Recommendations</h2>
            <p className="text-gray-600 dark:text-gray-400">SEO recommendations based on header analysis will appear here.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeaderAnalysis;