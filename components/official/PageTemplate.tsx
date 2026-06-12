// File: components/official/PageTemplate.tsx

"use client";

import React, { ReactNode, useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ExternalLinkIcon, LucideIcon } from "lucide-react";

// Types
interface PageTemplateProps {
  title: string;
  subtitle?: string;
  url?: string;
  urlText?: string;
  statsItems?: StatItem[];
  tabs: TabItem[];
  defaultActiveTab?: string;
  heroSize?: 'xs' | 's' | 'm' | 'lg' | 'xl';
}

interface StatItem {
  label: string;
  value: number | string;
}

interface TabItem {
  id: string;
  label: string;
  icon: LucideIcon;
  content: ReactNode;
}

// Page Template Component
export const PageTemplate: React.FC<PageTemplateProps> = ({
  title,
  subtitle,
  url,
  urlText,
  statsItems = [],
  tabs,
  defaultActiveTab,
  heroSize = 'lg',
}) => {
  const [activeTab, setActiveTab] = useState(defaultActiveTab || tabs[0]?.id);
  
  // Hero size classes
  const heroSizeClasses = {
    xs: 'px-2 py-3 sm:px-4 sm:py-5',
    s: 'px-3 py-4 sm:px-6 sm:py-8',
    m: 'px-6 py-8 sm:px-10 sm:py-12',
    lg: 'px-6 py-10 sm:px-12 sm:py-16 md:py-20 lg:py-24',
    xl: 'px-8 py-14 sm:px-16 sm:py-20 md:py-24 lg:py-32'
  };

  // Hero text size classes for titles
  const heroTitleSizeClasses = {
    xs: 'text-xl md:text-2xl lg:text-3xl',
    s: 'text-2xl md:text-3xl lg:text-4xl',
    m: 'text-3xl md:text-4xl lg:text-5xl',
    lg: 'text-3xl md:text-4xl lg:text-5xl',
    xl: 'text-4xl md:text-5xl lg:text-6xl'
  };

  // Hero text size classes for subtitles
  const heroSubtitleSizeClasses = {
    xs: 'text-sm',
    s: 'text-base',
    m: 'text-lg',
    lg: 'text-lg',
    xl: 'text-xl'
  };

  return (
    <div className="w-full bg-gradient-to-b from-gray-50 to-white dark:from-gray-950 dark:to-gray-900 min-h-dvh">
      <div className="max-w-full px-2 sm:px-4 lg:px-6 py-4 ">
        {/* Hero section */}
        <div className="mb-8 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-2xl shadow-xl overflow-hidden">
          <div className={`${heroSizeClasses[heroSize]} relative rounded-2xl`}>
            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/30 to-indigo-700/30 backdrop-blur-sm rounded-2xl"></div>
            <div className="relative flex flex-col md:flex-row items-start md:items-center justify-between">
              <div className="mb-6 md:mb-0">
                <h1 className={`${heroTitleSizeClasses[heroSize]} font-extrabold text-white mb-4 leading-tight`}>
                  {title}
                </h1>
                {subtitle && (
                  <p className={`text-white/90 ${heroSubtitleSizeClasses[heroSize]} font-medium mb-2`}>{subtitle}</p>
                )}
                {url && (
                  <div className="flex items-center">
                    <ExternalLinkIcon className="text-white/80 mr-2 h-4 w-4" />
                    <a 
                      href={url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-white/90 hover:text-white hover:dark:text-gray-300 underline decoration-1 underline-offset-4 text-xs font-small"
                    >
                      {urlText || url}
                    </a>
                  </div>
                )}
              </div>
              
              {statsItems.length > 0 && (
                <div className="flex space-x-3 flex-wrap gap-y-3">
                  {statsItems.map((stat, index) => (
                    <div key={index} className="bg-white/10 backdrop-blur-md rounded-lg px-4 py-3 text-center">
                      <div className="text-white/80 text-sm font-medium mb-1">{stat.label}</div>
                      <div className="text-white text-2xl font-bold">{stat.value}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="mb-3 flex space-x-1 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 rounded-lg flex items-center font-medium transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-indigo-600 text-white shadow-md"
                  : "bg-white hover:bg-gray-100 text-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700 dark:text-gray-200"
              }`}
            >
              <tab.icon className="mr-2 h-5 w-5" />
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Main content */}
        {tabs.map((tab) => (
          <div key={tab.id} className={activeTab === tab.id ? "block" : "hidden"}>
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
};

// Card Component
interface CardProps {
  title: string;
  children: ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ title, children, className = "" }) => (
  <div className={`bg-textured rounded-xl shadow-md p-6 border-border ${className}`}>
    <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-4">{title}</h2>
    {children}
  </div>
);

// Grid Layout Component
interface GridProps {
  children: ReactNode;
  cols?: 1 | 2 | 3 | 4;
  gap?: 'small' | 'medium' | 'large';
}

export const Grid: React.FC<GridProps> = ({ 
  children, 
  cols = 1,
  gap = 'medium'
}) => {
  const gapClass = {
    small: 'gap-4',
    medium: 'gap-6',
    large: 'gap-8'
  }[gap];
  
  const colClass = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 lg:grid-cols-2',
    3: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4'
  }[cols];

  return (
    <div className={`grid ${colClass} ${gapClass}`}>
      {children}
    </div>
  );
};

// Progress Bar Component
interface ProgressBarProps {
  label: string;
  value: number;
  max: number;
  color?: string;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ 
  label, 
  value, 
  max,
  color = "bg-gradient-to-r from-blue-500 to-indigo-500"
}) => (
  <div className="relative">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{label}</span>
      <span className="text-sm font-medium text-gray-500 dark:text-gray-400">{value}</span>
    </div>
    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
      <div 
        className={`${color} rounded-full h-3`} 
        style={{ width: `${Math.min(100, (value / max) * 100)}%` }}
      ></div>
    </div>
  </div>
);

// Status Indicator Component
interface StatusIndicatorProps {
  status: 'success' | 'warning' | 'error' | 'info';
  text: string;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ status, text }) => {
  const statusColors = {
    success: 'bg-green-500',
    warning: 'bg-amber-500',
    error: 'bg-red-500',
    info: 'bg-blue-500'
  };

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-lg mb-4">
      <div className="flex items-center">
        <div className={`w-3 h-3 rounded-full ${statusColors[status]} mr-2`}></div>
        <p className="text-sm text-gray-700 dark:text-gray-300">{text}</p>
      </div>
    </div>
  );
};

// Header Group Component (for grouped headers as in the example)
interface HeaderGroupProps {
  tag: string;
  items: string[];
}

export const HeaderGroup: React.FC<HeaderGroupProps> = ({ tag, items }) => {
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
    <AccordionItem value={`item-${tag}`} className="border-none px-4">
      <AccordionTrigger
        className={`${headerColors[tag].bg} ${headerColors[tag].hover} rounded-lg px-4 py-3 transition-all duration-200 shadow-sm`}
      >
        <div className="flex items-center">
          <span className={`${headerColors[tag].text} ${headerSizes[tag]}`}>
            {tag}
          </span>
          <div className="ml-3 bg-white/20 backdrop-blur-sm rounded-full px-2 py-0.5">
            <span className="text-white text-sm font-medium">{items.length}</span>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="mt-3 space-y-2 px-1">
        {items.map((text, idx) => (
          <div
            key={idx}
            className="p-4 rounded-lg bg-textured shadow-sm border-border hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            <span className={`${headerSizes[tag]} text-gray-800 dark:text-gray-200`}>{text}</span>
          </div>
        ))}
      </AccordionContent>
    </AccordionItem>
  );
};

// Exporting icons to be used in the tab system
export { 
  BarChart as BarChartIcon,
  ExternalLink as ExternalLinkIcon, 
  FileText as FileTextIcon, 
  Search as SearchIcon 
} from 'lucide-react';