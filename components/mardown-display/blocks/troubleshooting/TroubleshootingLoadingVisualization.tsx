"use client";
import React from "react";
import {
  HelpCircle,
  Bug,
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Stars,
  Zap,
} from "lucide-react";

interface TroubleshootingLoadingVisualizationProps {
  title?: string;
}

const TroubleshootingLoadingVisualization: React.FC<
  TroubleshootingLoadingVisualizationProps
> = ({ title = "Loading Troubleshooting Guide..." }) => {
  return (
    <div className="w-full max-w-5xl mx-auto py-8">
      <div className="bg-gradient-to-br from-red-100 via-orange-50 to-yellow-100 dark:from-red-950/40 dark:via-orange-950/30 dark:to-yellow-950/40 rounded-2xl p-8 shadow-lg border-2 border-red-200 dark:border-red-800/50">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-8">
          <div className="relative mb-4">
            <div className="p-4 bg-red-500 dark:bg-red-600 rounded-2xl shadow-lg">
              <HelpCircle className="h-12 w-12 text-white animate-pulse" />
            </div>

            {/* Floating diagnostic icons */}
            <div className="absolute -top-2 -right-2 animate-bounce">
              <div className="p-1.5 bg-orange-500 dark:bg-orange-600 rounded-full">
                <Bug className="h-4 w-4 text-white" />
              </div>
            </div>
            <div className="absolute -bottom-1 -left-2 animate-bounce delay-300">
              <div className="p-1.5 bg-green-500 dark:bg-green-600 rounded-full">
                <Wrench className="h-4 w-4 text-white" />
              </div>
            </div>
            <div className="absolute top-0 left-8 animate-pulse delay-500">
              <Stars className="h-5 w-5 text-red-400 dark:text-red-300" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
            {title}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            Analyzing issues and preparing solutions...
          </p>
        </div>

        {/* Diagnostic Process */}
        <div className="space-y-6 mb-8">
          {[
            {
              icon: AlertTriangle,
              title: "Identifying Issues",
              description: "Analyzing symptoms and error patterns",
              color: "text-red-600 dark:text-red-400",
              bgColor: "bg-red-100 dark:bg-red-950/30",
              progress: 85,
              delay: 0,
            },
            {
              icon: Bug,
              title: "Finding Root Causes",
              description: "Tracing problems to their source",
              color: "text-orange-600 dark:text-orange-400",
              bgColor: "bg-orange-100 dark:bg-orange-950/30",
              progress: 65,
              delay: 200,
            },
            {
              icon: Wrench,
              title: "Preparing Solutions",
              description: "Compiling step-by-step fixes",
              color: "text-green-600 dark:text-green-400",
              bgColor: "bg-green-100 dark:bg-green-950/30",
              progress: 40,
              delay: 400,
            },
            {
              icon: CheckCircle2,
              title: "Organizing Guide",
              description: "Structuring troubleshooting workflow",
              color: "text-blue-600 dark:text-blue-400",
              bgColor: "bg-blue-100 dark:bg-blue-950/30",
              progress: 20,
              delay: 600,
            },
          ].map((step, index) => (
            <div
              key={index}
              className="space-y-3 animate-pulse"
              style={{ animationDelay: `${step.delay}ms` }}
            >
              <div className="flex items-center gap-4">
                <div className={`p-3 ${step.bgColor} rounded-lg border-border`}>
                  <step.icon className={`h-5 w-5 ${step.color}`} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-semibold ${step.color}`}>
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {step.description}
                  </p>
                </div>
                <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                  {step.progress}%
                </div>
              </div>

              {/* Progress Bar */}
              <div className="ml-16 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={`h-full bg-gradient-to-r ${
                    step.color.includes("red")
                      ? "from-red-500 to-red-600"
                      : step.color.includes("orange")
                        ? "from-orange-500 to-orange-600"
                        : step.color.includes("green")
                          ? "from-green-500 to-green-600"
                          : "from-blue-500 to-blue-600"
                  } transition-all duration-1000 animate-pulse`}
                  style={{
                    width: `${step.progress}%`,
                    animationDelay: `${step.delay + 300}ms`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        {/* Issue Preview Cards */}
        <div className="grid md:grid-cols-2 gap-4 mb-8">
          {[1, 2, 3, 4].map((issue) => (
            <div
              key={issue}
              className="bg-textured/50 rounded-lg p-4 border-border animate-pulse"
              style={{ animationDelay: `${issue * 150}ms` }}
            >
              {/* Issue Header */}
              <div className="flex items-start gap-3 mb-3">
                <div
                  className={`p-2 rounded-lg ${
                    issue === 1
                      ? "bg-red-100 dark:bg-red-950/30"
                      : issue === 2
                        ? "bg-orange-100 dark:bg-orange-950/30"
                        : issue === 3
                          ? "bg-yellow-100 dark:bg-yellow-950/30"
                          : "bg-green-100 dark:bg-green-950/30"
                  }`}
                >
                  <div className="w-4 h-4 bg-gray-300 dark:bg-gray-600 rounded" />
                </div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded mb-2" />
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
                </div>
              </div>

              {/* Severity Badge */}
              <div className="mb-3">
                <div
                  className={`inline-block h-4 w-16 rounded-full ${
                    issue === 1
                      ? "bg-red-200 dark:bg-red-800"
                      : issue === 2
                        ? "bg-orange-200 dark:bg-orange-800"
                        : issue === 3
                          ? "bg-yellow-200 dark:bg-yellow-800"
                          : "bg-green-200 dark:bg-green-800"
                  }`}
                />
              </div>

              {/* Solutions Preview */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Wrench className="h-3 w-3 text-gray-400" />
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
                </div>
                <div className="flex items-center gap-2 ml-5">
                  <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded w-4" />
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
                </div>
                <div className="flex items-center gap-2 ml-5">
                  <div className="h-2 bg-gray-300 dark:bg-gray-600 rounded w-4" />
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded flex-1" />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Diagnostic Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            {
              label: "Issues Found",
              icon: AlertTriangle,
              color: "text-red-600 dark:text-red-400",
            },
            {
              label: "Root Causes",
              icon: Bug,
              color: "text-orange-600 dark:text-orange-400",
            },
            {
              label: "Solutions",
              icon: Wrench,
              color: "text-green-600 dark:text-green-400",
            },
            {
              label: "Steps",
              icon: CheckCircle2,
              color: "text-blue-600 dark:text-blue-400",
            },
          ].map((stat, index) => (
            <div
              key={index}
              className="bg-textured/50 rounded-lg p-3 border-border animate-pulse"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className={`flex items-center gap-2 ${stat.color} mb-2`}>
                <stat.icon className="h-4 w-4" />
                <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded w-12" />
              </div>
              <div className="h-6 bg-gray-300 dark:bg-gray-600 rounded w-8" />
            </div>
          ))}
        </div>

        {/* Solution Steps Preview */}
        <div className="bg-textured/50 rounded-xl border-border p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <Zap className="h-5 w-5 text-yellow-500 animate-pulse" />
            <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-32 animate-pulse" />
          </div>

          <div className="space-y-3">
            {[1, 2, 3].map((step) => (
              <div
                key={step}
                className="flex items-start gap-3 animate-pulse"
                style={{ animationDelay: `${step * 200}ms` }}
              >
                <div className="w-6 h-6 bg-gray-300 dark:bg-gray-600 rounded-full mt-1" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 bg-gray-300 dark:bg-gray-600 rounded" />
                  <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-4/5" />
                  <div className="bg-muted rounded p-2">
                    <div className="h-2 bg-muted-foreground/20 rounded w-3/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Loading Text */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-textured/50 rounded-full border-border">
            <div className="flex space-x-1">
              <div className="w-2 h-2 bg-red-500 dark:bg-red-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-orange-500 dark:bg-orange-400 rounded-full animate-bounce delay-100" />
              <div className="w-2 h-2 bg-yellow-500 dark:bg-yellow-400 rounded-full animate-bounce delay-200" />
            </div>
            <span className="text-sm text-gray-600 dark:text-gray-400 font-medium">
              Preparing diagnostic workflow
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TroubleshootingLoadingVisualization;
