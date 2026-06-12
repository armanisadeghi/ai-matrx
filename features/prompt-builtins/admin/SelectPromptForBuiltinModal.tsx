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
  AlertCircle, 
  Search,
  Clock,
  PartyPopper,
  Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { GeneratePromptForBuiltinModal } from './GeneratePromptForBuiltinModal';
import { filterAndSortBySearch } from '@/utils/search-scoring';

interface UserPrompt {
  id: string;
  name: string;
  description: string | null;
  variables: string[];
  updated_at: string;
  created_at: string;
}

interface SelectPromptForBuiltinModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcutId?: string; // Optional - if provided, will link to this shortcut
  shortcutData?: {
    label: string;
    available_scopes?: string[];
  };
  onSuccess: (builtinId: string) => void;
}

export function SelectPromptForBuiltinModal({
  isOpen,
  onClose,
  shortcutId,
  shortcutData,
  onSuccess
}: SelectPromptForBuiltinModalProps) {
  const [loading, setLoading] = useState(true);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [prompts, setPrompts] = useState<UserPrompt[]>([]);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // Fetch user's prompts
  useEffect(() => {
    if (!isOpen) return;

    async function fetchUserPrompts() {
      setLoading(true);
      setError('');
      
      try {
        const response = await fetch('/api/admin/prompt-builtins/user-prompts');

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.details || errorData.error || 'Failed to fetch prompts');
        }

        const result = await response.json();
        setPrompts(result.prompts || []);
      } catch (err: any) {
        console.error('Error fetching user prompts:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchUserPrompts();
  }, [isOpen]);

  const handleSelectPrompt = async (promptId: string, promptName: string) => {
    setConverting(true);
    setError('');

    try {
      const response = await fetch('/api/admin/prompt-builtins/convert-from-prompt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_id: promptId,
          shortcut_id: shortcutId || null,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.details || errorData.error || 'Failed to convert prompt');
      }

      const result = await response.json();
      
      toast.success(
        shortcutId ? 'Builtin created and linked!' : 'Builtin created!',
        { description: `Converted "${promptName}" to a builtin prompt` }
      );
      
      onSuccess(result.builtin_id);
      onClose();
    } catch (err: any) {
      console.error('Error converting prompt:', err);
      setError(err.message);
      toast.error('Failed to convert prompt');
    } finally {
      setConverting(false);
    }
  };

  // Filter prompts based on search
  const filteredPrompts = searchQuery
    ? filterAndSortBySearch(prompts, searchQuery, [
        { get: (p) => p.name, weight: 'title' },
        { get: (p) => p.description, weight: 'body' },
        { get: (p) => p.variables, weight: 'tag' },
      ])
    : prompts;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[85dvh]">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <DialogTitle>
                  {shortcutId ? `Select Prompt for "${shortcutData?.label}"` : 'Create Prompt Builtin'}
                </DialogTitle>
                <DialogDescription>
                  Choose one of your prompts to convert to a builtin, or generate a new one with AI
                  {shortcutData?.available_scopes && shortcutData.available_scopes.length > 0 && (
                    <span className="block mt-1">
                      Available scopes: <code className="text-xs">{shortcutData.available_scopes.join(', ')}</code>
                    </span>
                  )}
                </DialogDescription>
              </div>
              <Button
                onClick={() => setShowGenerateModal(true)}
                className="flex-shrink-0 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white mr-6"
                size="sm"
              >
                <PartyPopper className="h-4 w-4 mr-2" />
                Generate with AI
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
                  <span className="font-medium text-foreground">{filteredPrompts.length}</span> {searchQuery ? 'matching' : 'total'} prompts
                </div>
              </div>

              {/* Prompt List */}
              <ScrollArea className="h-[400px] pr-4">
                {filteredPrompts.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground mb-2">
                      {searchQuery ? 'No prompts match your search' : 'No prompts found'}
                    </p>
                    {!searchQuery && (
                      <>
                        <p className="text-sm text-muted-foreground mb-4">
                          Create a new prompt with AI or import from your library
                        </p>
                        <Button
                          onClick={() => setShowGenerateModal(true)}
                          className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                        >
                          <PartyPopper className="h-4 w-4 mr-2" />
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
                          'p-4 transition-all cursor-pointer hover:border-primary/50'
                        )}
                        onClick={() => !converting && handleSelectPrompt(prompt.id, prompt.name)}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-semibold text-sm">{prompt.name}</h4>
                            </div>
                            
                            {prompt.description && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                {prompt.description}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2">
                              {/* Variables */}
                              {prompt.variables.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  <span className="text-[10px] text-muted-foreground mr-1">Variables:</span>
                                  {prompt.variables.map(v => (
                                    <Badge key={v} variant="outline" className="text-[10px] px-1.5 py-0">
                                      {v}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic">No variables</span>
                              )}
                              
                              {/* Updated time */}
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {new Date(prompt.updated_at).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          <div className="flex-shrink-0">
                            <Button 
                              size="sm" 
                              disabled={converting}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectPrompt(prompt.id, prompt.name);
                              }}
                            >
                              {converting ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <>
                                  <Plus className="h-3 w-3 mr-1" />
                                  Convert
                                </>
                              )}
                            </Button>
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
        <GeneratePromptForBuiltinModal
          isOpen={showGenerateModal}
          onClose={() => setShowGenerateModal(false)}
          shortcutId={shortcutId}
          shortcutData={shortcutData}
          onSuccess={(builtinId) => {
            setShowGenerateModal(false);
            toast.success('Builtin created successfully!');
            onSuccess(builtinId);
            onClose();
          }}
        />
      )}
    </>
  );
}

