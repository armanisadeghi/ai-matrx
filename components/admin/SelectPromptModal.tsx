/**
 * SelectPromptModal
 * 
 * Modal for selecting or changing the AI prompt linked to a system prompt.
 * Shows compatible prompts with variable validation.
 */

'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle, 
  Search,
  Link2,
  Clock,
  Rocket
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SystemPromptDB } from '@/types/system-prompts-db';
import { GeneratePromptForSystemModal } from './GeneratePromptForSystemModal';
import { filterAndSortBySearch } from '@/utils/search-scoring';

interface SelectPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: SystemPromptDB;
  onSuccess: () => void;
  mode: 'select' | 'change'; // select = no current prompt, change = has current prompt
}

interface CompatiblePrompt {
  id: string;
  name: string;
  description: string | null;
  variables: string[];
  updated_at: string;
  is_current: boolean;
  validation: {
    valid: boolean;
    missing: string[];
    extra: string[];
  };
}

interface CompatiblePromptsResponse {
  system_prompt: {
    id: string;
    system_prompt_id: string;
    name: string;
    functionality_id: string;
    source_prompt_id: string | null;
    current_version: number;
  };
  functionality: {
    id: string;
    name: string;
    description: string;
    required_variables: string[];
    optional_variables: string[];
    placement_types: string[];
  };
  compatible: CompatiblePrompt[];
  total_compatible: number;
  total_prompts: number;
}

export function SelectPromptModal({
  isOpen,
  onClose,
  systemPrompt,
  onSuccess,
  mode
}: SelectPromptModalProps) {
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState<CompatiblePromptsResponse | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Fetch compatible prompts
  useEffect(() => {
    if (!isOpen) return;

    async function fetchCompatiblePrompts() {
      setLoading(true);
      setError('');
      
      try {
        const response = await fetch(
          `/api/system-prompts/${systemPrompt.id}/compatible-prompts`
        );

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.details || errorData.error || 'Failed to fetch compatible prompts');
        }

        const result = await response.json();
        setData(result);
      } catch (err: any) {
        console.error('Error fetching compatible prompts:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchCompatiblePrompts();
  }, [isOpen, systemPrompt.id]);

  const handleSelectPrompt = async (promptId: string, promptName: string) => {
    setAssigning(true);
    setError('');

    try {
      const response = await fetch(
        `/api/system-prompts/${systemPrompt.id}/link-prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt_id: promptId,
            update_notes: mode === 'select' 
              ? `Initial link to prompt: ${promptName}`
              : `Changed to use prompt: ${promptName}`
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // If validation failed, show detailed error
        if (errorData.validation) {
          const val = errorData.validation;
          let detailMsg = `Missing required variables:\n`;
          if (val.missing_variables?.length > 0) {
            detailMsg += `Missing: ${val.missing_variables.join(', ')}\n`;
          }
          detailMsg += `\nRequired: ${val.required_variables.join(', ')}`;
          detailMsg += `\nPrompt has: ${val.prompt_variables.join(', ')}`;
          if (val.extra_variables?.length > 0) {
            detailMsg += `\n\nNote: Extra variables are allowed (may have defaults): ${val.extra_variables.join(', ')}`;
          }
          throw new Error(detailMsg);
        }
        
        throw new Error(errorData.details || errorData.error || 'Failed to link prompt');
      }

      const result = await response.json();
      toast.success(result.message || 'Prompt linked successfully!');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error linking prompt:', err);
      setError(err.message);
      toast.error('Failed to link prompt');
    } finally {
      setAssigning(false);
    }
  };

  // Filter prompts based on search
  const filteredPrompts = searchQuery && data?.compatible
    ? filterAndSortBySearch(data.compatible, searchQuery, [
        { get: (p) => p.name, weight: 'title' },
        { get: (p) => p.description, weight: 'body' },
        { get: (p) => p.variables, weight: 'tag' },
      ])
    : data?.compatible || [];

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[85dvh]">
        <DialogHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <DialogTitle>
                {mode === 'select' ? 'Select' : 'Change'} AI Prompt for "{systemPrompt.name}"
              </DialogTitle>
              <DialogDescription>
                Choose a compatible AI prompt to power this system prompt. 
                {data?.functionality && (
                  <span className="block mt-1">
                    Required variables: <code className="text-xs">{data.functionality.required_variables.join(', ')}</code>
                  </span>
                )}
              </DialogDescription>
            </div>
            <Button
              onClick={() => setShowGenerateModal(true)}
              className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white mr-6"
              size="sm"
            >
              <Rocket className="h-4 w-4 mr-2" />
              Generate New
            </Button>
          </div>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-4">
            {/* Functionality Info */}
            {data?.functionality && (
              <Card className="p-3 bg-muted/50">
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Functionality:</span>
                    <span className="ml-2">{data.functionality.name}</span>
                  </div>
                  <div>
                    <span className="font-medium">Required Variables:</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {data.functionality.required_variables.map(v => (
                        <Badge key={v} variant="default" className="text-xs">
                          {v}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  {data.functionality.optional_variables.length > 0 && (
                    <div>
                      <span className="font-medium">Optional Variables:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {data.functionality.optional_variables.map(v => (
                          <Badge key={v} variant="secondary" className="text-xs">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            )}

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search prompts by name, description, or variables..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <div>
                <span className="font-medium text-foreground">{data?.total_compatible || 0}</span> compatible prompts
              </div>
              <div>
                <span className="font-medium text-foreground">{data?.total_prompts || 0}</span> total prompts
              </div>
            </div>

            {/* Prompt List */}
            <ScrollArea className="h-[400px] pr-4">
              {filteredPrompts.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground mb-2">
                    {searchQuery ? 'No prompts match your search' : 'No compatible prompts found'}
                  </p>
                  {!searchQuery && data?.functionality && (
                    <>
                      <p className="text-sm text-muted-foreground mb-4">
                        Create a prompt with variables: {data.functionality.required_variables.join(', ')}
                      </p>
                      <Button
                        onClick={() => setShowGenerateModal(true)}
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                      >
                        <Rocket className="h-4 w-4 mr-2" />
                        Generate New Prompt with AI
                      </Button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredPrompts.map((prompt) => (
                    <Card
                      key={prompt.id}
                      className={cn(
                        'p-4 transition-all cursor-pointer',
                        prompt.is_current 
                          ? 'border-primary bg-primary/5'
                          : 'hover:border-primary/50'
                      )}
                      onClick={() => !assigning && !prompt.is_current && handleSelectPrompt(prompt.id, prompt.name)}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h4 className="font-semibold text-sm">{prompt.name}</h4>
                            {prompt.is_current && (
                              <Badge variant="default" className="text-xs">
                                <Link2 className="h-3 w-3 mr-1" />
                                Current
                              </Badge>
                            )}
                          </div>
                          
                          {prompt.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                              {prompt.description}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Variables */}
                            <div className="flex flex-wrap gap-1">
                              {prompt.variables.map(v => (
                                <Badge key={v} variant="outline" className="text-[10px] px-1.5 py-0">
                                  {v}
                                </Badge>
                              ))}
                            </div>
                            
                            {/* Updated time */}
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {new Date(prompt.updated_at).toLocaleDateString()}
                            </div>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          {prompt.is_current ? (
                            <CheckCircle2 className="h-5 w-5 text-primary" />
                          ) : (
                            <Button 
                              size="sm" 
                              disabled={assigning}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectPrompt(prompt.id, prompt.name);
                              }}
                            >
                              {assigning ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Select'
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>

    {/* AI Prompt Generator Modal */}
    {showGenerateModal && (
      <GeneratePromptForSystemModal
        isOpen={showGenerateModal}
        onClose={() => setShowGenerateModal(false)}
        systemPrompt={systemPrompt}
        onSuccess={(promptId) => {
          setShowGenerateModal(false);
          toast.success('Prompt generated and linked successfully!');
          onSuccess();
          onClose();
        }}
      />
    )}
    </>
  );
}

