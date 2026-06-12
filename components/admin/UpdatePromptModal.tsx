/**
 * UpdatePromptModal
 * 
 * Modal for updating a system prompt to the latest version of its source AI prompt.
 * Shows a side-by-side comparison with highlighted differences.
 */

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  ArrowRight,
  Info,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { SystemPromptDB } from '@/types/system-prompts-db';

interface UpdatePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemPrompt: SystemPromptDB;
  onSuccess: () => void;
}

interface PromptComparison {
  current: {
    name: string;
    description: string;
    messages: any[];
    settings: any;
    variableDefaults: any[];
    variables: string[];
    version: number;
  };
  latest: {
    name: string;
    description: string;
    messages: any[];
    settings: any;
    variableDefaults: any[];
    variables: string[];
    prompt_id: string;
    updated_at: string;
  };
  changes: {
    name_changed: boolean;
    description_changed: boolean;
    messages_changed: boolean;
    settings_changed: boolean;
    variableDefaults_changed: boolean;
    variables_added: string[];
    variables_removed: string[];
    variables_unchanged: string[];
  };
  validation: {
    valid: boolean;
    missing: string[];
    extra: string[];
  } | null;
  compatible: boolean;
}

export function UpdatePromptModal({
  isOpen,
  onClose,
  systemPrompt,
  onSuccess
}: UpdatePromptModalProps) {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');
  const [comparison, setComparison] = useState<PromptComparison | null>(null);

  // Fetch current and latest prompt data for comparison
  useEffect(() => {
    if (!isOpen || !systemPrompt.source_prompt_id) return;

    async function fetchComparison() {
      setLoading(true);
      setError('');
      
      try {
        // Fetch the latest version of the source prompt
        const response = await fetch(`/api/prompts/${systemPrompt.source_prompt_id}`);
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to fetch source prompt');
        }

        const latestPrompt = await response.json();

        // Extract variables from latest prompt
        const variableRegex = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;
        const latestVariables = new Set<string>();
        
        latestPrompt.messages?.forEach((msg: any) => {
          if (msg.content) {
            let match;
            while ((match = variableRegex.exec(msg.content)) !== null) {
              latestVariables.add(match[1]);
            }
          }
        });

        const currentVariables = new Set(systemPrompt.prompt_snapshot.variables || []);
        
        // Calculate variable changes
        const variablesAdded = Array.from(latestVariables).filter(v => !currentVariables.has(v));
        const variablesRemoved = Array.from(currentVariables).filter(v => !latestVariables.has(v));
        const variablesUnchanged = Array.from(latestVariables).filter(v => currentVariables.has(v));

        // Check if messages changed (deep comparison)
        const messagesChanged = JSON.stringify(systemPrompt.prompt_snapshot.messages) !== 
                                JSON.stringify(latestPrompt.messages);

        // Check if settings changed
        const settingsChanged = JSON.stringify(systemPrompt.prompt_snapshot.settings) !== 
                                JSON.stringify(latestPrompt.settings);

        // Check if variable defaults changed
        const variableDefaultsChanged = JSON.stringify(systemPrompt.prompt_snapshot.variableDefaults) !== 
                                        JSON.stringify(latestPrompt.variable_defaults);

        // Validate against functionality if defined
        let validation = null;
        let compatible = true;

        if (systemPrompt.functionality_id) {
          const validateResponse = await fetch(
            `/api/system-prompts/${systemPrompt.id}/compatible-prompts`
          );
          
          if (validateResponse.ok) {
            const compatData = await validateResponse.json();
            const currentPromptInfo = compatData.compatible.find(
              (p: any) => p.id === systemPrompt.source_prompt_id
            );
            
            if (currentPromptInfo) {
              validation = currentPromptInfo.validation;
              compatible = currentPromptInfo.validation.valid;
            }
          }
        }

        const comparisonData: PromptComparison = {
          current: {
            name: systemPrompt.prompt_snapshot.name,
            description: systemPrompt.prompt_snapshot.description || '',
            messages: systemPrompt.prompt_snapshot.messages || [],
            settings: systemPrompt.prompt_snapshot.settings || {},
            variableDefaults: systemPrompt.prompt_snapshot.variableDefaults || [],
            variables: Array.from(currentVariables),
            version: systemPrompt.version
          },
          latest: {
            name: latestPrompt.name,
            description: latestPrompt.description || '',
            messages: latestPrompt.messages || [],
            settings: latestPrompt.settings || {},
            variableDefaults: latestPrompt.variable_defaults || [],
            variables: Array.from(latestVariables),
            prompt_id: latestPrompt.id,
            updated_at: latestPrompt.updated_at
          },
          changes: {
            name_changed: systemPrompt.prompt_snapshot.name !== latestPrompt.name,
            description_changed: (systemPrompt.prompt_snapshot.description || '') !== (latestPrompt.description || ''),
            messages_changed: messagesChanged,
            settings_changed: settingsChanged,
            variableDefaults_changed: variableDefaultsChanged,
            variables_added: variablesAdded,
            variables_removed: variablesRemoved,
            variables_unchanged: variablesUnchanged
          },
          validation,
          compatible
        };

        setComparison(comparisonData);
      } catch (err: any) {
        console.error('Error fetching comparison:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchComparison();
  }, [isOpen, systemPrompt]);

  const hasChanges = useMemo(() => {
    if (!comparison) return false;
    const c = comparison.changes;
    return c.name_changed || 
           c.description_changed || 
           c.messages_changed || 
           c.settings_changed || 
           c.variableDefaults_changed ||
           c.variables_added.length > 0 || 
           c.variables_removed.length > 0;
  }, [comparison]);

  const handleUpdate = async () => {
    if (!comparison) return;

    setUpdating(true);
    setError('');

    try {
      const response = await fetch(
        `/api/system-prompts/${systemPrompt.id}/link-prompt`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt_id: systemPrompt.source_prompt_id,
            update_notes: `Updated to latest version from source prompt`
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        // Show detailed validation error
        if (errorData.validation) {
          const val = errorData.validation;
          let detailMsg = 'Update blocked due to missing required variables:\n\n';
          
          if (val.missing_variables?.length > 0) {
            detailMsg += `Missing Required Variables:\n${val.missing_variables.join(', ')}\n\n`;
          }
          
          detailMsg += `Functionality: ${val.functionality_name}\n`;
          detailMsg += `Required: ${val.required_variables.join(', ')}\n`;
          detailMsg += `Prompt Has: ${val.prompt_variables.join(', ')}\n\n`;
          
          if (val.extra_variables?.length > 0) {
            detailMsg += `Note: Extra variables are allowed if they have defaults:\n${val.extra_variables.join(', ')}\n\n`;
          }
          
          detailMsg += JSON.stringify(errorData, null, 2);
          
          throw new Error(detailMsg);
        }
        
        throw new Error(errorData.details || errorData.error || 'Failed to update');
      }

      const result = await response.json();
      toast.success(result.message || 'System prompt updated successfully!');
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error updating prompt:', err);
      setError(err.message);
      toast.error('Failed to update prompt');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90dvh]">
        <DialogHeader>
          <DialogTitle>Update "{systemPrompt.name}" to Latest Version</DialogTitle>
          <DialogDescription>
            Review changes before updating to the latest version of the source prompt
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="whitespace-pre-wrap font-mono text-xs">
              {error}
            </AlertDescription>
          </Alert>
        ) : comparison ? (
          <div className="space-y-4">
            {/* Summary */}
            <Card className="p-4">
              <div className="flex items-start justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Current Version:</span>
                    <Badge variant="outline">v{comparison.current.version}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">Latest Updated:</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(comparison.latest.updated_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {!comparison.compatible && (
                  <Alert variant="destructive" className="max-w-md">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      <p className="font-semibold mb-1">Incompatible Update!</p>
                      {comparison.validation && (
                        <>
                          {comparison.validation.missing.length > 0 && (
                            <p>Missing Required: {comparison.validation.missing.join(', ')}</p>
                          )}
                          {comparison.validation.extra.length > 0 && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Additional variables (OK if they have defaults): {comparison.validation.extra.join(', ')}
                            </p>
                          )}
                        </>
                      )}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </Card>

            {!hasChanges ? (
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription>
                  No changes detected. Your system prompt is already up to date with the source prompt.
                </AlertDescription>
              </Alert>
            ) : (
              <Tabs defaultValue="overview" className="w-full">
                <TabsList className="grid w-full grid-cols-5">
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="variables">Variables</TabsTrigger>
                  <TabsTrigger value="messages">Messages</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                  <TabsTrigger value="defaults">Defaults</TabsTrigger>
                </TabsList>

                {/* Overview Tab */}
                <TabsContent value="overview" className="space-y-3">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-3 pr-4">
                      {/* Name Change */}
                      {comparison.changes.name_changed && (
                        <Card className="p-3">
                          <div className="text-sm font-medium mb-2">Name Changed:</div>
                          <div className="flex items-center gap-2 text-sm">
                            <span className="text-muted-foreground">{comparison.current.name}</span>
                            <ArrowRight className="h-4 w-4" />
                            <span className="text-primary font-medium">{comparison.latest.name}</span>
                          </div>
                        </Card>
                      )}

                      {/* Description Change */}
                      {comparison.changes.description_changed && (
                        <Card className="p-3">
                          <div className="text-sm font-medium mb-2">Description Changed:</div>
                          <div className="space-y-2">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Current:</div>
                              <div className="text-sm bg-muted p-2 rounded">
                                {comparison.current.description || <em>No description</em>}
                              </div>
                            </div>
                            <ArrowRight className="h-4 w-4 mx-auto" />
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Latest:</div>
                              <div className="text-sm bg-primary/10 p-2 rounded">
                                {comparison.latest.description || <em>No description</em>}
                              </div>
                            </div>
                          </div>
                        </Card>
                      )}

                      {/* Variables Summary */}
                      {(comparison.changes.variables_added.length > 0 || 
                        comparison.changes.variables_removed.length > 0) && (
                        <Card className="p-3">
                          <div className="text-sm font-medium mb-2">Variable Changes:</div>
                          <div className="space-y-2">
                            {comparison.changes.variables_added.length > 0 && (
                              <div>
                                <div className="text-xs text-green-600 font-medium mb-1">Added:</div>
                                <div className="flex flex-wrap gap-1">
                                  {comparison.changes.variables_added.map(v => (
                                    <Badge key={v} variant="default" className="text-xs bg-green-600">
                                      +{v}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                            {comparison.changes.variables_removed.length > 0 && (
                              <div>
                                <div className="text-xs text-red-600 font-medium mb-1">Removed:</div>
                                <div className="flex flex-wrap gap-1">
                                  {comparison.changes.variables_removed.map(v => (
                                    <Badge key={v} variant="destructive" className="text-xs">
                                      -{v}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </Card>
                      )}

                      {/* Other Changes */}
                      {comparison.changes.messages_changed && (
                        <Card className="p-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">Messages have changed</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            View the "Messages" tab for detailed comparison
                          </p>
                        </Card>
                      )}

                      {comparison.changes.settings_changed && (
                        <Card className="p-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">Settings have changed</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            View the "Settings" tab for detailed comparison
                          </p>
                        </Card>
                      )}

                      {comparison.changes.variableDefaults_changed && (
                        <Card className="p-3">
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                            <span className="text-sm font-medium">Variable defaults have changed</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            View the "Defaults" tab for detailed comparison
                          </p>
                        </Card>
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Variables Tab */}
                <TabsContent value="variables" className="space-y-3">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4 pr-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2">Current Variables:</div>
                          <div className="flex flex-wrap gap-1">
                            {comparison.current.variables.map(v => (
                              <Badge 
                                key={v} 
                                variant={comparison.changes.variables_removed.includes(v) ? 'destructive' : 'outline'}
                                className="text-xs"
                              >
                                {v}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">Latest Variables:</div>
                          <div className="flex flex-wrap gap-1">
                            {comparison.latest.variables.map(v => (
                              <Badge 
                                key={v} 
                                variant={comparison.changes.variables_added.includes(v) ? 'default' : 'outline'}
                                className={cn(
                                  "text-xs",
                                  comparison.changes.variables_added.includes(v) && "bg-green-600"
                                )}
                              >
                                {v}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Messages Tab */}
                <TabsContent value="messages" className="space-y-3">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4 pr-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2">Current Messages:</div>
                          <Card className="p-3 bg-muted/50">
                            <pre className="text-xs whitespace-pre-wrap font-mono">
                              {JSON.stringify(comparison.current.messages, null, 2)}
                            </pre>
                          </Card>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">Latest Messages:</div>
                          <Card className="p-3 bg-primary/5">
                            <pre className="text-xs whitespace-pre-wrap font-mono">
                              {JSON.stringify(comparison.latest.messages, null, 2)}
                            </pre>
                          </Card>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Settings Tab */}
                <TabsContent value="settings" className="space-y-3">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4 pr-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2">Current Settings:</div>
                          <Card className="p-3 bg-muted/50">
                            <pre className="text-xs whitespace-pre-wrap font-mono">
                              {JSON.stringify(comparison.current.settings, null, 2)}
                            </pre>
                          </Card>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">Latest Settings:</div>
                          <Card className="p-3 bg-primary/5">
                            <pre className="text-xs whitespace-pre-wrap font-mono">
                              {JSON.stringify(comparison.latest.settings, null, 2)}
                            </pre>
                          </Card>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>

                {/* Defaults Tab */}
                <TabsContent value="defaults" className="space-y-3">
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-4 pr-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium mb-2">Current Defaults:</div>
                          <Card className="p-3 bg-muted/50">
                            <pre className="text-xs whitespace-pre-wrap font-mono">
                              {JSON.stringify(comparison.current.variableDefaults, null, 2)}
                            </pre>
                          </Card>
                        </div>
                        <div>
                          <div className="text-sm font-medium mb-2">Latest Defaults:</div>
                          <Card className="p-3 bg-primary/5">
                            <pre className="text-xs whitespace-pre-wrap font-mono">
                              {JSON.stringify(comparison.latest.variableDefaults, null, 2)}
                            </pre>
                          </Card>
                        </div>
                      </div>
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={onClose} disabled={updating}>
                Cancel
              </Button>
              <Button 
                onClick={handleUpdate} 
                disabled={updating || !hasChanges || !comparison.compatible}
              >
                {updating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Updating...
                  </>
                ) : (
                  'Update to Latest'
                )}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

