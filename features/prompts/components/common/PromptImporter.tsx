/**
 * PromptImporter Component
 * 
 * UI for importing prompts from JSON format
 */

"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea, CopyTextarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import {
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  Copy,
  Download,
  FileJson,
  AlertCircle,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { importPrompt, importPromptBatch } from '../../services/prompt-import-service';
import type { PromptImportResult } from '../../types/prompt-json';
import { PromptData, PromptsBatchData } from '@/features/prompts/types/core';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { usePromptsBasePath } from '../../hooks/usePromptsBasePath';

interface PromptImporterProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess?: (promptId: string) => void;
}

export function PromptImporter({ isOpen, onClose, onImportSuccess }: PromptImporterProps) {
  const router = useRouter();
  const basePath = usePromptsBasePath();
  const [jsonInput, setJsonInput] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [results, setResults] = useState<PromptImportResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const handleImport = async () => {
    if (!jsonInput.trim()) {
      toast.error('Please paste JSON to import');
      return;
    }

    setIsImporting(true);
    setResults([]);
    setShowResults(false);

    try {
      const parsed = JSON.parse(jsonInput);

      // Check if it's a batch import or single prompt
      if (parsed.prompts && Array.isArray(parsed.prompts)) {
        // Batch import
        const batchResult = await importPromptBatch(parsed as PromptsBatchData);
        setResults(batchResult.results);

        if (batchResult.success) {
          toast.success(`Successfully imported ${batchResult.totalImported} prompt(s)`);
        } else {
          toast.warning(`Imported ${batchResult.totalImported} prompt(s), ${batchResult.totalFailed} failed`);
        }
      } else {
        // Single prompt import
        const result = await importPrompt(parsed as PromptData);
        setResults([result]);

        if (result.success) {
          toast.success(`Prompt "${result.promptName}" imported successfully`);
          onImportSuccess?.(result.promptId);
        } else {
          toast.error(`Failed to import: ${result.error}`);
        }
      }

      setShowResults(true);
    } catch (error) {
      console.error('Import error:', error);
      toast.error(error instanceof Error ? error.message : 'Invalid JSON format');
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setJsonInput('');
    setResults([]);
    setShowResults(false);
    onClose();
  };

  const handleViewPrompt = (promptId: string) => {
    router.push(`${basePath}/edit/${promptId}`);
    handleClose();
  };

  const singlePromptStructure: PromptData = {
    name: "Prompt Name",
    description: "Brief description",
    messages: [
      {
        role: "system",
        content: "System instructions..."
      },
      {
        role: "user",
        content: "Use {{my_variable}} in your message"
      }
    ],
    variableDefaults: [
      {
        name: "my_variable",
        defaultValue: "default value"
      }
    ],
    settings: {
      temperature: 0.7,
      // @ts-ignore - max_tokens may not exist in PromptSettings type but is used in runtime
      max_tokens: 1000
    }
  };

  const batchPromptStructure = {
    prompts: [singlePromptStructure]
  };

  const handleCopyStructure = (type: 'single' | 'batch') => {
    const structure = type === 'single' ? singlePromptStructure : batchPromptStructure;
    navigator.clipboard.writeText(JSON.stringify(structure, null, 2));
    toast.success(`${type === 'single' ? 'Single' : 'Batch'} structure copied`);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="max-w-5xl h-[85dvh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            Import Prompts from JSON
          </DialogTitle>
        </DialogHeader>

        {!showResults ? (
          <div className="flex-1 flex flex-col gap-2 overflow-hidden min-h-0">
            {/* Help Card */}
            <div className="flex-shrink-0 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-md overflow-hidden">
              {/* Header - Always visible */}
              <button
                onClick={() => setShowHelp(!showHelp)}
                className="w-full flex items-center justify-between gap-3 p-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
              >
                <div className="flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200">
                  <FileJson className="h-3.5 w-3.5" />
                  <span className="font-medium">JSON Format Guide</span>
                  <span className="text-blue-600 dark:text-blue-400">•</span>
                  <span>Variables: <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">{'{{var_name}}'}</code> (snake_case)</span>
                </div>
                {showHelp ? (
                  <ChevronUp className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                )}
              </button>

              {/* Expandable Content */}
              {showHelp && (
                <div className="border-t border-blue-200 dark:border-blue-800 p-3 space-y-3">
                  {/* Variable Explanation */}
                  <div className="space-y-1.5">
                    <div className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                      How Variables Work:
                    </div>
                    <ol className="text-xs text-blue-800 dark:text-blue-200 space-y-1 pl-4 list-decimal">
                      <li>Use <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">{'{{variable_name}}'}</code> in your message content</li>
                      <li>Declare each variable in the <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">variables</code> array</li>
                      <li>Set a <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">defaultValue</code> for each variable</li>
                    </ol>
                    <div className="mt-2 text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 p-2 rounded">
                      <span className="font-semibold">⚠️ Important:</span> Variable names must be lowercase snake_case
                      <div className="mt-1 flex gap-3">
                        <span className="text-green-700 dark:text-green-400">✓ <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">user_name</code></span>
                        <span className="text-green-700 dark:text-green-400">✓ <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">api_key</code></span>
                        <span className="text-red-700 dark:text-red-400">✗ <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">userName</code></span>
                        <span className="text-red-700 dark:text-red-400">✗ <code className="bg-amber-100 dark:bg-amber-900 px-1 rounded">UserName</code></span>
                      </div>
                    </div>
                  </div>

                  {/* Format Examples */}
                  <div className="space-y-2">
                    <div className="text-xs font-semibold text-blue-900 dark:text-blue-100">
                      Structure:
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyStructure('single')}
                        className="flex-1 h-8 text-xs bg-white dark:bg-blue-950 border-blue-300 dark:border-blue-700"
                      >
                        <Copy className="h-3 w-3 mr-1.5" />
                        Copy Single Prompt
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopyStructure('batch')}
                        className="flex-1 h-8 text-xs bg-white dark:bg-blue-950 border-blue-300 dark:border-blue-700"
                      >
                        <Copy className="h-3 w-3 mr-1.5" />
                        Copy Batch Import
                      </Button>
                    </div>
                    <div className="text-xs text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 p-2 rounded">
                      <span className="font-medium">Tip:</span> Single prompt = direct object. Batch import = <code className="bg-blue-200 dark:bg-blue-800 px-1 rounded">{'{ prompts: [...] }'}</code>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* JSON Input - Takes up most of the space */}
            <div className="flex-1 flex flex-col min-h-0 overflow-auto">
              <label className="text-sm font-medium mb-1.5 flex-shrink-0">Prompt JSON</label>
              <CopyTextarea
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                placeholder={JSON.stringify(singlePromptStructure, null, 2)}
                className="font-mono text-xs"
                autoGrow
                disabled={isImporting}
              />
            </div>

            {/* Import Button */}
            <div className="flex-shrink-0 flex items-center justify-between pt-2 border-t border-border">
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {jsonInput.trim() && (
                  <span className="flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Ready to import
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={handleClose} disabled={isImporting}>
                  Cancel
                </Button>
                <Button
                  onClick={handleImport}
                  disabled={isImporting || !jsonInput.trim()}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Import
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Results */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {results.map((result, index) => (
                <Card
                  key={index}
                  className={result.success
                    ? 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30'
                    : 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/30'
                  }
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        {result.success ? (
                          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm truncate">
                            {result.promptName}
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {result.message || result.error}
                          </div>
                          {result.success && result.promptId && (
                            <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 font-mono">
                              ID: {result.promptId}
                            </div>
                          )}
                        </div>
                      </div>
                      {result.success && result.promptId && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleViewPrompt(result.promptId)}
                          className="flex-shrink-0"
                        >
                          View
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <div className="text-sm text-gray-600 dark:text-gray-400">
                {results.filter(r => r.success).length} succeeded, {results.filter(r => !r.success).length} failed
              </div>
              <Button onClick={handleClose}>
                Close
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

