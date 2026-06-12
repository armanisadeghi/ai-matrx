"use client";

import React, { useState } from "react";
import {
  Plus,
  Table,
  Briefcase,
  Smile,
  Target,
  Scissors,
  BookOpen,
  TrendingUp,
  BarChart3,
  Languages,
  Users,
  CheckCircle,
  Lightbulb,
  Zap,
  FileText,
  Globe,
  Brain,
  Award,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ReviseActionConfig {
  // Quick action buttons (no additional input needed)
  showCreativeOptions?: boolean;
  showExpandContent?: boolean;
  showTableView?: boolean;
  showProfessionalTone?: boolean;
  showCasualTone?: boolean;
  showOptimizeForSEO?: boolean;
  showMakeConcise?: boolean;
  showAddExamples?: boolean;
  showFactCheck?: boolean;
  showAddSources?: boolean;

  // Input-based actions
  showCustomComments?: boolean;
  showTargetAudience?: boolean;
  showLanguageTranslate?: boolean;
  showComplexityLevel?: boolean;
  showLengthAdjustment?: boolean;
  showStyleVariation?: boolean;
}

interface ReviseCommentsModalProps {
  // Original component props
  appletId: string;
  taskId: string;
  className?: string;
  content?: string;
  data?: any;

  // Modal-specific props
  showReviseModal: boolean;
  setShowReviseModal: (show: boolean) => void;
  reviseComments: string;
  setReviseComments: (comments: string) => void;
  onSubmit: (action: string, value?: string) => void;

  // Configuration for available actions
  actionConfig?: ReviseActionConfig;
}

export default function ReviseCommentsModal({
  appletId,
  taskId,
  className,
  content,
  data,
  showReviseModal,
  setShowReviseModal,
  reviseComments,
  setReviseComments,
  onSubmit,
  actionConfig = {},
}: ReviseCommentsModalProps) {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);
  const [customInput, setCustomInput] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [selectedLanguage, setSelectedLanguage] = useState("");
  const [complexityLevel, setComplexityLevel] = useState("");
  const [lengthPreference, setLengthPreference] = useState("");
  const [styleVariation, setStyleVariation] = useState("");

  // For now, hard-code all conditions to true to show all options
  const config = {
    showCreativeOptions: true,
    showExpandContent: true,
    showTableView: true,
    showProfessionalTone: true,
    showCasualTone: true,
    showOptimizeForSEO: true,
    showMakeConcise: true,
    showAddExamples: true,
    showFactCheck: true,
    showAddSources: true,
    showCustomComments: true,
    showTargetAudience: true,
    showLanguageTranslate: true,
    showComplexityLevel: true,
    showLengthAdjustment: true,
    showStyleVariation: true,
    ...actionConfig,
  };

  const handleQuickAction = (action: string) => {
    onSubmit(action);
    handleClose();
  };

  const handleInputAction = (action: string, value: string) => {
    if (value.trim()) {
      onSubmit(action, value);
      handleClose();
    }
  };

  const handleClose = () => {
    setShowReviseModal(false);
    setReviseComments("");
    setSelectedAction(null);
    setCustomInput("");
    setTargetAudience("");
    setSelectedLanguage("");
    setComplexityLevel("");
    setLengthPreference("");
    setStyleVariation("");
  };

  const quickActions = [
    {
      key: "creative",
      label: "More Creative",
      icon: Lightbulb,
      show: config.showCreativeOptions,
    },
    {
      key: "expand",
      label: "Expand Content",
      icon: Plus,
      show: config.showExpandContent,
    },
    {
      key: "table",
      label: "Show as Table",
      icon: Table,
      show: config.showTableView,
    },
    {
      key: "professional",
      label: "More Professional",
      icon: Briefcase,
      show: config.showProfessionalTone,
    },
    {
      key: "casual",
      label: "More Casual",
      icon: Smile,
      show: config.showCasualTone,
    },
    {
      key: "seo",
      label: "Optimize for SEO",
      icon: TrendingUp,
      show: config.showOptimizeForSEO,
    },
    {
      key: "concise",
      label: "Make Concise",
      icon: Scissors,
      show: config.showMakeConcise,
    },
    {
      key: "examples",
      label: "Add Examples",
      icon: BookOpen,
      show: config.showAddExamples,
    },
    {
      key: "factcheck",
      label: "Fact Check",
      icon: CheckCircle,
      show: config.showFactCheck,
    },
    {
      key: "sources",
      label: "Add Sources",
      icon: FileText,
      show: config.showAddSources,
    },
  ];

  const inputActions = [
    {
      key: "custom",
      label: "Custom Comments",
      icon: MessageSquare,
      show: config.showCustomComments,
    },
    {
      key: "audience",
      label: "Target Audience",
      icon: Users,
      show: config.showTargetAudience,
    },
    {
      key: "translate",
      label: "Translate",
      icon: Languages,
      show: config.showLanguageTranslate,
    },
    {
      key: "complexity",
      label: "Complexity Level",
      icon: Brain,
      show: config.showComplexityLevel,
    },
    {
      key: "length",
      label: "Adjust Length",
      icon: BarChart3,
      show: config.showLengthAdjustment,
    },
    {
      key: "style",
      label: "Style Variation",
      icon: Award,
      show: config.showStyleVariation,
    },
  ];

  if (!showReviseModal) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90dvh] overflow-hidden border border-slate-100 dark:border-slate-700">
        <div className="p-6">
          <h3 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">
            Revise Content
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Choose how you'd like to improve or modify the content:
          </p>

          {/* Quick Actions */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Quick Actions
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {quickActions
                .filter((action) => action.show)
                .map((action) => (
                  <button
                    key={action.key}
                    onClick={() => handleQuickAction(action.key)}
                    className="flex items-center gap-2 p-3 text-sm bg-slate-50 hover:bg-slate-100 dark:bg-slate-700/50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg transition-all duration-200 border border-slate-200 dark:border-slate-600"
                  >
                    <action.icon size={16} />
                    {action.label}
                  </button>
                ))}
            </div>
          </div>

          {/* Input-Based Actions */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
              Customize
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
              {inputActions
                .filter((action) => action.show)
                .map((action) => (
                  <button
                    key={action.key}
                    onClick={() =>
                      setSelectedAction(
                        selectedAction === action.key ? null : action.key,
                      )
                    }
                    className={`flex items-center gap-2 p-3 text-sm rounded-lg transition-all duration-200 border ${
                      selectedAction === action.key
                        ? "bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-600 dark:text-indigo-300"
                        : "bg-slate-50 hover:bg-slate-100 dark:bg-slate-700/50 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600"
                    }`}
                  >
                    <action.icon size={16} />
                    <span className="flex-1 text-left">{action.label}</span>
                    <ChevronRight size={14} className="opacity-50" />
                  </button>
                ))}
            </div>

            {/* Dynamic Input Fields */}
            {selectedAction === "custom" && (
              <div className="space-y-3">
                <textarea
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  placeholder="Describe how you'd like the content to be revised..."
                  className="w-full h-24 p-3 border border-slate-300 dark:border-slate-600 rounded-lg resize-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all duration-200 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400"
                  autoFocus
                />
                <button
                  onClick={() => handleInputAction("custom", customInput)}
                  disabled={!customInput.trim()}
                  className="w-full px-4 py-2 bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed font-medium"
                >
                  Apply Custom Revision
                </button>
              </div>
            )}

            {selectedAction === "audience" && (
              <div className="space-y-3">
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g., college students, business executives, general public..."
                  className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all duration-200 bg-white dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 placeholder-slate-500 dark:placeholder-slate-400"
                  autoFocus
                />
                <button
                  onClick={() => handleInputAction("audience", targetAudience)}
                  disabled={!targetAudience.trim()}
                  className="w-full px-4 py-2 bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed font-medium"
                >
                  Tailor for Audience
                </button>
              </div>
            )}

            {selectedAction === "translate" && (
              <div className="space-y-3">
                <Select
                  value={selectedLanguage}
                  onValueChange={setSelectedLanguage}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800/50 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 dark:text-slate-200">
                    <SelectValue placeholder="Select language..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectItem
                      value="spanish"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Spanish
                    </SelectItem>
                    <SelectItem
                      value="french"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      French
                    </SelectItem>
                    <SelectItem
                      value="german"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      German
                    </SelectItem>
                    <SelectItem
                      value="italian"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Italian
                    </SelectItem>
                    <SelectItem
                      value="portuguese"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Portuguese
                    </SelectItem>
                    <SelectItem
                      value="chinese"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Chinese
                    </SelectItem>
                    <SelectItem
                      value="japanese"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Japanese
                    </SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() =>
                    handleInputAction("translate", selectedLanguage)
                  }
                  disabled={!selectedLanguage}
                  className="w-full px-4 py-2 bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed font-medium"
                >
                  Translate Content
                </button>
              </div>
            )}

            {selectedAction === "complexity" && (
              <div className="space-y-3">
                <Select
                  value={complexityLevel}
                  onValueChange={setComplexityLevel}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800/50 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 dark:text-slate-200">
                    <SelectValue placeholder="Select complexity level..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectItem
                      value="elementary"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Elementary (Grade 1-5)
                    </SelectItem>
                    <SelectItem
                      value="middle"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Middle School (Grade 6-8)
                    </SelectItem>
                    <SelectItem
                      value="high"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      High School (Grade 9-12)
                    </SelectItem>
                    <SelectItem
                      value="college"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      College Level
                    </SelectItem>
                    <SelectItem
                      value="professional"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Professional/Expert
                    </SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() =>
                    handleInputAction("complexity", complexityLevel)
                  }
                  disabled={!complexityLevel}
                  className="w-full px-4 py-2 bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed font-medium"
                >
                  Adjust Complexity
                </button>
              </div>
            )}

            {selectedAction === "length" && (
              <div className="space-y-3">
                <Select
                  value={lengthPreference}
                  onValueChange={setLengthPreference}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800/50 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 dark:text-slate-200">
                    <SelectValue placeholder="Select length preference..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectItem
                      value="much-shorter"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Much Shorter (50% less)
                    </SelectItem>
                    <SelectItem
                      value="shorter"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Shorter (25% less)
                    </SelectItem>
                    <SelectItem
                      value="longer"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Longer (25% more)
                    </SelectItem>
                    <SelectItem
                      value="much-longer"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Much Longer (50% more)
                    </SelectItem>
                    <SelectItem
                      value="detailed"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Very Detailed
                    </SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() => handleInputAction("length", lengthPreference)}
                  disabled={!lengthPreference}
                  className="w-full px-4 py-2 bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed font-medium"
                >
                  Adjust Length
                </button>
              </div>
            )}

            {selectedAction === "style" && (
              <div className="space-y-3">
                <Select
                  value={styleVariation}
                  onValueChange={setStyleVariation}
                >
                  <SelectTrigger className="w-full bg-white dark:bg-slate-800/50 border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-slate-800 dark:text-slate-200">
                    <SelectValue placeholder="Select style variation..." />
                  </SelectTrigger>
                  <SelectContent className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                    <SelectItem
                      value="persuasive"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Persuasive
                    </SelectItem>
                    <SelectItem
                      value="informative"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Informative
                    </SelectItem>
                    <SelectItem
                      value="conversational"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Conversational
                    </SelectItem>
                    <SelectItem
                      value="academic"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Academic
                    </SelectItem>
                    <SelectItem
                      value="creative"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Creative
                    </SelectItem>
                    <SelectItem
                      value="technical"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Technical
                    </SelectItem>
                    <SelectItem
                      value="emotional"
                      className="text-slate-800 dark:text-slate-200 focus:bg-slate-100 dark:focus:bg-slate-700"
                    >
                      Emotional
                    </SelectItem>
                  </SelectContent>
                </Select>
                <button
                  onClick={() => handleInputAction("style", styleVariation)}
                  disabled={!styleVariation}
                  className="w-full px-4 py-2 bg-indigo-500 hover:bg-indigo-600 dark:bg-indigo-500 dark:hover:bg-indigo-600 disabled:bg-slate-400 dark:disabled:bg-slate-600 text-white rounded-lg transition-all duration-200 disabled:cursor-not-allowed font-medium"
                >
                  Apply Style
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-600">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-all duration-200"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
