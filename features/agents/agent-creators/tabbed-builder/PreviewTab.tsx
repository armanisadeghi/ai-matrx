'use client';

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { usePromptBuilder } from './PromptBuilderContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyIcon, CheckIcon } from "lucide-react";

export const PreviewTab: React.FC = () => {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const { finalPrompt, globalPrompt, enabledSections, allTabs, generateFinalPrompt } = usePromptBuilder();
  const [copied, setCopied] = useState(false);
  const [previewTab, setPreviewTab] = useState<'final' | 'structure'>('final');
  const [localFinalPrompt, setLocalFinalPrompt] = useState('');
  
  // Regenerate the prompt when viewing this tab
  useEffect(() => {
    setLocalFinalPrompt(generateFinalPrompt());
  }, [generateFinalPrompt, enabledSections]);
  
  // Function to copy the prompt to clipboard
  const copyToClipboard = async () => {
    if (!(await copyText(localFinalPrompt))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // Function to show the raw structure with placeholders
  const showStructureView = () => {
    // Replace placeholders with highlighted versions
    const highlightedPrompt = globalPrompt.replace(
      /<<TAB_(\d+)>><<T\/AB_\1>>/gs,
      (match, tabNumber, content) => {
        const tab = allTabs.find(t => t.tabNumber === Number(tabNumber));
        const tabName = tab ? tab.label : `Tab ${tabNumber}`;
        const isEnabled = tab ? enabledSections[tab.id] : false;
        
        if (!isEnabled) {
          return `<span class="bg-red-100 dark:bg-red-900/30 px-1 py-0.5 rounded text-red-800 dark:text-red-300 text-xs font-mono">DISABLED: ${tabName}</span>`;
        }
        
        return `<span class="bg-blue-100 dark:bg-blue-900/30 px-1 py-0.5 rounded text-blue-800 dark:text-blue-300 text-xs font-mono">TAB_${tabNumber}: ${tabName}</span>`;
      }
    );
    
    return (
      <div 
        className="prose prose-sm dark:prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: highlightedPrompt.split('\n').join('<br>') }}
      />
    );
  };

  // Generate the final display prompt
  const getDisplayPrompt = () => {
    if (!localFinalPrompt) {
      return '(Your prompt will appear here once you add content to the enabled sections)';
    }
    return localFinalPrompt;
  };
  
  return (
    <Card className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-sm mb-4">
      <CardHeader>
        <CardTitle className="text-gray-900 dark:text-gray-100">Final Generated Prompt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <Tabs value={previewTab} onValueChange={(v) => setPreviewTab(v as 'final' | 'structure')}>
          <TabsList className="mb-4">
            <TabsTrigger value="final">Final Prompt</TabsTrigger>
            <TabsTrigger value="structure">Prompt Structure</TabsTrigger>
          </TabsList>
          
          <TabsContent value="final" className="mt-0">
            <div className="relative">
              <div className="absolute top-2 right-2">
                <Button 
                  variant="quiet" 
                  onClick={copyToClipboard}
                >
                  {copied ? 
                    <CheckIcon className="h-4 w-4 text-green-500" /> : 
                    <CopyIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                  }
                </Button>
              </div>
              <pre className="p-4 bg-zinc-50 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 rounded-md whitespace-pre-wrap font-mono type-body overflow-auto max-h-[400px] border border-zinc-200 dark:border-zinc-700">
                {getDisplayPrompt()}
              </pre>
            </div>
          </TabsContent>
          
          <TabsContent value="structure" className="mt-0">
            <div className="p-4 bg-zinc-50 dark:bg-zinc-800 text-gray-800 dark:text-gray-100 rounded-md overflow-auto max-h-[400px] border border-zinc-200 dark:border-zinc-700">
              {showStructureView()}
            </div>
          </TabsContent>
        </Tabs>
        
        <div className="space-y-3">
          <h3 className="text-base font-medium text-gray-900 dark:text-gray-100">Enabled Sections</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {allTabs.filter(tab => tab.id !== 'preview').map((tab) => {
              const isEnabled = enabledSections[tab.id];
              return (
                <div 
                  key={tab.id} 
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md ${
                    isEnabled ? 
                    'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300' : 
                    'bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                  <span className="type-body">{tab.label}</span>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className="flex space-x-2">
          <Button
            variant="primary" 
            onClick={copyToClipboard}
          >
            {copied ? 'Copied!' : 'Copy to Clipboard'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}; 