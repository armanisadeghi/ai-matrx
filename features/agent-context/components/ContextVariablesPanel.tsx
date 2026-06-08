'use client';

import { useState, useMemo } from 'react';
import {
  Plus, Pencil, Trash2, ArrowUpFromLine, Shield, Eye, EyeOff, Zap, Search as SearchIcon,
  ChevronDown, ChevronRight, Loader2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { idMatchesQuery } from '@/utils/search-scoring';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  useScopeVariables,
  useCreateContextVariable,
  useUpdateContextVariable,
  useDeleteContextVariable,
} from '../hooks/useContextVariables';
import type { ContextVariable, ContextVariableFormData } from '../service/contextVariableService';
import type { ScopeState } from '../hooks/useContextScope';

// ─── Display config ─────────────────────────────────────────────────

const INJECT_AS_CONFIG: Record<string, { label: string; description: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  direct: { label: 'Inline (Tier 1)', description: 'Injected directly into the prompt', icon: Zap, color: 'text-green-500' },
  tool_accessible: { label: 'On Demand (Tier 2)', description: 'Available via ctx_get tool', icon: Eye, color: 'text-blue-500' },
  searchable: { label: 'Searchable (Tier 3)', description: 'Available via search tools', icon: SearchIcon, color: 'text-purple-500' },
  metadata: { label: 'Metadata', description: 'Not sent to the model', icon: EyeOff, color: 'text-gray-500' },
};

const VALUE_TYPES = ['string', 'number', 'boolean', 'json', 'secret', 'file_ref', 'model_ref', 'prompt_ref', 'tool_ref', 'template'];

type Props = {
  scope: ScopeState;
};

export function ContextVariablesPanel({ scope }: Props) {
  const { data: variables, isLoading } = useScopeVariables(scope.scopeType, scope.scopeId);
  const createMutation = useCreateContextVariable(scope.scopeType, scope.scopeId);
  const updateMutation = useUpdateContextVariable(scope.scopeType, scope.scopeId);
  const deleteMutation = useDeleteContextVariable(scope.scopeType, scope.scopeId);

  const [search, setSearch] = useState('');
  const [editDialog, setEditDialog] = useState<{ mode: 'create' | 'edit'; variable?: ContextVariable } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!variables) return [];
    if (!search.trim()) return variables;
    const q = search.toLowerCase();
    return variables.filter(v =>
      v.key.toLowerCase().includes(q) ||
      v.description?.toLowerCase().includes(q) ||
      v.tags?.some(t => t.toLowerCase().includes(q)) ||
      idMatchesQuery(v, q)
    );
  }, [variables, search]);

  // Group by inject_as
  const grouped = useMemo(() => {
    const groups = new Map<string, ContextVariable[]>();
    for (const v of filtered) {
      const key = v.inject_as || 'direct';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(v);
    }
    return groups;
  }, [filtered]);

  if (scope.scopeId === 'default') {
    return (
      <div className="py-12 text-center">
        <ArrowUpFromLine className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-sm font-medium mb-1">Select a scope</h3>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          Choose an organization, project, or task from the hierarchy to view and manage its context variables.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search variables..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>
        <div className="flex-1" />
        <Badge variant="outline" className="text-[10px] h-5">
          {variables?.length ?? 0} variables at this scope
        </Badge>
        <Button
          size="sm"
          className="h-8 text-xs gap-1"
          onClick={() => setEditDialog({ mode: 'create' })}
        >
          <Plus className="h-3.5 w-3.5" /> Add Variable
        </Button>
      </div>

      {/* Variables list */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center">
          {variables && variables.length === 0 ? (
            <>
              <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <h3 className="text-sm font-medium mb-1">No variables at this scope</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mb-4">
                Context variables provide information to AI agents automatically. Add variables like brand voice, tech stack, or project goals.
              </p>
              <Button
                size="sm"
                className="text-xs gap-1"
                onClick={() => setEditDialog({ mode: 'create' })}
              >
                <Plus className="h-3.5 w-3.5" /> Create First Variable
              </Button>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">No variables match &ldquo;{search}&rdquo;</p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {['direct', 'tool_accessible', 'searchable', 'metadata'].map(tier => {
            const items = grouped.get(tier);
            if (!items || items.length === 0) return null;
            const config = INJECT_AS_CONFIG[tier];
            const TierIcon = config.icon;

            return (
              <Card key={tier}>
                <CardHeader className="pb-2 pt-3 px-4">
                  <CardTitle className="text-xs font-semibold flex items-center gap-2">
                    <TierIcon className={`h-3.5 w-3.5 ${config.color}`} />
                    {config.label}
                    <span className="text-[10px] text-muted-foreground font-normal ml-1">{config.description}</span>
                    <Badge variant="secondary" className="ml-auto h-4 text-[10px] px-1">{items.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-4 pb-3">
                  <div className="divide-y divide-border/50">
                    {items.map(variable => (
                      <VariableRow
                        key={variable.id}
                        variable={variable}
                        onEdit={() => setEditDialog({ mode: 'edit', variable })}
                        onDelete={() => setDeleteConfirm(variable.id)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create/Edit dialog */}
      {editDialog && (
        <VariableFormDialog
          mode={editDialog.mode}
          variable={editDialog.variable}
          isPending={createMutation.isPending || updateMutation.isPending}
          onSave={(formData) => {
            if (editDialog.mode === 'create') {
              createMutation.mutate(formData, { onSuccess: () => setEditDialog(null) });
            } else if (editDialog.variable) {
              updateMutation.mutate(
                { id: editDialog.variable.id, updates: formData },
                { onSuccess: () => setEditDialog(null) }
              );
            }
          }}
          onClose={() => setEditDialog(null)}
        />
      )}

      {/* Delete confirm */}
      {deleteConfirm && (
        <AlertDialog open onOpenChange={() => setDeleteConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-sm">Delete variable?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs">
                This will permanently remove the variable. AI agents will no longer receive this value.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="text-xs h-8">Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="text-xs h-8 bg-destructive hover:bg-destructive/90"
                onClick={() => {
                  deleteMutation.mutate(deleteConfirm);
                  setDeleteConfirm(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}

// ─── Variable Row ───────────────────────────────────────────────────

function VariableRow({
  variable,
  onEdit,
  onDelete,
}: {
  variable: ContextVariable;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const valuePreview = useMemo(() => {
    if (variable.is_secret) return '••••••••';
    const val = variable.value;
    if (typeof val === 'string') return val.length > 120 ? val.slice(0, 120) + '…' : val;
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (val && typeof val === 'object') return JSON.stringify(val).slice(0, 120) + '…';
    return '—';
  }, [variable]);

  return (
    <div className="group flex items-start gap-3 py-2.5">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono font-semibold">{variable.key}</code>
          <Badge variant="outline" className="h-4 text-[9px] px-1">{variable.value_type}</Badge>
          {variable.is_secret && <Badge variant="destructive" className="h-4 text-[9px] px-1">Secret</Badge>}
          {variable.tags?.map(t => (
            <Badge key={t} variant="secondary" className="h-4 text-[9px] px-1">{t}</Badge>
          ))}
        </div>
        {variable.description && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{variable.description}</p>
        )}
        <p className="text-xs text-foreground/80 mt-1 font-mono bg-muted/30 rounded px-2 py-1 max-w-full truncate">
          {valuePreview}
        </p>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5">
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onEdit}>
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={onDelete}>
          <Trash2 className="h-3 w-3 text-destructive/70" />
        </Button>
      </div>
    </div>
  );
}

// ─── Form Dialog ────────────────────────────────────────────────────

function VariableFormDialog({
  mode,
  variable,
  isPending,
  onSave,
  onClose,
}: {
  mode: 'create' | 'edit';
  variable?: ContextVariable;
  isPending: boolean;
  onSave: (data: ContextVariableFormData) => void;
  onClose: () => void;
}) {
  const [key, setKey] = useState(variable?.key ?? '');
  const [valueStr, setValueStr] = useState(
    variable?.value != null
      ? typeof variable.value === 'string' ? variable.value : JSON.stringify(variable.value, null, 2)
      : ''
  );
  const [valueType, setValueType] = useState(variable?.value_type ?? 'string');
  const [injectAs, setInjectAs] = useState(variable?.inject_as ?? 'direct');
  const [description, setDescription] = useState(variable?.description ?? '');

  const handleSave = () => {
    let parsedValue: unknown = valueStr;
    if (valueType === 'number') parsedValue = Number(valueStr);
    else if (valueType === 'boolean') parsedValue = valueStr === 'true';
    else if (valueType === 'json') {
      try { parsedValue = JSON.parse(valueStr); } catch { parsedValue = valueStr; }
    }

    onSave({
      key: key.trim(),
      value: parsedValue,
      value_type: valueType,
      inject_as: injectAs,
      description: description || undefined,
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">
            {mode === 'create' ? 'Add Context Variable' : 'Edit Context Variable'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Key */}
          <div className="space-y-1.5">
            <Label className="text-xs">Key</Label>
            <Input
              value={key}
              onChange={e => setKey(e.target.value)}
              placeholder="e.g. brand_voice, tech_stack, coding_standards"
              className="h-8 text-xs font-mono"
              disabled={mode === 'edit'}
              autoFocus={mode === 'create'}
            />
          </div>

          {/* Value Type + Inject As */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Value Type</Label>
              <Select value={valueType} onValueChange={setValueType}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VALUE_TYPES.map(t => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Delivery Tier</Label>
              <Select value={injectAs} onValueChange={setInjectAs}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INJECT_AS_CONFIG).map(([val, cfg]) => (
                    <SelectItem key={val} value={val} className="text-xs">
                      {cfg.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Value */}
          <div className="space-y-1.5">
            <Label className="text-xs">Value</Label>
            <Textarea
              value={valueStr}
              onChange={e => setValueStr(e.target.value)}
              placeholder={
                valueType === 'json' ? '{ "key": "value" }'
                : valueType === 'boolean' ? 'true or false'
                : valueType === 'number' ? '42'
                : 'Enter the value...'
              }
              className="text-xs font-mono min-h-[80px] resize-y"
              rows={4}
            />
            {injectAs && INJECT_AS_CONFIG[injectAs] && (
              <p className="text-[10px] text-muted-foreground">{INJECT_AS_CONFIG[injectAs].description}</p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label className="text-xs">Description <span className="text-muted-foreground">(helps agents decide when to use this)</span></Label>
            <Input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. The client's preferred communication tone"
              className="h-8 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" className="text-xs" onClick={onClose}>Cancel</Button>
          <Button size="sm" className="text-xs" onClick={handleSave} disabled={!key.trim() || isPending}>
            {isPending ? 'Saving...' : mode === 'create' ? 'Create Variable' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
