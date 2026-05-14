'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Type, Hash, ToggleLeft, Braces, List, FileText, Link as LinkIcon,
  Plus, Trash2, Boxes, ChevronDown, ChevronUp, Info, Wand2, Globe,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ContextStatusStepper } from './ContextStatusBadge';
import { VALUE_TYPE_CONFIG, FETCH_HINT_CONFIG, SENSITIVITY_CONFIG, DEFAULT_CATEGORIES, REFERENCE_TYPES, STATUS_CONFIG } from '../constants';
import type {
  ContextItem, ContextItemValue, ContextItemFormData, ContextValueFormData,
  ContextValueType, ContextFetchHint, ContextSensitivity, ContextItemStatus,
} from '../types';

type Props = {
  item?: ContextItem | null;
  value?: ContextItemValue | null;
  /** Required for new items when URL scope has no `scopeTypeId` (must match a `ctx_scope_types.id`). */
  defaultScopeTypeId?: string | null;
  onSave: (formData: ContextItemFormData, valueData: ContextValueFormData) => void;
  isPending?: boolean;
};

export function ContextItemForm({ item, value, defaultScopeTypeId, onSave, isPending }: Props) {
  const isEdit = !!item;
  const hasExistingValue = !!(value && (value.value_text || value.value_number != null || value.value_boolean != null || value.value_json || value.value_document_url || value.value_reference_id));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [changeSummaryTouched, setChangeSummaryTouched] = useState(false);

  // Form state
  const [displayName, setDisplayName] = useState(item?.display_name ?? '');
  const [key, setKey] = useState(item?.key ?? '');
  const [description, setDescription] = useState(item?.description ?? '');
  const [category, setCategory] = useState(item?.category ?? '');
  const [tags, setTags] = useState<string[]>(item?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [status, setStatus] = useState<ContextItemStatus>(item?.status ?? 'stub');
  const [statusNote, setStatusNote] = useState(item?.status_note ?? '');
  const [valueType, setValueType] = useState<ContextValueType>(item?.value_type ?? 'string');
  const [fetchHint, setFetchHint] = useState<ContextFetchHint>(item?.fetch_hint ?? 'on_demand');
  const [sensitivity, setSensitivity] = useState<ContextSensitivity>(item?.sensitivity ?? 'internal');
  const [reviewEnabled, setReviewEnabled] = useState(!!item?.review_interval_days);
  const [reviewDays, setReviewDays] = useState(item?.review_interval_days ?? 30);
  const [changeSummary, setChangeSummary] = useState('');

  // Value state
  const [valueText, setValueText] = useState(value?.value_text ?? '');
  const [valueNumber, setValueNumber] = useState(value?.value_number ?? 0);
  const [valueBoolean, setValueBoolean] = useState(value?.value_boolean ?? false);
  const [valueJson, setValueJson] = useState<{ key: string; value: string }[]>(
    value?.value_json && typeof value.value_json === 'object' && !Array.isArray(value.value_json)
      ? Object.entries(value.value_json).map(([k, v]) => ({ key: k, value: String(v) }))
      : [{ key: '', value: '' }]
  );
  const [valueArray, setValueArray] = useState<string[]>(
    value?.value_json && Array.isArray(value.value_json)
      ? value.value_json.map(String)
      : ['']
  );
  const [valueDocUrl, setValueDocUrl] = useState(value?.value_document_url ?? '');
  const [valueDocSummary, setValueDocSummary] = useState(value?.value_text ?? '');
  const [valueRefId, setValueRefId] = useState(value?.value_reference_id ?? '');
  const [valueRefType, setValueRefType] = useState(value?.value_reference_type ?? 'context_item');

  // Auto-generate key from display name
  useEffect(() => {
    if (!isEdit && displayName) {
      const generated = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      setKey(generated);
    }
  }, [displayName, isEdit]);

  const charCount = valueType === 'string' ? valueText.length
    : valueType === 'document' ? valueDocSummary.length
    : 0;
  const dataPointCount = valueType === 'object' ? valueJson.filter(r => r.key).length
    : valueType === 'array' ? valueArray.filter(Boolean).length
    : 0;

  // JSON preview for object type
  const jsonPreview = useMemo(() => {
    if (valueType !== 'object') return '';
    const obj: Record<string, unknown> = {};
    valueJson.forEach(r => { if (r.key) obj[r.key] = r.value; });
    return JSON.stringify(obj, null, 2);
  }, [valueType, valueJson]);

  const hasNestedObjects = useMemo(() => {
    if (valueType !== 'object') return false;
    return valueJson.some(r => {
      try { const parsed = JSON.parse(r.value); return typeof parsed === 'object' && parsed !== null; } catch { return false; }
    });
  }, [valueType, valueJson]);

  const handleAddTag = useCallback(() => {
    const trimmed = tagInput.trim();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput('');
  }, [tagInput, tags]);

  const changeSummaryRequired = isEdit && hasExistingValue;
  const changeSummaryError = changeSummaryRequired && changeSummaryTouched && !changeSummary.trim();

  const buildValueData = (): ContextValueFormData => {
    const base = { change_summary: changeSummary || null };
    const empty = { value_text: null, value_number: null, value_boolean: null, value_json: null, value_document_url: null, value_document_size_bytes: null, value_reference_id: null, value_reference_type: null };

    switch (valueType) {
      case 'string': return { ...empty, ...base, value_text: valueText || null };
      case 'number': return { ...empty, ...base, value_number: valueNumber };
      case 'boolean': return { ...empty, ...base, value_boolean: valueBoolean };
      case 'object': {
        const obj: Record<string, unknown> = {};
        valueJson.forEach(r => { if (r.key) obj[r.key] = r.value; });
        return { ...empty, ...base, value_json: obj };
      }
      case 'array': return { ...empty, ...base, value_json: valueArray.filter(Boolean) };
      case 'document': return { ...empty, ...base, value_text: valueDocSummary || null, value_document_url: valueDocUrl || null };
      case 'reference': return { ...empty, ...base, value_reference_id: valueRefId || null, value_reference_type: valueRefType || null };
    }
  };

  const scopeTypeOk = isEdit || !!defaultScopeTypeId;
  const canSubmit = displayName && key && description && scopeTypeOk && (!changeSummaryRequired || changeSummary.trim());

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (changeSummaryRequired && !changeSummary.trim()) {
      setChangeSummaryTouched(true);
      return;
    }
    const formData: ContextItemFormData = {
      display_name: displayName,
      key,
      description,
      category: category || null,
      tags,
      status,
      status_note: statusNote || null,
      value_type: valueType,
      fetch_hint: fetchHint,
      sensitivity,
      source_type: 'manual',
      scope_type_id: item?.scope_type_id ?? defaultScopeTypeId ?? '',
      review_interval_days: reviewEnabled ? reviewDays : null,
      last_verified_at: null,
      depends_on: [],
    };
    onSave(formData, buildValueData());
  };

  return (
    <form onSubmit={handleSubmit} className="grid md:grid-cols-[1fr_340px] gap-4">
      {/* Left panel — Form */}
      <div className="space-y-4">
        {/* Core fields */}
        <Card>
          <CardContent className="p-4 space-y-4">
            <div>
              <Label className="text-xs font-medium">Display Name</Label>
              <Input
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="e.g. Brand Identity"
                className="mt-1 text-sm font-semibold"
                required
              />
              <div className="flex items-center gap-2 mt-1.5">
                <Label className="text-[10px] text-muted-foreground">Key:</Label>
                <Input
                  value={key}
                  onChange={e => setKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  className="h-6 text-[11px] font-mono bg-muted/50 max-w-[200px]"
                  pattern="^[a-z0-9_]+$"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs font-medium">Description</Label>
                <span className="text-[10px] text-muted-foreground">{description.length}/500</span>
              </div>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 500))}
                placeholder="This is what the AI reads to decide whether to fetch this item. Be specific and concise."
                rows={3}
                className="text-xs"
                required
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                This is what the AI reads to decide whether to fetch this item
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-medium">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger className="mt-1 h-8 text-xs">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {DEFAULT_CATEGORIES.map(c => (
                      <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs font-medium">Tags</Label>
                <div className="flex gap-1 mt-1">
                  <Input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                    placeholder="Add tag"
                    className="h-8 text-xs flex-1"
                  />
                  <Button type="button" variant="outline" size="sm" className="h-8 px-2" onClick={handleAddTag}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {tags.map(t => (
                      <Badge key={t} variant="secondary" className="h-5 text-[10px] gap-1 cursor-pointer" onClick={() => setTags(tags.filter(x => x !== t))}>
                        {t} <span className="opacity-60">&times;</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Status — visual stepper with phases */}
            <div>
              <Label className="text-xs font-medium mb-2 block">Status</Label>
              <ContextStatusStepper
                value={status}
                onChange={setStatus}
                statusNote={statusNote}
                onStatusNoteChange={setStatusNote}
              />
            </div>
          </CardContent>
        </Card>

        {/* Value section */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <CardTitle className="text-sm font-semibold">Value</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {/* Value type selector — 7 visual toggle buttons */}
            <div className="flex flex-wrap gap-1">
              {(Object.entries(VALUE_TYPE_CONFIG) as [ContextValueType, { label: string; iconName: string }][]).map(([vt, cfg]) => {
                const icons: Record<string, React.ComponentType<{ className?: string }>> = { Type, Hash, ToggleLeft, Braces, List, FileText, Link: LinkIcon };
                const Icon = icons[cfg.iconName] ?? Type;
                return (
                  <button
                    key={vt}
                    type="button"
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs border transition-all ${valueType === vt ? 'bg-accent text-accent-foreground border-accent-foreground/20' : 'border-border hover:bg-muted text-muted-foreground'}`}
                    onClick={() => setValueType(vt)}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>

            {/* Agent placeholders — prominent */}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-purple-500/20 bg-purple-500/5 p-3 text-left hover:bg-purple-500/10 transition-colors"
              >
                <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                  <Wand2 className="h-4 w-4 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs font-medium">Let AI Interview Me</p>
                  <p className="text-[10px] text-muted-foreground">AI asks targeted questions to fill this item</p>
                </div>
                {/* TODO: Wire structured interview agent — asks 3-7 targeted questions for the item type, populates value fields, sets source_type='ai_generated' and status='ai_enriched' */}
              </button>
              <button
                type="button"
                className="flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3 text-left hover:bg-blue-500/10 transition-colors"
              >
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                  <Globe className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs font-medium">Research This For Me</p>
                  <p className="text-[10px] text-muted-foreground">AI researches and auto-populates from the web</p>
                </div>
                {/* TODO: Wire web research agent — researches using org/client name and item type, sets source_type='scraped' or 'ai_generated' */}
              </button>
            </div>

            {/* Value input by type */}
            <ValueInput
              type={valueType}
              valueText={valueText} onValueTextChange={setValueText}
              valueNumber={valueNumber} onValueNumberChange={setValueNumber}
              valueBoolean={valueBoolean} onValueBooleanChange={setValueBoolean}
              valueJson={valueJson} onValueJsonChange={setValueJson}
              valueArray={valueArray} onValueArrayChange={setValueArray}
              valueDocUrl={valueDocUrl} onValueDocUrlChange={setValueDocUrl}
              valueDocSummary={valueDocSummary} onValueDocSummaryChange={setValueDocSummary}
              valueRefId={valueRefId} onValueRefIdChange={setValueRefId}
              valueRefType={valueRefType} onValueRefTypeChange={setValueRefType}
              jsonPreview={jsonPreview}
              hasNestedObjects={hasNestedObjects}
            />

            {/* Live stats */}
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              {charCount > 0 && <span>{charCount.toLocaleString()} chars</span>}
              {dataPointCount > 0 && <span>{dataPointCount} data points</span>}
              {hasNestedObjects && (
                <Badge variant="outline" className="h-4 text-[9px] px-1">Contains nested objects — AI can navigate these</Badge>
              )}
            </div>

            {/* Change summary — required when editing with existing value */}
            {isEdit && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-medium">
                    What changed?
                    {changeSummaryRequired && <span className="text-destructive ml-0.5">*</span>}
                  </Label>
                </div>
                <Input
                  value={changeSummary}
                  onChange={e => { setChangeSummary(e.target.value); setChangeSummaryTouched(true); }}
                  onBlur={() => setChangeSummaryTouched(true)}
                  placeholder="Shown in version history"
                  className={`h-7 text-xs ${changeSummaryError ? 'border-destructive ring-1 ring-destructive/30' : ''}`}
                  required={changeSummaryRequired}
                />
                {changeSummaryError && (
                  <p className="text-[10px] text-destructive mt-0.5">Required when updating an existing value</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Advanced settings */}
        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="pb-2 pt-3 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold">Advanced Settings</CardTitle>
                  {advancedOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="px-4 pb-4 space-y-4">
                {/* Fetch hint — visual option cards */}
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Fetch Hint</Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(Object.entries(FETCH_HINT_CONFIG) as [ContextFetchHint, typeof FETCH_HINT_CONFIG['always']][]).map(([fh, cfg]) => (
                      <button
                        key={fh}
                        type="button"
                        className={`rounded-lg border p-2.5 text-left transition-all ${fetchHint === fh ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10' : 'border-border hover:bg-muted'}`}
                        onClick={() => setFetchHint(fh)}
                      >
                        <p className="text-xs font-medium">{cfg.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{cfg.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Sensitivity — visual option cards */}
                <div>
                  <Label className="text-xs font-medium mb-1.5 block">Sensitivity</Label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.entries(SENSITIVITY_CONFIG) as [ContextSensitivity, typeof SENSITIVITY_CONFIG['public']][]).map(([s, cfg]) => (
                      <button
                        key={s}
                        type="button"
                        className={`rounded-lg border p-2.5 text-left transition-all ${sensitivity === s ? 'border-primary/30 bg-primary/5 ring-1 ring-primary/10' : 'border-border hover:bg-muted'}`}
                        onClick={() => setSensitivity(s)}
                      >
                        <p className="text-xs font-medium">{cfg.label}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">{cfg.description}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Review schedule */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Switch checked={reviewEnabled} onCheckedChange={setReviewEnabled} />
                    <Label className="text-xs font-medium">Set a review reminder</Label>
                  </div>
                  {reviewEnabled && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Review every</Label>
                      <Input
                        type="number"
                        value={reviewDays}
                        onChange={e => setReviewDays(Number(e.target.value))}
                        className="h-7 w-20 text-xs"
                        min={1}
                      />
                      <Label className="text-xs text-muted-foreground">days</Label>
                    </div>
                  )}
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>

        {/* Submit */}
        <div className="flex gap-2">
          <Button type="submit" disabled={isPending || !canSubmit} className="text-xs">
            {isPending ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Item'}
          </Button>
          <Button type="button" variant="outline" className="text-xs" onClick={() => window.history.back()}>
            Cancel
          </Button>
        </div>
      </div>

      {/* Right panel — AI Manifest Preview */}
      <div className="hidden md:block">
        <div className="sticky top-4">
          <Card className="border-dashed">
            <CardHeader className="pb-2 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3 w-3" /> AI Agent Manifest Preview
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="rounded-lg bg-muted/30 border border-border/50 p-3 font-mono text-[11px] space-y-1.5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <span className="text-foreground">{key || 'item_key'}</span>
                  <span>&middot;</span>
                  <span>{category || 'uncategorized'}</span>
                  <span>&middot;</span>
                  <span>{fetchHint}</span>
                </div>
                <p className="text-sm font-sans font-semibold">{displayName || 'Display Name'}</p>
                <p className="text-xs font-sans text-muted-foreground">{description || 'Description will appear here'}</p>
                <hr className="border-border/50" />
                <div className="flex items-center gap-2 text-muted-foreground font-sans text-[10px]">
                  <span>Value: {valueType}</span>
                  {charCount > 0 && <><span>&middot;</span><span>{charCount} chars</span></>}
                  {dataPointCount > 0 && <><span>&middot;</span><span>{dataPointCount} data points</span></>}
                </div>
                <div className="flex items-center gap-2 text-muted-foreground font-sans text-[10px]">
                  <span>Status: {STATUS_CONFIG[status].label}</span>
                  <span>&middot;</span>
                  <span>Source: manual</span>
                </div>
                <p className="text-[10px] text-muted-foreground font-sans">Last verified: never</p>
              </div>
              <p className="text-[10px] text-muted-foreground mt-2 text-center">
                This is the card the AI agent reads before deciding whether to fetch the full value
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </form>
  );
}

// ─── Value Input Component ──────────────────────────────────────

type ValueInputProps = {
  type: ContextValueType;
  valueText: string; onValueTextChange: (v: string) => void;
  valueNumber: number; onValueNumberChange: (v: number) => void;
  valueBoolean: boolean; onValueBooleanChange: (v: boolean) => void;
  valueJson: { key: string; value: string }[]; onValueJsonChange: (v: { key: string; value: string }[]) => void;
  valueArray: string[]; onValueArrayChange: (v: string[]) => void;
  valueDocUrl: string; onValueDocUrlChange: (v: string) => void;
  valueDocSummary: string; onValueDocSummaryChange: (v: string) => void;
  valueRefId: string; onValueRefIdChange: (v: string) => void;
  valueRefType: string; onValueRefTypeChange: (v: string) => void;
  jsonPreview?: string;
  hasNestedObjects?: boolean;
};

function ValueInput(props: ValueInputProps) {
  const [showJsonPreview, setShowJsonPreview] = useState(false);

  switch (props.type) {
    case 'string':
      return (
        <Textarea
          value={props.valueText}
          onChange={e => props.onValueTextChange(e.target.value)}
          placeholder="Enter value..."
          rows={6}
          className="text-xs font-mono"
        />
      );
    case 'number':
      return (
        <Input
          type="number"
          value={props.valueNumber}
          onChange={e => props.onValueNumberChange(Number(e.target.value))}
          className="text-sm max-w-[200px]"
        />
      );
    case 'boolean':
      return (
        <div className="flex items-center gap-3">
          <Switch checked={props.valueBoolean} onCheckedChange={props.onValueBooleanChange} />
          <span className="text-sm font-medium">{props.valueBoolean ? 'True' : 'False'}</span>
        </div>
      );
    case 'object':
      return (
        <div className="space-y-2">
          {props.valueJson.map((row, i) => (
            <div key={i} className="flex gap-1.5">
              <Input
                value={row.key}
                onChange={e => {
                  const next = [...props.valueJson];
                  next[i] = { ...next[i], key: e.target.value };
                  props.onValueJsonChange(next);
                }}
                placeholder="Key"
                className="h-7 text-xs font-mono flex-1"
              />
              <Input
                value={row.value}
                onChange={e => {
                  const next = [...props.valueJson];
                  next[i] = { ...next[i], value: e.target.value };
                  props.onValueJsonChange(next);
                }}
                placeholder="Value"
                className="h-7 text-xs flex-[2]"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => props.onValueJsonChange(props.valueJson.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => props.onValueJsonChange([...props.valueJson, { key: '', value: '' }])}
            >
              <Plus className="h-3 w-3" /> Add field
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-muted-foreground"
              onClick={() => setShowJsonPreview(!showJsonPreview)}
            >
              {showJsonPreview ? 'Hide' : 'Show'} JSON Preview
            </Button>
          </div>
          {showJsonPreview && props.jsonPreview && (
            <pre className="rounded-lg bg-muted/50 border border-border p-2 text-[10px] font-mono overflow-x-auto max-h-40">
              {props.jsonPreview}
            </pre>
          )}
        </div>
      );
    case 'array':
      return (
        <div className="space-y-1.5">
          {props.valueArray.map((item, i) => (
            <div key={i} className="flex gap-1.5">
              <Input
                value={item}
                onChange={e => {
                  const next = [...props.valueArray];
                  next[i] = e.target.value;
                  props.onValueArrayChange(next);
                }}
                placeholder={`Item ${i + 1}`}
                className="h-7 text-xs flex-1"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => props.onValueArrayChange(props.valueArray.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-3 w-3 text-muted-foreground" />
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => props.onValueArrayChange([...props.valueArray, ''])}
          >
            <Plus className="h-3 w-3" /> Add item
          </Button>
        </div>
      );
    case 'document':
      return (
        <div className="space-y-2">
          <div>
            <Label className="text-xs">Document URL</Label>
            <Input
              value={props.valueDocUrl}
              onChange={e => props.onValueDocUrlChange(e.target.value)}
              placeholder="https://storage.example.com/..."
              className="mt-1 h-7 text-xs"
            />
            <p className="text-[10px] text-muted-foreground mt-0.5">Paste the storage URL. Add a summary so the AI knows what's in the document before fetching.</p>
          </div>
          <div>
            <Label className="text-xs">Summary</Label>
            <Textarea
              value={props.valueDocSummary}
              onChange={e => props.onValueDocSummaryChange(e.target.value)}
              placeholder="Describe what's in this document so the AI knows before fetching"
              rows={3}
              className="mt-1 text-xs"
            />
          </div>
        </div>
      );
    case 'reference':
      return (
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs">Reference ID</Label>
            <Input
              value={props.valueRefId}
              onChange={e => props.onValueRefIdChange(e.target.value)}
              placeholder="UUID"
              className="mt-1 h-7 text-xs font-mono"
            />
          </div>
          <div className="w-40">
            <Label className="text-xs">Type</Label>
            <Select value={props.valueRefType} onValueChange={props.onValueRefTypeChange}>
              <SelectTrigger className="mt-1 h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REFERENCE_TYPES.map(r => (
                  <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      );
  }
}
