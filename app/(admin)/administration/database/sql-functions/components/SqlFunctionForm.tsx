'use client';

import React, { useState, useRef, useEffect } from 'react';
import { SqlFunction } from '@/types/sql-functions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Save, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import SmallCodeEditor from '@/features/code-editor/components/code-block/SmallCodeEditor';

interface SqlFunctionFormProps {
  functionData?: SqlFunction;
  onSubmit: (definition: string) => Promise<boolean>;
  onCancel: () => void;
}

export default function SqlFunctionForm({ functionData, onSubmit, onCancel }: SqlFunctionFormProps) {
  const isEdit = !!functionData;

  const [name, setName] = useState(functionData?.name || '');
  const [schema, setSchema] = useState(functionData?.schema || 'public');
  const [returnType, setReturnType] = useState(functionData?.returns || 'void');
  const [arguments_, setArguments] = useState(functionData?.arguments || '');
  const [definition, setDefinition] = useState(functionData?.definition || '');
  const [securityType, setSecurityType] = useState<'SECURITY DEFINER' | 'SECURITY INVOKER'>(
    functionData?.security_type || 'SECURITY INVOKER'
  );
  const [language, setLanguage] = useState(functionData?.language || 'plpgsql');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  // Measure the editor container height so Monaco gets an explicit pixel height
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState('400px');

  useEffect(() => {
    const measure = () => {
      if (editorContainerRef.current) {
        const h = editorContainerRef.current.getBoundingClientRect().height;
        if (h > 50) setEditorHeight(`${h}px`);
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (editorContainerRef.current) ro.observe(editorContainerRef.current);
    return () => ro.disconnect();
  }, []);

  const generateFunctionDefinition = () => {
    if (!name) { setError('Function name is required'); return null; }
    if (!returnType) { setError('Return type is required'); return null; }
    let sql = '';
    if (isEdit) sql += `DROP FUNCTION IF EXISTS ${schema}.${name}(${functionData?.arguments});\n\n`;
    sql += `CREATE OR REPLACE FUNCTION ${schema}.${name}(${arguments_})\n`;
    sql += `RETURNS ${returnType}\n`;
    sql += `LANGUAGE ${language}\n`;
    sql += `${securityType}\n`;
    sql += `AS $function$\n`;
    sql += `${definition}\n`;
    sql += `$function$;\n`;
    return sql;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    const sql = generateFunctionDefinition();
    if (!sql) { setLoading(false); return; }
    try {
      const success = await onSubmit(sql);
      if (success) {
        setShowSuccess(true);
        setTimeout(() => setShowSuccess(false), 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while saving the SQL function');
    } finally {
      setLoading(false);
    }
  };

  // Map our language identifiers to Monaco language IDs
  const monacoLanguage = language === 'plpgsql' || language === 'sql' ? 'sql'
    : language === 'plv8' ? 'javascript'
    : language === 'plpython3u' ? 'python'
    : 'sql';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col h-full overflow-hidden">

      {/* Fields row — compact, single bar */}
      <div className="shrink-0 px-4 py-2.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        {(error || showSuccess) && (
          <div className="mb-2">
            {error && (
              <Alert variant="destructive" className="py-2 text-sm">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle className="text-xs">Error</AlertTitle>
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}
            {showSuccess && (
              <Alert className="py-2 bg-green-100 dark:bg-green-900/20 border-green-200 dark:border-green-800">
                <AlertCircle className="h-4 w-4 text-green-600" />
                <AlertTitle className="text-xs text-green-800 dark:text-green-300">Success</AlertTitle>
                <AlertDescription className="text-xs text-green-700 dark:text-green-400">
                  {isEdit ? 'Function updated successfully' : 'Function created successfully'}
                </AlertDescription>
              </Alert>
            )}
          </div>
        )}

        {/* 6 fields in a 3-column grid — label inline on left, input on right */}
        <div className="grid grid-cols-3 gap-x-6 gap-y-1.5">
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 w-20 shrink-0 text-right whitespace-nowrap">
              Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my_function"
              required
              className="h-7 text-sm flex-1 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 w-20 shrink-0 text-right whitespace-nowrap">
              Schema
            </label>
            <Input
              value={schema}
              onChange={(e) => setSchema(e.target.value)}
              placeholder="public"
              className="h-7 text-sm flex-1 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 w-20 shrink-0 text-right whitespace-nowrap">
              Return <span className="text-red-500">*</span>
            </label>
            <Input
              value={returnType}
              onChange={(e) => setReturnType(e.target.value)}
              placeholder="void, integer, text…"
              required
              className="h-7 text-sm flex-1 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 w-20 shrink-0 text-right whitespace-nowrap">
              Arguments
            </label>
            <Input
              value={arguments_}
              onChange={(e) => setArguments(e.target.value)}
              placeholder="arg1 type1, arg2 type2…"
              className="h-7 text-sm flex-1 border-slate-300 dark:border-slate-700"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 w-20 shrink-0 text-right whitespace-nowrap">
              Language
            </label>
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="h-7 text-sm flex-1 border-slate-300 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="plpgsql">PL/pgSQL</SelectItem>
                <SelectItem value="sql">SQL</SelectItem>
                <SelectItem value="plv8">PLV8 (JavaScript)</SelectItem>
                <SelectItem value="plpython3u">PL/Python</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400 w-20 shrink-0 text-right whitespace-nowrap">
              Security
            </label>
            <Select value={securityType} onValueChange={(v) => setSecurityType(v as 'SECURITY DEFINER' | 'SECURITY INVOKER')}>
              <SelectTrigger className="h-7 text-sm flex-1 border-slate-300 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SECURITY INVOKER">Invoker</SelectItem>
                <SelectItem value="SECURITY DEFINER">Definer</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Monaco editor label + action bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-800 dark:bg-slate-950 border-b border-slate-700 shrink-0">
        <span className="text-xs text-slate-400 font-medium">
          Function Definition <span className="text-red-400">*</span>
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={loading}
            className="h-6 text-xs text-slate-400 hover:text-slate-200 hover:bg-slate-700 px-2"
          >
            <X className="h-3 w-3 mr-1" />Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading}
            size="sm"
            className="h-6 text-xs bg-slate-600 hover:bg-slate-500 text-white px-3"
          >
            <Save className="h-3 w-3 mr-1" />
            {isEdit ? 'Update Function' : 'Create Function'}
          </Button>
        </div>
      </div>

      {/* Monaco editor — fills all remaining space */}
      <div ref={editorContainerRef} className="flex-1 min-h-0 overflow-hidden">
        <SmallCodeEditor
          language={monacoLanguage}
          initialCode={definition}
          path={`sql-function-${functionData?.name || 'new'}`}
          onChange={(val) => setDefinition(val ?? '')}
          mode="dark"
          height={editorHeight}
          showFormatButton
          showCopyButton
          showResetButton={false}
          showWordWrapToggle
          showMinimapToggle={false}
          defaultWordWrap="on"
        />
      </div>
    </form>
  );
}
