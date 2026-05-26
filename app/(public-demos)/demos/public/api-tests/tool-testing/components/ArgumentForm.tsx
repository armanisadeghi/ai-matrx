'use client';

import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2 } from 'lucide-react';
import type { ParameterDefinition } from '@/features/tool-call-visualization/testing/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getDefaultValue(param: ParameterDefinition): unknown {
  if (param.default !== undefined) return param.default;
  switch (param.type) {
    case 'string':
      return '';
    case 'integer':
    case 'number':
      return param.minimum ?? '';
    case 'boolean':
      return false;
    case 'array':
      return [];
    case 'object': {
      if (!param.properties) return {};
      const obj: Record<string, unknown> = {};
      for (const [key, prop] of Object.entries(param.properties)) {
        obj[key] = getDefaultValue(prop);
      }
      return obj;
    }
    default:
      return '';
  }
}

export function buildDefaults(
  parameters: Record<string, ParameterDefinition>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const [name, param] of Object.entries(parameters)) {
    defaults[name] = getDefaultValue(param);
  }
  return defaults;
}

// ─── ParameterField (recursive) ─────────────────────────────────────────────

interface ParameterFieldProps {
  name: string;
  param: ParameterDefinition;
  value: unknown;
  onChange: (value: unknown) => void;
  depth?: number;
}

function ParameterField({
  name,
  param,
  value,
  onChange,
  depth = 0,
}: ParameterFieldProps) {
  // Enum select
  if (param.enum && param.enum.length > 0) {
    return (
      <div className="space-y-1">
        <FieldLabel name={name} param={param} />
        <Select
          value={String(value ?? '')}
          onValueChange={(v) => onChange(v)}
        >
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder={`Select ${name}...`} />
          </SelectTrigger>
          <SelectContent>
            {param.enum.map((opt) => (
              <SelectItem key={opt} value={opt} className="text-xs">
                {opt}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  switch (param.type) {
    case 'string': {
      const strVal = String(value ?? '');
      const isLong = strVal.length > 60 || param.description?.includes('content');
      return (
        <div className="space-y-1">
          <FieldLabel name={name} param={param} />
          {isLong ? (
            <Textarea
              value={strVal}
              onChange={(e) => onChange(e.target.value)}
              placeholder={param.description}
              className="min-h-[60px] text-xs font-mono"
            />
          ) : (
            <Input
              type="text"
              value={strVal}
              onChange={(e) => onChange(e.target.value)}
              placeholder={param.description}
              className="h-8 text-xs"
            />
          )}
        </div>
      );
    }

    case 'integer':
    case 'number': {
      return (
        <div className="space-y-1">
          <FieldLabel name={name} param={param} />
          <Input
            type="number"
            value={value === '' || value === undefined ? '' : String(value)}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                onChange('');
              } else {
                onChange(param.type === 'integer' ? parseInt(v, 10) : parseFloat(v));
              }
            }}
            min={param.minimum}
            max={param.maximum}
            step={param.type === 'integer' ? 1 : 'any'}
            placeholder={param.description}
            className="h-8 text-xs"
          />
          {(param.minimum !== undefined || param.maximum !== undefined) && (
            <p className="text-[10px] text-muted-foreground">
              {param.minimum !== undefined && `Min: ${param.minimum}`}
              {param.minimum !== undefined && param.maximum !== undefined && ' · '}
              {param.maximum !== undefined && `Max: ${param.maximum}`}
            </p>
          )}
        </div>
      );
    }

    case 'boolean': {
      return (
        <div className="flex items-center justify-between gap-2 py-1">
          <div className="space-y-0.5">
            <FieldLabel name={name} param={param} inline />
          </div>
          <Switch
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked)}
          />
        </div>
      );
    }

    case 'array': {
      const arrValue = Array.isArray(value) ? value : [];
      return (
        <div className="space-y-1.5">
          <FieldLabel name={name} param={param} />
          <div className={`space-y-1.5 ${depth > 0 ? 'pl-3 border-l border-border' : ''}`}>
            {arrValue.map((item, idx) => (
              <div key={idx} className="flex items-start gap-1.5">
                <div className="flex-1">
                  {param.items ? (
                    <ParameterField
                      name={`${idx}`}
                      param={param.items}
                      value={item}
                      onChange={(newVal) => {
                        const updated = [...arrValue];
                        updated[idx] = newVal;
                        onChange(updated);
                      }}
                      depth={depth + 1}
                    />
                  ) : (
                    <Input
                      type="text"
                      value={String(item ?? '')}
                      onChange={(e) => {
                        const updated = [...arrValue];
                        updated[idx] = e.target.value;
                        onChange(updated);
                      }}
                      className="h-8 text-xs"
                      placeholder={`Item ${idx + 1}`}
                    />
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 w-8 p-0 flex-shrink-0"
                  onClick={() => {
                    const updated = arrValue.filter((_, i) => i !== idx);
                    onChange(updated);
                  }}
                >
                  <Trash2 className="h-3 w-3 text-destructive" />
                </Button>
              </div>
            ))}
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs w-full"
              onClick={() => {
                const newItem = param.items ? getDefaultValue(param.items) : '';
                onChange([...arrValue, newItem]);
              }}
              disabled={
                param.maxItems !== undefined && arrValue.length >= param.maxItems
              }
            >
              <Plus className="h-3 w-3 mr-1" />
              Add item
            </Button>
          </div>
        </div>
      );
    }

    case 'object': {
      const objValue = (typeof value === 'object' && value !== null && !Array.isArray(value))
        ? (value as Record<string, unknown>)
        : {};
      if (!param.properties) {
        // Free-form object — render as JSON textarea
        return (
          <div className="space-y-1">
            <FieldLabel name={name} param={param} />
            <Textarea
              value={typeof value === 'string' ? value : JSON.stringify(value ?? {}, null, 2)}
              onChange={(e) => {
                try {
                  onChange(JSON.parse(e.target.value));
                } catch {
                  onChange(e.target.value);
                }
              }}
              placeholder="JSON object..."
              className="min-h-[80px] text-xs font-mono"
            />
          </div>
        );
      }
      return (
        <div className="space-y-2">
          <FieldLabel name={name} param={param} />
          <div className={`space-y-2 ${depth > 0 ? 'pl-3 border-l border-border' : ''}`}>
            {Object.entries(param.properties).map(([key, prop]) => (
              <ParameterField
                key={key}
                name={key}
                param={prop}
                value={objValue[key]}
                onChange={(newVal) => {
                  onChange({ ...objValue, [key]: newVal });
                }}
                depth={depth + 1}
              />
            ))}
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="space-y-1">
          <FieldLabel name={name} param={param} />
          <Input
            type="text"
            value={String(value ?? '')}
            onChange={(e) => onChange(e.target.value)}
            placeholder={param.description}
            className="h-8 text-xs"
          />
        </div>
      );
  }
}

// ─── Label helper ───────────────────────────────────────────────────────────

function FieldLabel({
  name,
  param,
  inline,
}: {
  name: string;
  param: ParameterDefinition;
  inline?: boolean;
}) {
  return (
    <div className={inline ? '' : 'space-y-0.5'}>
      <div className="flex items-center gap-1.5">
        <Label className="text-xs font-medium">{name}</Label>
        {param.required && (
          <span className="text-destructive text-xs">*</span>
        )}
        <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
          {param.type}
        </Badge>
      </div>
      {param.description && (
        <p className="text-[10px] text-muted-foreground leading-tight">
          {param.description}
        </p>
      )}
      {param.default !== undefined && (
        <p className="text-[10px] text-muted-foreground">
          Default: <span className="font-mono">{JSON.stringify(param.default)}</span>
        </p>
      )}
    </div>
  );
}

// ─── Main Form ──────────────────────────────────────────────────────────────

interface ArgumentFormProps {
  parameters: Record<string, ParameterDefinition>;
  values: Record<string, unknown>;
  onChange: (values: Record<string, unknown>) => void;
}

export function ArgumentForm({ parameters, values, onChange }: ArgumentFormProps) {
  const entries = Object.entries(parameters);

  if (entries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        This tool has no parameters.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([name, param]) => (
        <ParameterField
          key={name}
          name={name}
          param={param}
          value={values[name]}
          onChange={(newVal) => {
            onChange({ ...values, [name]: newVal });
          }}
        />
      ))}
    </div>
  );
}
