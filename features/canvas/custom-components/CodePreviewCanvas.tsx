'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  CheckCircle2,
  X,
  Star,
  GitCompare,
  File,
  FileCode,
  Eye,
  Edit3,
} from 'lucide-react';
import CodeBlock from '@/features/code-editor/components/code-block/CodeBlock';
import { DiffView } from '@/features/code-editor/components/DiffView';
import { computeTextDiff } from '@/components/diff/text/engine/computeTextDiff';
import type { CodeEdit } from '@/features/code-editor/utils/parseCodeEdits';

export interface CodePreviewCanvasProps {
  originalCode: string;
  modifiedCode: string;
  language: string;
  edits: CodeEdit[];
  explanation?: string;
  onApply: () => void;
  onDiscard: () => void;
  onCloseModal?: () => void;
}

/**
 * CodePreviewCanvas - Shows code preview with diff in the canvas panel
 * 
 * Displays:
 * - Diff view (default)
 * - Original code
 * - Modified code preview
 * - Apply/Discard actions
 */
export function CodePreviewCanvas({
  originalCode,
  modifiedCode,
  language,
  edits,
  explanation,
  onApply,
  onDiscard,
  onCloseModal,
}: CodePreviewCanvasProps) {
  const [activeTab, setActiveTab] = useState('diff');
  const [isApplied, setIsApplied] = useState(false);

  // Canonical engine stats. Unified counting: a modified line is one addition
  // and one deletion, so fold `modifications` into both.
  const { stats } = computeTextDiff(originalCode, modifiedCode);
  const diffStats = {
    additions: stats.additions + stats.modifications,
    deletions: stats.deletions + stats.modifications,
  };

  const handleApply = () => {
    onApply();
    setIsApplied(true);
  };

  const handleCloseAndView = () => {
    if (onCloseModal) {
      onCloseModal();
    }
  };

  const handleContinueEditing = () => {
    setIsApplied(false);
  };

  // Success state after applying changes
  if (isApplied) {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-6 h-6 text-green-600 dark:text-green-500" />
          </div>
          
          <h3 className="text-base font-semibold mb-2">Changes Applied Successfully!</h3>
          
          <p className="text-xs text-muted-foreground mb-4 max-w-md">
            Your code has been updated. Close the modal to see the changes, or continue editing to make more modifications.
          </p>

          {/* Change Summary */}
          {diffStats && (
            <div className="flex items-center gap-2 mb-6">
              <Badge variant="outline" className="text-[10px] h-5 px-2 text-green-600 border-green-600 bg-green-50 dark:bg-green-950/30">
                +{diffStats.additions} {diffStats.additions === 1 ? 'addition' : 'additions'}
              </Badge>
              <Badge variant="outline" className="text-[10px] h-5 px-2 text-red-600 border-red-600 bg-red-50 dark:bg-red-950/30">
                -{diffStats.deletions} {diffStats.deletions === 1 ? 'deletion' : 'deletions'}
              </Badge>
            </div>
          )}

          {explanation && (
            <Alert className="mb-4 max-w-md text-left">
              <Star className="h-3.5 w-3.5" />
              <AlertDescription className="text-xs">
                {explanation}
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons - VS Code style */}
          <div className="flex flex-col sm:flex-row gap-2 w-full max-w-md">
            <button
              onClick={handleCloseAndView}
              disabled={!onCloseModal}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-colors bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Eye className="w-3.5 h-3.5" />
              Close & View Changes
            </button>
            <button
              onClick={handleContinueEditing}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded transition-colors border border-border bg-background hover:bg-muted"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Continue Editing
            </button>
          </div>

          <p className="text-[10px] text-muted-foreground mt-3">
            You can make unlimited edits in a single session
          </p>
        </div>
      </div>
    );
  }

  // Preview state (before applying)
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Tabs - VSCode style with minimal padding */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start border-b rounded-none bg-transparent p-0 h-auto shrink-0 gap-0">
          <TabsTrigger
            value="diff"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground hover:bg-muted/50 px-2 py-0.5 text-[10px] gap-1 h-6 font-normal"
          >
            <GitCompare className="w-3 h-3" />
            Diff
          </TabsTrigger>
          <TabsTrigger
            value="original"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground hover:bg-muted/50 px-2 py-0.5 text-[10px] gap-1 h-6 font-normal"
          >
            <File className="w-3 h-3" />
            Original
          </TabsTrigger>
          <TabsTrigger
            value="preview"
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-foreground hover:bg-muted/50 px-2 py-0.5 text-[10px] gap-1 h-6 font-normal"
          >
            <FileCode className="w-3 h-3" />
            Preview
          </TabsTrigger>
        </TabsList>

        {/* Content - No padding, edge-to-edge */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <TabsContent value="diff" className="h-full m-0 p-0 overflow-hidden">
            <DiffView
              originalCode={originalCode}
              modifiedCode={modifiedCode}
              language={language}
              showLineNumbers={true}
            />
          </TabsContent>

          <TabsContent value="original" className="h-full m-0 p-0 overflow-hidden">
            <div className="h-full overflow-auto">
              <CodeBlock
                code={originalCode}
                language={language}
                showLineNumbers={true}
              />
            </div>
          </TabsContent>

          <TabsContent value="preview" className="h-full m-0 p-0 overflow-hidden">
            <div className="h-full overflow-auto">
              <CodeBlock
                code={modifiedCode}
                language={language}
                showLineNumbers={true}
              />
            </div>
          </TabsContent>
        </div>
      </Tabs>

      {/* Footer Actions - VS Code style tiny buttons */}
      <div className="px-2 py-1 border-t bg-muted/20 shrink-0">
        <div className="flex items-center justify-end gap-1 pr-6">
          <button
            onClick={onDiscard}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors text-foreground hover:bg-muted"
          >
            <X className="w-3 h-3" />
            Discard
          </button>
          <button
            onClick={handleApply}
            className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded transition-colors bg-blue-600 hover:bg-blue-700 text-white"
          >
            <CheckCircle2 className="w-3 h-3" />
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

