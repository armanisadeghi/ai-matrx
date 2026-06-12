/**
 * ConvertToBuiltinModal
 * 
 * Step-based flow for converting/updating a prompt builtin and managing shortcuts.
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight,
  RefreshCw,
  Plus,
  Link as LinkIcon,
  ChevronRight,
  ExternalLink,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from '@/lib/toast-service';
import { 
  getBuiltinsBySourcePromptId, 
  fetchShortcutCategories,
  fetchShortcutsWithRelations,
  createPromptShortcut,
  updatePromptShortcut,
  getPromptBuiltinById,
} from '@/features/prompt-builtins/services/admin-service';
import { 
  PromptBuiltin, 
  ShortcutCategory, 
  PromptShortcut,
  CreatePromptShortcutInput,
} from '@/features/prompt-builtins/types/core';
import type { PromptVariable } from '@/features/prompts/types/core';
import { filterAndSortBySearch } from '@/utils/search-scoring';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { getPlacementTypeMeta } from '@/features/prompt-builtins/constants';
import { ShortcutFormFields } from '@/features/prompt-builtins/components/ShortcutFormFields';
import { ScopeMappingEditor } from '@/features/prompt-builtins/components/ScopeMappingEditor';

interface CurrentPromptData {
  name: string;
  messages?: unknown;
  variableDefaults?: PromptVariable[];
  settings?: Record<string, unknown>;
  description?: string;
  tools?: unknown;
}

interface ConvertToBuiltinModalProps {
  isOpen: boolean;
  onClose: () => void;
  promptId: string;
  promptName: string;
  /** Live in-memory prompt data from the editor — uses DB fallback if not provided */
  currentPromptData?: CurrentPromptData;
  onSuccess?: () => void;
}

type FlowStep = 
  | 'checking'                    // Checking for existing builtins
  | 'builtin-choice'              // Choose: create new or update existing
  | 'variable-comparison'         // Show variable changes (if updating)
  | 'processing-builtin'          // Creating/updating the builtin
  | 'shortcut-choice'             // Choose: create new, link existing, or skip
  | 'shortcut-form'               // Create/edit shortcut
  | 'processing-shortcut'         // Saving shortcut
  | 'complete';                   // Done!

interface ShortcutWithRelations extends PromptShortcut {
  category: ShortcutCategory | null;
  builtin: PromptBuiltin | null;
}

const DEFAULT_AVAILABLE_SCOPES = ['selection', 'content', 'context'];

// Extract the canonical variable name (trimmed) for comparison.
function normalizeVarName(v: PromptVariable): string {
  return (v.name || '').trim();
}

// Helper to compare variables by NAME ONLY.
// Sample/default values are intentionally ignored — only structural changes
// (variables added or removed, which includes renames) matter here.
function compareVariables(
  oldVars: PromptVariable[] | undefined,
  newVars: PromptVariable[] | undefined
): { added: PromptVariable[]; removed: PromptVariable[]; changed: never[] } {
  const oldNames = new Set((oldVars || []).map(normalizeVarName));
  const newNames = new Set((newVars || []).map(normalizeVarName));

  const added: PromptVariable[] = (newVars || []).filter(v => !oldNames.has(normalizeVarName(v)));
  const removed: PromptVariable[] = (oldVars || []).filter(v => !newNames.has(normalizeVarName(v)));

  // `changed` is intentionally empty — value changes are never a structural break.
  return { added, removed, changed: [] };
}

export function ConvertToBuiltinModal({
  isOpen,
  onClose,
  promptId,
  promptName,
  currentPromptData,
  onSuccess,
}: ConvertToBuiltinModalProps) {
  const router = useRouter();
  
  // Flow state
  const [step, setStep] = useState<FlowStep>('checking');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Step 1: Builtin management
  const [existingBuiltins, setExistingBuiltins] = useState<PromptBuiltin[]>([]);
  const [selectedBuiltin, setSelectedBuiltin] = useState<PromptBuiltin | null>(null);
  const [builtinAction, setBuiltinAction] = useState<'update' | 'create-new'>('update');
  const [createdBuiltin, setCreatedBuiltin] = useState<PromptBuiltin | null>(null);
  const [variableComparison, setVariableComparison] = useState<ReturnType<typeof compareVariables> | null>(null);
  const [promptVariables, setPromptVariables] = useState<PromptVariable[]>([]);
  
  // Step 2: Shortcut management
  const [shortcuts, setShortcuts] = useState<ShortcutWithRelations[]>([]);
  const [categories, setCategories] = useState<ShortcutCategory[]>([]);
  const [shortcutAction, setShortcutAction] = useState<'create' | 'link' | 'skip'>('create');
  const [selectedShortcut, setSelectedShortcut] = useState<PromptShortcut | null>(null);
  const [loadingShortcuts, setLoadingShortcuts] = useState(false);
  const [shortcutSearch, setShortcutSearch] = useState('');
  const [shortcutFilter, setShortcutFilter] = useState<'all' | 'unused' | 'in-use'>('unused');
  
  // New shortcut form data
  const [newShortcutData, setNewShortcutData] = useState<Partial<CreatePromptShortcutInput>>({
    label: promptName,
    description: '',
    icon_name: 'Hammer',
    category_id: '',
    prompt_builtin_id: null,
    scope_mappings: null,
    is_active: true,
  });

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('checking');
      setError('');
      setCreatedBuiltin(null);
      setSelectedBuiltin(null);
      setVariableComparison(null);
      checkForExistingBuiltins();
    } else {
      // Reset all state
      setExistingBuiltins([]);
      setSelectedBuiltin(null);
      setBuiltinAction('update');
      setCreatedBuiltin(null);
      setShortcuts([]);
      setCategories([]);
      setShortcutAction('create');
      setSelectedShortcut(null);
      setShortcutSearch('');
      setShortcutFilter('unused');
      setNewShortcutData({
        label: promptName,
        description: '',
        icon_name: 'Hammer',
        category_id: '',
        prompt_builtin_id: null,
        scope_mappings: null,
        is_active: true,
      });
    }
  }, [isOpen, promptId, promptName]);

  // Get prompt variables — use live editor data if available, otherwise fall back to DB fetch
  const fetchPromptData = async () => {
    if (currentPromptData) {
      const variables = currentPromptData.variableDefaults || [];
      console.log('📊 Using live prompt variables:', variables);
      setPromptVariables(variables);
      return;
    }

    try {
      const response = await fetch(`/api/prompts/${promptId}`);
      if (!response.ok) throw new Error('Failed to fetch prompt data');
      
      const data = await response.json();
      const variables = data.variable_defaults || [];
      console.log('📊 Fetched prompt variables from DB:', variables);
      setPromptVariables(variables);
    } catch (err: unknown) {
      console.error('Error fetching prompt data:', err);
      setPromptVariables([]);
    }
  };

  // Check for existing builtins
  const checkForExistingBuiltins = async () => {
    try {
      // Fetch prompt variables first
      await fetchPromptData();
      
      const builtins = await getBuiltinsBySourcePromptId(promptId);
      setExistingBuiltins(builtins);
      
      if (builtins.length > 0) {
        setSelectedBuiltin(builtins[0]);
        setBuiltinAction('update');
      } else {
        setBuiltinAction('create-new');
      }
      setStep('builtin-choice');
    } catch (err: any) {
      console.error('Error checking for existing builtins:', err);
      setError(err.message || 'Failed to check for existing builtins');
      setBuiltinAction('create-new');
      setStep('builtin-choice');
    }
  };

  // Handle builtin creation/update
  const handleBuiltinAction = async () => {
    if (builtinAction === 'update' && !selectedBuiltin) return;

    // If updating, check variables first
    if (builtinAction === 'update' && selectedBuiltin && step === 'builtin-choice') {
      const currentVars = (selectedBuiltin.variableDefaults as PromptVariable[] | undefined) || [];
      console.log('🔍 Comparing variables:');
      console.log('  Current builtin variables:', currentVars);
      console.log('  Updated prompt variables:', promptVariables);
      
      const comparison = compareVariables(currentVars, promptVariables);
      console.log('  Comparison result:', comparison);
      
      if (comparison.added.length > 0 || comparison.removed.length > 0 || comparison.changed.length > 0) {
        setVariableComparison(comparison);
        setStep('variable-comparison');
        return;
      }
    }

    setIsProcessing(true);
    setError('');
    setStep('processing-builtin');

    try {
      const response = await fetch(`/api/admin/prompt-builtins/convert-from-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt_id: promptId,
          builtin_id: builtinAction === 'update' ? selectedBuiltin?.id : undefined,
          // Pass live editor data so the API uses current state, not a stale DB snapshot
          prompt_data: currentPromptData ?? null,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Operation failed (${response.status})`);
      }

      const data = await response.json();
      
      // Fetch the full builtin data
      const builtin = await getPromptBuiltinById(data.builtin_id);
      if (!builtin) throw new Error('Failed to fetch builtin data');
      
      setCreatedBuiltin(builtin);
      
      // Update the new shortcut data to include the builtin ID
      setNewShortcutData(prev => ({
        ...prev,
        prompt_builtin_id: builtin.id,
      }));
      
      toast.success(data.is_update ? 'Builtin updated successfully!' : 'Builtin created successfully!');
      
      // Load shortcuts for next step
      await loadShortcutsAndCategories(data.builtin_id);
      setStep('shortcut-choice');
      
    } catch (err: any) {
      console.error('Builtin operation error:', err);
      setError(err.message || 'An unexpected error occurred');
      setStep('builtin-choice');
    } finally {
      setIsProcessing(false);
    }
  };

  // Load shortcuts and categories
  const loadShortcutsAndCategories = async (builtinId: string) => {
    setLoadingShortcuts(true);
    try {
      const [categoriesData, shortcutsData] = await Promise.all([
        fetchShortcutCategories({ is_active: true }),
        fetchShortcutsWithRelations({ is_active: true }),
      ]);

      setCategories(categoriesData);
      
      // Store ALL shortcuts so user can link to any of them
      setShortcuts(shortcutsData);
      
      // Find shortcuts linked to this builtin
      const linkedShortcuts = shortcutsData.filter(s => s.prompt_builtin_id === builtinId);
      
      console.log('📋 Loaded shortcuts:', {
        total: shortcutsData.length,
        linkedToThisBuiltin: linkedShortcuts.length,
        unlinked: shortcutsData.filter(s => !s.prompt_builtin_id).length,
        linkedToOther: shortcutsData.filter(s => s.prompt_builtin_id && s.prompt_builtin_id !== builtinId).length,
      });
      
      // If there are linked shortcuts, default to keeping them (safe option)
      if (linkedShortcuts.length > 0) {
        setSelectedShortcut(linkedShortcuts[0]);
        setShortcutAction('skip'); // Default to "Keep Current Shortcut"
      } else if (shortcutsData.length > 0) {
        // If there are any shortcuts at all, default to link option
        setShortcutAction('link');
      } else {
        setShortcutAction('create');
      }
    } catch (err: any) {
      console.error('Error loading shortcuts:', err);
      setError(err.message || 'Failed to load shortcuts');
    } finally {
      setLoadingShortcuts(false);
    }
  };

  // Handle shortcut creation/linking
  const handleShortcutAction = async () => {
    if (!createdBuiltin) return;

    if (shortcutAction === 'skip') {
      setStep('complete');
      return;
    }

    setIsProcessing(true);
    setError('');
    setStep('processing-shortcut');

    try {
      if (shortcutAction === 'create') {
        // Create new shortcut
        const shortcutInput: CreatePromptShortcutInput = {
          label: newShortcutData.label || promptName,
          description: newShortcutData.description || '',
          icon_name: newShortcutData.icon_name || 'Hammer',
          category_id: newShortcutData.category_id || '',
          prompt_builtin_id: createdBuiltin.id,
          scope_mappings: newShortcutData.scope_mappings,
          is_active: newShortcutData.is_active,
        };

        await createPromptShortcut(shortcutInput);
        toast.success('Shortcut created successfully!');
      } else if (shortcutAction === 'link' && selectedShortcut) {
        // Link existing shortcut
        await updatePromptShortcut({
          id: selectedShortcut.id,
          prompt_builtin_id: createdBuiltin.id,
        });
        toast.success('Shortcut linked successfully!');
      }

      setStep('complete');
    } catch (err: any) {
      console.error('Shortcut operation error:', err);
      setError(err.message || 'An unexpected error occurred');
      setStep('shortcut-choice');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = () => {
    onSuccess?.();
    onClose();
  };

  const handleResetAndClose = () => {
    if (!isProcessing) {
      onClose();
    }
  };

  // Filter and search shortcuts
  const filteredShortcuts = useMemo(() => {
    if (!createdBuiltin) return [];
    
    let filtered = shortcuts;
    
    // Apply filter
    if (shortcutFilter === 'unused') {
      filtered = filtered.filter(s => !s.prompt_builtin_id);
    } else if (shortcutFilter === 'in-use') {
      filtered = filtered.filter(s => !!s.prompt_builtin_id);
    }
    
    // Apply search
    if (shortcutSearch.trim()) {
      filtered = filterAndSortBySearch(filtered, shortcutSearch, [
        { get: (s) => s.label, weight: 'title' },
        { get: (s) => s.category?.label, weight: 'subtitle' },
        { get: (s) => s.description, weight: 'body' },
      ]);
    }
    
    return filtered;
  }, [shortcuts, shortcutFilter, shortcutSearch, createdBuiltin]);

  // Render content based on step
  const renderContent = () => {
    switch (step) {
      case 'checking':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">Checking for existing builtins...</p>
          </div>
        );

      case 'builtin-choice':
        const hasExistingBuiltins = existingBuiltins.length > 0;
        
        return (
          <div className="space-y-3">
            <RadioGroup value={builtinAction} onValueChange={(v) => setBuiltinAction(v as 'update' | 'create-new')}>
              <div className="space-y-2">
                <div className={`flex items-center space-x-2 p-2 rounded border ${hasExistingBuiltins ? 'bg-card' : 'bg-muted/50 opacity-60'}`}>
                  <RadioGroupItem value="update" id="update" disabled={!hasExistingBuiltins} />
                  <Label htmlFor="update" className={`font-medium flex-1 ${hasExistingBuiltins ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                    Update Existing Builtin
                    {!hasExistingBuiltins && <span className="text-xs text-muted-foreground ml-2">(none found)</span>}
                  </Label>
                </div>

                <div className="flex items-center space-x-2 p-2 rounded border bg-card">
                  <RadioGroupItem value="create-new" id="create-new" />
                  <Label htmlFor="create-new" className="font-medium cursor-pointer flex-1">Create New Builtin</Label>
                </div>
              </div>
            </RadioGroup>

            {builtinAction === 'update' && hasExistingBuiltins && (
              <div className="space-y-1.5">
                <Label className="text-sm">Select Builtin</Label>
                <Select 
                  value={selectedBuiltin?.id} 
                  onValueChange={(id) => setSelectedBuiltin(existingBuiltins.find(b => b.id === id) || null)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {existingBuiltins.map(builtin => (
                      <SelectItem key={builtin.id} value={builtin.id}>
                        {builtin.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'variable-comparison':
        const currentVars = (selectedBuiltin?.variableDefaults as PromptVariable[] | undefined) || [];
        const updatedVars = promptVariables || [];
        
        return (
          <div className="space-y-3">
            <Alert variant="default" className="border-warning bg-warning/10">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <AlertDescription className="text-foreground">
                <strong>Variable Changes Detected</strong> - Review carefully before updating as this may affect existing shortcuts.
              </AlertDescription>
            </Alert>

            {/* Side-by-side comparison */}
            <div className="grid grid-cols-2 gap-3">
              {/* Current Variables */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs">Current ({currentVars.length})</h4>
                </div>
                <ScrollArea className="h-[250px] border rounded p-2 bg-muted/30">
                  {currentVars.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8">
                      No variables
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {currentVars.map((v) => {
                        const isRemoved = variableComparison?.removed.some(rv => rv.name === v.name);

                        return (
                          <div
                            key={v.name}
                            className={`p-1.5 rounded border text-xs ${
                              isRemoved
                                ? 'bg-destructive/10 border-destructive/30'
                                : 'bg-background border-border'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <code className="font-mono font-semibold">{v.name}</code>
                              {isRemoved && (
                                <Badge variant="destructive" className="text-[10px] px-1 py-0">REMOVED</Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>

              {/* Updated Variables */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs">Updated ({updatedVars.length})</h4>
                </div>
                <ScrollArea className="h-[250px] border rounded p-2 bg-muted/30">
                  {updatedVars.length === 0 ? (
                    <div className="text-xs text-muted-foreground text-center py-8">
                      No variables
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {updatedVars.map((v) => {
                        const isAdded = variableComparison?.added.some(av => av.name === v.name);

                        return (
                          <div
                            key={v.name}
                            className={`p-1.5 rounded border text-xs ${
                              isAdded
                                ? 'bg-success/10 border-success/30'
                                : 'bg-background border-border'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-1.5">
                              <code className="font-mono font-semibold">{v.name}</code>
                              {isAdded && (
                                <Badge variant="outline" className="text-[10px] px-1 py-0 bg-success/20 border-success">NEW</Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* Summary of changes */}
            {variableComparison && (variableComparison.added.length > 0 || variableComparison.removed.length > 0) && (
              <div className="p-2 bg-muted rounded border">
                <div className="flex flex-wrap gap-2 text-xs">
                  {variableComparison.added.length > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-success" />
                      <span><strong>{variableComparison.added.length}</strong> added</span>
                    </div>
                  )}
                  {variableComparison.removed.length > 0 && (
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                      <span><strong>{variableComparison.removed.length}</strong> removed</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'processing-builtin':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">
              {builtinAction === 'update' ? 'Updating builtin...' : 'Creating builtin...'}
            </p>
          </div>
        );

      case 'shortcut-choice':
        const hasAnyShortcuts = shortcuts.length > 0;
        const linkedShortcuts = shortcuts.filter(s => s.prompt_builtin_id === createdBuiltin?.id);
        const hasLinkedShortcuts = linkedShortcuts.length > 0;

        return (
          <div className="space-y-3">
            {/* Show currently linked shortcuts if any */}
            {hasLinkedShortcuts && (
              <Alert className="border-success/30 bg-success/5">
                <CheckCircle2 className="h-4 w-4 text-success" />
                <AlertDescription>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <strong className="text-foreground">Currently Linked Shortcut{linkedShortcuts.length > 1 ? 's' : ''}:</strong>
                      <div className="mt-1.5 space-y-1">
                        {linkedShortcuts.map(shortcut => (
                          <div key={shortcut.id} className="flex items-center gap-2">
                            <div className="text-sm font-medium text-foreground">{shortcut.label}</div>
                            {shortcut.category && (
                              <Badge variant="secondary" className="text-xs">
                                {shortcut.category.label}
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            <RadioGroup value={shortcutAction} onValueChange={(v) => setShortcutAction(v as 'create' | 'link' | 'skip')}>
              <div className="space-y-2">
                {/* Safe option when there's already a linked shortcut */}
                {hasLinkedShortcuts && (
                  <div className="flex items-center space-x-2 p-2 rounded border bg-success/10 border-success/30">
                    <RadioGroupItem value="skip" id="skip" />
                    <Label htmlFor="skip" className="font-medium cursor-pointer flex-1">
                      Keep Current Shortcut
                      <span className="text-xs text-muted-foreground ml-2">(no changes)</span>
                    </Label>
                  </div>
                )}
                
                <div className="flex items-center space-x-2 p-2 rounded border bg-card">
                  <RadioGroupItem value="create" id="create" />
                  <Label htmlFor="create" className="font-medium cursor-pointer flex-1">Create New Shortcut</Label>
                </div>

                {hasAnyShortcuts && (
                  <div className="flex items-center space-x-2 p-2 rounded border bg-card">
                    <RadioGroupItem value="link" id="link" />
                    <Label htmlFor="link" className="font-medium cursor-pointer flex-1">
                      {hasLinkedShortcuts ? 'Change Linked Shortcut' : 'Link Existing Shortcut'}
                    </Label>
                  </div>
                )}

                {/* Skip option only when there's no linked shortcut */}
                {!hasLinkedShortcuts && (
                  <div className="flex items-center space-x-2 p-2 rounded border bg-card">
                    <RadioGroupItem value="skip" id="skip" />
                    <Label htmlFor="skip" className="font-medium cursor-pointer flex-1">
                      Skip for Now
                      <span className="text-xs text-muted-foreground ml-2">(no shortcut)</span>
                    </Label>
                  </div>
                )}
              </div>
            </RadioGroup>

            {shortcutAction === 'link' && hasAnyShortcuts && (
              <div className="space-y-2">
                <Label className="text-sm">Select Shortcut</Label>
                
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search shortcuts..."
                    value={shortcutSearch}
                    onChange={(e) => setShortcutSearch(e.target.value)}
                    className="pl-9 h-9"
                  />
                </div>

                {/* Filter Tabs */}
                <Tabs value={shortcutFilter} onValueChange={(v) => setShortcutFilter(v as 'all' | 'unused' | 'in-use')} className="w-full">
                  <TabsList className="grid w-full grid-cols-3 h-8">
                    <TabsTrigger value="all" className="text-xs">All ({shortcuts.length})</TabsTrigger>
                    <TabsTrigger value="unused" className="text-xs">Unused ({shortcuts.filter(s => !s.prompt_builtin_id).length})</TabsTrigger>
                    <TabsTrigger value="in-use" className="text-xs">In Use ({shortcuts.filter(s => !!s.prompt_builtin_id).length})</TabsTrigger>
                  </TabsList>
                </Tabs>
                
                {loadingShortcuts ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filteredShortcuts.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No shortcuts found
                  </div>
                ) : (
                  <ScrollArea className="h-[300px]">
                    <div className="space-y-1.5">
                      {filteredShortcuts.map(shortcut => {
                        const isLinkedToThis = shortcut.prompt_builtin_id === createdBuiltin?.id;
                        const isLinkedToOther = shortcut.prompt_builtin_id && shortcut.prompt_builtin_id !== createdBuiltin?.id;
                        
                        return (
                          <div
                            key={shortcut.id}
                            onClick={() => setSelectedShortcut(shortcut)}
                            className={`p-2 border rounded cursor-pointer transition-colors ${
                              selectedShortcut?.id === shortcut.id
                                ? 'border-primary bg-primary/5'
                                : 'hover:border-primary/50 hover:bg-accent/50'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium text-sm">{shortcut.label}</div>
                              {isLinkedToThis && (
                                <Badge variant="outline" className="text-xs bg-success/10 border-success">Current</Badge>
                              )}
                              {isLinkedToOther && (
                                <Badge variant="outline" className="text-xs bg-warning/10 border-warning">Reassign</Badge>
                              )}
                            </div>
                            {shortcut.description && (
                              <div className="text-xs text-muted-foreground line-clamp-1 mt-1">
                                {shortcut.description}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-1 mt-1.5">
                              {shortcut.category && (
                                <Badge variant="secondary" className="text-xs">
                                  {shortcut.category.label}
                                </Badge>
                              )}
                              {isLinkedToOther && shortcut.builtin && (
                                <Badge variant="outline" className="text-xs">
                                  {shortcut.builtin.name}
                                </Badge>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'shortcut-form':
        return (
          <div className="space-y-3">
            {createdBuiltin && (
              <ShortcutFormFields
                formData={newShortcutData as CreatePromptShortcutInput}
                onChange={(updates) => setNewShortcutData(prev => ({ ...prev, ...updates }))}
                categories={categories}
                builtins={[createdBuiltin]}
                builtinVariables={createdBuiltin.variableDefaults || []}
                mode="from-builtin"
                compact
                excludedPlacementTypes={['user-tool', 'organization-tool', 'quick-action', 'content-block']}
              />
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
        );

      case 'processing-shortcut':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
            <p className="text-sm text-muted-foreground">
              {shortcutAction === 'create' ? 'Creating shortcut...' : 'Linking shortcut...'}
            </p>
          </div>
        );

      case 'complete':
        return (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="bg-success/10 rounded-full p-4 mb-4">
              <CheckCircle2 className="h-8 w-8 text-success" />
            </div>
            <h3 className="text-lg font-semibold mb-2">All Done!</h3>
            <p className="text-sm text-muted-foreground text-center max-w-md">
              {builtinAction === 'update' ? 'Builtin updated' : 'Builtin created'}
              {shortcutAction !== 'skip' && (shortcutAction === 'create' ? ' and shortcut created' : ' and shortcut linked')} successfully!
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  // Render action buttons
  const renderActions = () => {
    switch (step) {
      case 'checking':
        return null;

      case 'builtin-choice':
        return (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleResetAndClose} disabled={isProcessing} size="sm">
              Cancel
            </Button>
            <Button 
              onClick={() => handleBuiltinAction()} 
              disabled={isProcessing || (builtinAction === 'update' && !selectedBuiltin)}
              size="sm"
            >
              {builtinAction === 'update' ? 'Update' : 'Create'}
              <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
          </div>
        );

      case 'variable-comparison':
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('builtin-choice')} disabled={isProcessing} size="sm">
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleResetAndClose} disabled={isProcessing} size="sm">
                Cancel
              </Button>
              <Button onClick={() => handleBuiltinAction()} disabled={isProcessing} size="sm">
                Confirm Update
                <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );

      case 'processing-builtin':
        return null;

      case 'shortcut-choice':
        return (
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleResetAndClose} disabled={isProcessing} size="sm">
              Cancel
            </Button>
            {shortcutAction === 'create' ? (
              <Button 
                onClick={() => setStep('shortcut-form')} 
                disabled={isProcessing}
                size="sm"
              >
                Configure
                <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button 
                onClick={() => handleShortcutAction()} 
                disabled={isProcessing || (shortcutAction === 'link' && !selectedShortcut)}
                size="sm"
              >
                {shortcutAction === 'skip' ? 'Finish' : 'Link'}
                <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );

      case 'shortcut-form':
        return (
          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep('shortcut-choice')} disabled={isProcessing} size="sm">
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleResetAndClose} disabled={isProcessing} size="sm">
                Cancel
              </Button>
              <Button 
                onClick={() => handleShortcutAction()} 
                disabled={isProcessing || !newShortcutData.category_id}
                size="sm"
              >
                Create
                <ChevronRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );

      case 'processing-shortcut':
        return null;

      case 'complete':
        return (
          <div className="flex justify-end gap-2">
            <Button onClick={handleComplete} size="sm">
              Close
            </Button>
            {createdBuiltin && (
              <Button 
                variant="outline"
                onClick={() => router.push('/administration/prompt-builtins')}
                size="sm"
              >
                View Builtins
                <ExternalLink className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  // Get step description
  const getStepDescription = () => {
    switch (step) {
      case 'checking':
        return 'Checking for existing builtins...';
      case 'builtin-choice':
        return existingBuiltins.length > 0 
          ? `Found ${existingBuiltins.length} existing builtin${existingBuiltins.length > 1 ? 's' : ''} - update or create new` 
          : 'No existing builtins found - creating new';
      case 'variable-comparison':
        return 'Review variable changes before updating';
      case 'processing-builtin':
        return builtinAction === 'update' ? 'Updating...' : 'Creating...';
      case 'shortcut-choice':
        return 'Create, link, or skip shortcut';
      case 'shortcut-form':
        return 'Configure new shortcut';
      case 'processing-shortcut':
        return shortcutAction === 'create' ? 'Creating...' : 'Linking...';
      case 'complete':
        return 'Completed successfully';
      default:
        return '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleResetAndClose}>
      <DialogContent 
        className="max-w-2xl max-h-[90dvh] flex flex-col p-0"
        onPointerDownOutside={(e) => isProcessing && e.preventDefault()}
      >
        <DialogHeader className="px-4 pt-3 pb-2 border-b">
          <DialogTitle>Convert to Builtin</DialogTitle>
          <DialogDescription>
            {getStepDescription()}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-4 py-3">
          {renderContent()}
        </div>

        <div className="px-4 pb-3 pt-2 border-t">
          {renderActions()}
        </div>
      </DialogContent>
    </Dialog>
  );
}
