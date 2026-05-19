"use client";

import { useState } from "react";
import { Plus, Upload, Wrench, Zap, LayoutPanelTop } from "lucide-react";
import { cn } from "@/lib/utils";
import { MobileOverlayWrapper } from "@/components/official/MobileOverlayWrapper";
import { PromptImporter } from "@/features/prompts/components/common/PromptImporter";
import { PromptGenerator } from "../actions/prompt-generator/PromptGenerator";
import { PromptBuilderModal } from "./PromptBuilderModal";
import { useRouter } from "next/navigation";
import { usePromptsBasePath } from "../../hooks/usePromptsBasePath";

interface NewPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ActionButtonProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
  onClick: () => void;
}

function ActionButton({
  icon,
  title,
  description,
  gradient,
  onClick,
}: ActionButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative overflow-hidden w-full rounded-xl p-4 text-left transition-all duration-200",
        "bg-gradient-to-br hover:brightness-105",
        "border border-border/50 hover:border-border",
        "shadow-md hover:shadow-xl",
        gradient,
      )}
    >
      <div className="relative z-10 flex items-center gap-3">
        <div className="flex-shrink-0 p-2.5 rounded-lg bg-background/90 backdrop-blur-sm shadow-sm">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
    </button>
  );
}

export function NewPromptModal({ isOpen, onClose }: NewPromptModalProps) {
  const router = useRouter();
  const basePath = usePromptsBasePath();
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isBuildOpen, setIsBuildOpen] = useState(false);

  if (!isOpen && !isImportOpen && !isGenerateOpen && !isBuildOpen) return null;

  const handleNewManual = () => {
    onClose();
    router.push(`${basePath}/new`);
  };

  const handleImport = () => {
    onClose();
    setIsImportOpen(true);
  };

  const handleBuild = () => {
    onClose();
    setIsBuildOpen(true);
  };

  const handleGenerate = () => {
    onClose();
    setIsGenerateOpen(true);
  };

  const handleTemplates = () => {
    onClose();
    router.push(`${basePath}/templates`);
  };

  const handleImportClose = () => {
    setIsImportOpen(false);
  };

  const handleImportSuccess = (promptId: string) => {
    setIsImportOpen(false);
    router.refresh();
  };

  return (
    <>
      {/* Main Modal */}
      <MobileOverlayWrapper
        isOpen={isOpen}
        onClose={onClose}
        title="Create New Prompt"
        maxHeight="lg"
      >
        {/* Action Buttons */}
        <div className="p-4 space-y-2.5">
          <ActionButton
            icon={<Plus className="h-5 w-5 text-primary" />}
            title="Create Manually"
            description="Start from scratch and write your custom prompt"
            gradient="from-primary/5 to-primary/10"
            onClick={handleNewManual}
          />

          <ActionButton
            icon={
              <Zap className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            }
            title="Generate with AI"
            description="Let AI create a prompt based on your exact requirements"
            gradient="from-purple-500/5 to-blue-500/10"
            onClick={handleGenerate}
          />

          <ActionButton
            icon={
              <Wrench className="h-5 w-5 text-green-600 dark:text-green-400" />
            }
            title="Build Interactively"
            description="Use the prompt builder for a guided experience and customize it"
            gradient="from-green-500/5 to-emerald-500/10"
            onClick={handleBuild}
          />

          <ActionButton
            icon={
              <Upload className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            }
            title="Import Prompt"
            description="Import an existing prompt from a JSON file and customize it"
            gradient="from-blue-500/5 to-cyan-500/10"
            onClick={handleImport}
          />

          <ActionButton
            icon={
              <LayoutPanelTop className="h-5 w-5 text-secondary-foreground" />
            }
            title="Use Template"
            description="Start with a pre-built template from the templates library"
            gradient="from-secondary/5 to-accent/10"
            onClick={handleTemplates}
          />
        </div>
      </MobileOverlayWrapper>

      {/* Sub-modals */}
      <PromptImporter
        isOpen={isImportOpen}
        onClose={handleImportClose}
        onImportSuccess={handleImportSuccess}
      />
      <PromptBuilderModal
        isOpen={isBuildOpen}
        onClose={() => setIsBuildOpen(false)}
      />
      <PromptGenerator
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
      />
    </>
  );
}
