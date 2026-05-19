"use client";
import React from 'react';
import { GitBranch, HelpCircle, Target, CheckCircle2, XCircle, Zap, ArrowRight } from 'lucide-react';

interface DecisionTreeLoadingVisualizationProps {
  title?: string;
}

const DecisionTreeLoadingVisualization: React.FC<DecisionTreeLoadingVisualizationProps> = ({ 
  title = "Loading Decision Tree..." 
}) => {
  return (
    <div className="w-full max-w-5xl mx-auto py-8">
      <div className="bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-pink-950/40 rounded-2xl p-8 shadow-lg border-2 border-indigo-200 dark:border-indigo-800/50">
        
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            <div className="p-4 bg-indigo-500 dark:bg-indigo-600 rounded-2xl shadow-lg">
              <GitBranch className="h-12 w-12 text-white animate-pulse" />
            </div>
            
            {/* Floating decision icons */}
            <div className="absolute -top-2 -right-2 animate-bounce">
              <div className="p-1.5 bg-green-500 dark:bg-green-600 rounded-full">
                <CheckCircle2 className="h-4 w-4 text-white" />
              </div>
            </div>
            <div className="absolute -bottom-1 -left-2 animate-bounce delay-300">
              <div className="p-1.5 bg-red-500 dark:bg-red-600 rounded-full">
                <XCircle className="h-4 w-4 text-white" />
              </div>
            </div>
            <div className="absolute top-0 left-8 animate-pulse delay-500">
              <Zap className="h-5 w-5 text-indigo-400 dark:text-indigo-300" />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {title}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Building interactive decision workflow...
          </p>
        </div>

        {/* Decision Tree Structure Preview */}
        <div className="bg-textured/50 rounded-xl border-border p-6 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <GitBranch className="h-5 w-5 text-indigo-600 dark:text-indigo-400 animate-pulse" />
            <div className="h-4 bg-indigo-300 dark:bg-indigo-600 rounded w-32 animate-pulse" />
          </div>
          
          {/* Root Node */}
          <div className="flex flex-col items-center space-y-6">
            <div className="flex items-center gap-3 p-4 bg-orange-100 dark:bg-orange-950/30 rounded-lg border-2 border-orange-300 dark:border-orange-700 animate-pulse">
              <HelpCircle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
              <div className="h-4 bg-orange-300 dark:bg-orange-600 rounded w-48" />
            </div>
            
            {/* Branch Connectors */}
            <div className="flex items-center gap-8">
              <div className="flex flex-col items-center space-y-3">
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded-full text-xs font-bold animate-pulse">
                    YES
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 animate-pulse" />
                </div>
                <div className="flex items-center gap-3 p-3 bg-purple-100 dark:bg-purple-950/30 rounded-lg border border-purple-300 dark:border-purple-700 animate-pulse" style={{ animationDelay: '200ms' }}>
                  <Target className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <div className="h-3 bg-purple-300 dark:bg-purple-600 rounded w-32" />
                </div>
              </div>
              
              <div className="flex flex-col items-center space-y-3">
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-full text-xs font-bold animate-pulse">
                    NO
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-400 animate-pulse" />
                </div>
                <div className="flex items-center gap-3 p-3 bg-blue-100 dark:bg-blue-950/30 rounded-lg border border-blue-300 dark:border-blue-700 animate-pulse" style={{ animationDelay: '400ms' }}>
                  <HelpCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <div className="h-3 bg-blue-300 dark:bg-blue-600 rounded w-28" />
                </div>
              </div>
            </div>
            
            {/* Sub-branches */}
            <div className="flex items-center gap-12">
              <div className="flex flex-col items-center space-y-2">
                <div className="flex items-center gap-1">
                  <div className="px-1.5 py-0.5 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded text-xs animate-pulse">Y</div>
                  <ArrowRight className="h-3 w-3 text-gray-300 animate-pulse" />
                </div>
                <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/20 rounded border border-green-200 dark:border-green-800 animate-pulse" style={{ animationDelay: '600ms' }}>
                  <Target className="h-3 w-3 text-green-500" />
                  <div className="h-2 bg-green-300 dark:bg-green-600 rounded w-20" />
                </div>
              </div>
              
              <div className="flex flex-col items-center space-y-2">
                <div className="flex items-center gap-1">
                  <div className="px-1.5 py-0.5 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded text-xs animate-pulse">N</div>
                  <ArrowRight className="h-3 w-3 text-gray-300 animate-pulse" />
                </div>
                <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-950/20 rounded border border-purple-200 dark:border-purple-800 animate-pulse" style={{ animationDelay: '800ms' }}>
                  <Target className="h-3 w-3 text-purple-500" />
                  <div className="h-2 bg-purple-300 dark:bg-purple-600 rounded w-24" />
                </div>
              </div>
              
              <div className="flex flex-col items-center space-y-2">
                <div className="flex items-center gap-1">
                  <div className="px-1.5 py-0.5 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded text-xs animate-pulse">Y</div>
                  <ArrowRight className="h-3 w-3 text-gray-300 animate-pulse" />
                </div>
                <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950/20 rounded border border-orange-200 dark:border-orange-800 animate-pulse" style={{ animationDelay: '1000ms' }}>
                  <Target className="h-3 w-3 text-orange-500" />
                  <div className="h-2 bg-orange-300 dark:bg-orange-600 rounded w-16" />
                </div>
              </div>
              
              <div className="flex flex-col items-center space-y-2">
                <div className="flex items-center gap-1">
                  <div className="px-1.5 py-0.5 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded text-xs animate-pulse">N</div>
                  <ArrowRight className="h-3 w-3 text-gray-300 animate-pulse" />
                </div>
                <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/20 rounded border border-blue-200 dark:border-blue-800 animate-pulse" style={{ animationDelay: '1200ms' }}>
                  <Target className="h-3 w-3 text-blue-500" />
                  <div className="h-2 bg-blue-300 dark:bg-blue-600 rounded w-18" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tree Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Questions', icon: HelpCircle, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-100 dark:bg-orange-950/30' },
            { label: 'Actions', icon: Target, color: 'text-purple-600 dark:text-purple-400', bgColor: 'bg-purple-100 dark:bg-purple-950/30' },
            { label: 'Branches', icon: GitBranch, color: 'text-indigo-600 dark:text-indigo-400', bgColor: 'bg-indigo-100 dark:bg-indigo-950/30' },
            { label: 'Outcomes', icon: CheckCircle2, color: 'text-green-600 dark:text-green-400', bgColor: 'bg-green-100 dark:bg-green-950/30' }
          ].map((stat, index) => (
            <div key={index} className="bg-textured/50 rounded-lg p-3 border-border animate-pulse" style={{ animationDelay: `${index * 150}ms` }}>
              <div className={`flex items-center gap-2 ${stat.color} mb-2`}>
                <div className={`p-1.5 ${stat.bgColor} rounded`}>
                  <stat.icon className="h-3 w-3" />
                </div>
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-12" />
              </div>
              <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-8" />
            </div>
          ))}
        </div>

        {/* Decision Path Preview */}
        <div className="bg-textured/50 rounded-xl border-border p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <ArrowRight className="h-5 w-5 text-blue-600 dark:text-blue-400 animate-pulse" />
            <div className="h-4 bg-blue-300 dark:bg-blue-600 rounded w-24 animate-pulse" />
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 bg-indigo-100 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 rounded-full text-sm font-medium animate-pulse">
              Start
            </span>
            <ArrowRight className="h-4 w-4 text-gray-400 animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-32 animate-pulse" />
              <div className="px-2 py-1 bg-green-100 dark:bg-green-950/30 text-green-700 dark:text-green-300 rounded-full text-xs font-bold animate-pulse">
                YES
              </div>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-400 animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-28 animate-pulse" />
              <div className="px-2 py-1 bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-full text-xs font-bold animate-pulse">
                NO
              </div>
            </div>
          </div>
        </div>

        {/* Processing Steps */}
        <div className="space-y-3 mb-8">
          {[
            { label: 'Parsing decision logic', progress: 90, color: 'from-indigo-500 to-purple-500' },
            { label: 'Building tree structure', progress: 75, color: 'from-purple-500 to-pink-500' },
            { label: 'Creating interactive nodes', progress: 60, color: 'from-pink-500 to-red-500' },
            { label: 'Setting up navigation', progress: 30, color: 'from-red-500 to-orange-500' }
          ].map((step, index) => (
            <div key={index} className="space-y-2 animate-pulse" style={{ animationDelay: `${index * 200}ms` }}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700 dark:text-gray-300 font-medium">{step.label}</span>
                <span className="text-gray-500 dark:text-gray-400">{step.progress}%</span>
              </div>
              <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full bg-gradient-to-r ${step.color} transition-all duration-1000`}
                  style={{ 
                    width: `${step.progress}%`,
                    animationDelay: `${index * 200 + 500}ms`
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Loading Text */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-textured/50 rounded-full border-border">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-purple-500 dark:bg-purple-400 rounded-full animate-bounce delay-100" />
              <div className="w-2 h-2 bg-pink-500 dark:bg-pink-400 rounded-full animate-bounce delay-200" />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              Preparing decision workflow
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DecisionTreeLoadingVisualization;
