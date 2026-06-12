'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Code2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';

export interface DebugData {
  /** Name/label of the prompt or shortcut */
  promptName: string;
  /** Placement type (e.g., 'context-menu', 'ai-action') */
  placementType: string;
  /** Selected text by user */
  selectedText?: string;
  /** Available context/scopes provided to the prompt */
  availableContext: Record<string, any>;
  /** Variables that were successfully resolved */
  resolvedVariables: Record<string, any>;
  /** Resolution status */
  canResolve: {
    canResolve: boolean;
    missingVariables: string[];
    resolvedVariables: string[];
  };
  /** Additional metadata */
  metadata?: {
    functionalityId?: string;
    scopeMappings?: any;
    availableScopes?: string[];
    promptSnapshot?: any;
  };
}

interface SystemPromptDebugModalProps {
  isOpen: boolean;
  onClose: () => void;
  debugData: DebugData | null;
}

export function SystemPromptDebugModal({
  isOpen,
  onClose,
  debugData,
}: SystemPromptDebugModalProps) {
  if (!debugData) return null;

  const {
    promptName,
    placementType,
    selectedText,
    availableContext,
    resolvedVariables,
    canResolve,
    metadata = {},
  } = debugData;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5" />
            Prompt Debug: {promptName}
          </DialogTitle>
          <DialogDescription>
            Real-time variable resolution and context inspection
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="space-y-6 p-4">
            {/* Resolution Status */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                {canResolve.canResolve ? (
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-600" />
                )}
                Resolution Status
              </h3>
              <div className="flex items-center gap-2">
                <Badge variant={canResolve.canResolve ? 'default' : 'destructive'}>
                  {canResolve.canResolve ? 'All Variables Resolved' : 'Missing Variables'}
                </Badge>
                {!canResolve.canResolve && (
                  <span className="text-sm text-muted-foreground">
                    Missing: {canResolve.missingVariables.join(', ')}
                  </span>
                )}
              </div>
            </div>

            <Separator />

            {/* Metadata */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Metadata</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {metadata.functionalityId && (
                  <div>
                    <span className="text-muted-foreground">Functionality ID:</span>
                    <code className="ml-2 bg-muted px-1 py-0.5 rounded text-xs">
                      {metadata.functionalityId}
                    </code>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">Placement Type:</span>
                  <Badge variant="outline" className="ml-2">
                    {placementType}
                  </Badge>
                </div>
              </div>
            </div>

            <Separator />

            {/* Selected Text */}
            {selectedText && (
              <>
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                    Selected Text
                    <Badge variant="secondary">{selectedText.length} chars</Badge>
                  </h3>
                  <div className="bg-muted p-3 rounded-lg text-sm font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
                    {selectedText || <span className="text-muted-foreground italic">No selection</span>}
                  </div>
                </div>
                <Separator />
              </>
            )}

            {/* Available Context */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Available Context</h3>
              <div className="bg-muted p-3 rounded-lg">
                <pre className="text-xs font-mono overflow-x-auto">
                  {JSON.stringify(availableContext, null, 2)}
                </pre>
              </div>
            </div>

            <Separator />

            {/* Resolved Variables */}
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                Resolved Variables
                <Badge>{Object.keys(resolvedVariables).length} variables</Badge>
              </h3>
              <div className="space-y-2">
                {Object.entries(resolvedVariables).map(([key, value]) => (
                  <div key={key} className="border rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <code className="text-sm font-semibold text-primary">
                        {'{{' + key + '}}'}
                      </code>
                      <Badge variant="outline" className="text-xs">
                        {typeof value === 'string' ? `${value.length} chars` : typeof value}
                      </Badge>
                    </div>
                    <div className="bg-muted p-2 rounded text-xs font-mono max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {typeof value === 'string' 
                        ? value 
                        : JSON.stringify(value, null, 2)
                      }
                    </div>
                  </div>
                ))}
                {Object.keys(resolvedVariables).length === 0 && (
                  <div className="text-sm text-muted-foreground italic">
                    No variables resolved
                  </div>
                )}
              </div>
            </div>

            {/* Missing Variables */}
            {canResolve.missingVariables.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    Missing Variables
                  </h3>
                  <div className="space-y-1">
                    {canResolve.missingVariables.map((varName) => (
                      <div key={varName} className="flex items-center gap-2">
                        <XCircle className="h-3 w-3 text-destructive" />
                        <code className="text-sm">{'{{' + varName + '}}'}</code>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Scope Mappings */}
            {metadata.scopeMappings && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2">Scope Mappings</h3>
                  <div className="bg-muted p-3 rounded-lg">
                    <pre className="text-xs font-mono overflow-x-auto">
                      {JSON.stringify(metadata.scopeMappings, null, 2)}
                    </pre>
                  </div>
                </div>
              </>
            )}

            {/* Available Scopes */}
            {metadata.availableScopes && metadata.availableScopes.length > 0 && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2">Available Scopes</h3>
                  <div className="flex flex-wrap gap-1">
                    {metadata.availableScopes.map((scope: string) => (
                      <Badge key={scope} variant="secondary">
                        {scope}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Prompt Snapshot */}
            {metadata.promptSnapshot && (
              <>
                <Separator />
                <div>
                  <h3 className="text-sm font-semibold mb-2">Prompt Snapshot</h3>
                  <div className="bg-muted p-3 rounded-lg">
                    <div className="space-y-2 text-xs">
                      {metadata.promptSnapshot.variables && (
                        <div>
                          <span className="text-muted-foreground">Variables:</span>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {metadata.promptSnapshot.variables.map((v: string) => (
                              <Badge key={v} variant="secondary" className="text-xs">
                                {'{{' + v + '}}'}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                      {metadata.promptSnapshot.variableDefaults && (
                        <div>
                          <span className="text-muted-foreground">Defaults:</span>
                          <pre className="mt-1 text-xs overflow-x-auto">
                            {JSON.stringify(metadata.promptSnapshot.variableDefaults, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

