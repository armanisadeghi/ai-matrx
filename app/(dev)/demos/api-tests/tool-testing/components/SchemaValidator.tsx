'use client';

import { useMemo, useState } from 'react';
import Ajv from 'ajv';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  XCircle,
  Info,
  Copy,
  Check,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SchemaValidationResult } from '@/features/tool-call-visualization/testing/types';

const ajv = new Ajv({ allErrors: true, strict: false });

export function validateAgainstSchema(
  output: unknown,
  schema: Record<string, unknown>,
): SchemaValidationResult {
  let parsed = output;
  if (typeof output === 'string') {
    try {
      parsed = JSON.parse(output);
    } catch {
      // Not JSON — validate as-is
    }
  }

  const validate = ajv.compile(schema);
  const valid = validate(parsed);

  return {
    valid: !!valid,
    errors: valid
      ? []
      : (validate.errors ?? []).map(
          (e) => `${e.instancePath || '/'}: ${e.message}`,
        ),
  };
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function InlineCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success('Copied');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };
  return (
    <Button size="sm" variant="ghost" className="h-6 w-6 p-0 flex-shrink-0" onClick={handleCopy}>
      {copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </Button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

interface SchemaValidatorProps {
  output: unknown;
  schema: Record<string, unknown> | null;
  success: boolean;
  /** Show only the schema definition (Schema tab) */
  schemaOnly?: boolean;
  /** Show only the raw output (Output tab) */
  outputOnly?: boolean;
}

export function SchemaValidator({ output, schema, success, schemaOnly, outputOnly }: SchemaValidatorProps) {
  const validation = useMemo(() => {
    if (!schema || !success || output === null || output === undefined) return null;
    return validateAgainstSchema(output, schema);
  }, [output, schema, success]);

  // ── Output tab ──────────────────────────────────────────────────────────────
  if (outputOnly) {
    if (output === null || output === undefined) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
          <Info className="h-6 w-6 opacity-40" />
          <p className="text-xs">No output yet. Execute a tool to see results.</p>
        </div>
      );
    }
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output, null, 2);
    return (
      <div className="h-full flex flex-col overflow-hidden">
        <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Raw Output</span>
          <InlineCopyButton text={outputStr} />
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-3">
          <pre className="text-[10px] font-mono whitespace-pre-wrap text-foreground/80">
            {outputStr}
          </pre>
        </div>
      </div>
    );
  }

  // ── Schema tab ──────────────────────────────────────────────────────────────
  if (!schema) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
        <Info className="h-6 w-6 opacity-40" />
        <p className="text-xs">No output schema registered for this tool</p>
        <p className="text-[10px]">Schema validation is not available</p>
      </div>
    );
  }

  const schemaStr = JSON.stringify(schema, null, 2);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Validation result — only shown after execution */}
      {validation && (
        <div className="flex-shrink-0 px-3 pt-3 pb-2">
          <div
            className={`flex items-center gap-2.5 p-2.5 rounded-lg border ${
              validation.valid
                ? 'bg-success/5 border-success/20'
                : 'bg-destructive/5 border-destructive/20'
            }`}
          >
            {validation.valid ? (
              <CheckCircle className="h-4 w-4 text-success flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
            )}
            <p className={`text-xs font-medium ${validation.valid ? 'text-success' : 'text-destructive'}`}>
              {validation.valid ? 'Output matches registered schema' : 'Output does NOT match registered schema'}
            </p>
          </div>

          {/* Validation errors */}
          {!validation.valid && validation.errors.length > 0 && (
            <div className="mt-2 rounded-lg border border-destructive/20 bg-destructive/5 p-2 space-y-1">
              {validation.errors.map((err, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs">
                  <XCircle className="h-3 w-3 text-destructive flex-shrink-0 mt-0.5" />
                  <span className="font-mono text-destructive">{err}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Execution failed — show warning but still display schema */}
      {!success && output !== null && output !== undefined && (
        <div className="flex-shrink-0 px-3 pt-3 pb-2">
          <div className="flex items-center gap-2 p-2.5 rounded-lg border bg-warning/5 border-warning/20">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
            <p className="text-xs text-warning">Tool execution failed — validation skipped</p>
          </div>
        </div>
      )}

      {/* Schema header */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 border-b">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Output Schema
          <span className="ml-1.5 font-mono font-normal normal-case text-muted-foreground/60">JSON Schema</span>
        </span>
        <InlineCopyButton text={schemaStr} />
      </div>

      {/* Schema body — scrollable, no height cap */}
      <div className="flex-1 overflow-y-auto min-h-0 p-3">
        <pre className="text-[10px] font-mono whitespace-pre-wrap text-foreground/80">
          {schemaStr}
        </pre>
      </div>
    </div>
  );
}
