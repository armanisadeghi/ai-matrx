'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ContextValuePreview } from './ContextValuePreview';
import { useContextItem, useContextVersionHistory, useCreateContextValue } from '../hooks/useContextItems';
import type { ContextItemValue, ContextValueFormData } from '../types';
import type { ScopeState } from '../hooks/useContextScope';
import { AlertTriangle, RotateCcw, User, Component } from 'lucide-react';
import { toast } from 'sonner';

type Props = {
  itemId: string;
  scope: ScopeState;
};

function restoredValueJson(
  raw: ContextItemValue['value_json'],
): ContextValueFormData['value_json'] {
  if (raw == null) return null;
  if (typeof raw === 'object') {
    return raw as ContextValueFormData['value_json'];
  }
  return null;
}

export function ContextVersionHistory({ itemId, scope }: Props) {
  const { data: item } = useContextItem(itemId);
  const { data: versions, isLoading } = useContextVersionHistory(
    itemId,
    scope.scopeId,
  );
  const createValue = useCreateContextValue(scope.scopeType, scope.scopeId);
  const [selectedVersion, setSelectedVersion] = useState<ContextItemValue | null>(null);

  if (isLoading || !item) {
    return (
      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!versions || versions.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-muted-foreground">No version history yet</p>
        <p className="text-xs text-muted-foreground mt-1">Versions are created when values are saved</p>
      </div>
    );
  }

  const active = selectedVersion ?? versions[0];
  const isCurrent = active.is_current;

  const handleRestore = () => {
    createValue.mutate({
      itemId,
      valueData: {
        value_text: active.value_text,
        value_number: active.value_number,
        value_boolean: active.value_boolean,
        value_date: active.value_date,
        value_json: restoredValueJson(active.value_json),
        value_document_url: active.value_document_url,
        value_document_size_bytes: active.value_document_size_bytes,
        value_reference_id: active.value_reference_id,
        value_reference_type: active.value_reference_type,
        change_summary: `Restored from version ${active.version}`,
      },
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{item.display_name} — Version History</h2>
        <span className="text-xs text-muted-foreground">{versions.length} versions</span>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-4">
        {/* Timeline */}
        <div className="space-y-0.5">
          {versions.map((v, i) => {
            const isSelected = v.id === active.id;
            const prevVersion = versions[i + 1];
            const charDelta = prevVersion ? v.char_count - prevVersion.char_count : v.char_count;

            return (
              <button
                key={v.id}
                className={`w-full text-left rounded-lg px-3 py-2 transition-colors border ${isSelected ? 'bg-accent border-accent-foreground/10' : 'border-transparent hover:bg-muted'}`}
                onClick={() => setSelectedVersion(v)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    v{v.version}
                    {v.is_current && <span className="text-green-500 ml-1">— Current</span>}
                  </span>
                  {charDelta !== 0 && (
                    <span className={`text-[10px] ${charDelta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {charDelta > 0 ? '+' : ''}{charDelta} chars
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(v.created_at).toLocaleString()}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {v.authored_by ? (
                    <>
                      {v.source_type === 'ai_generated' || v.source_type === 'ai_enriched'
                        ? <Component className="h-2.5 w-2.5 text-purple-400" />
                        : <User className="h-2.5 w-2.5 text-muted-foreground" />}
                      <span className="text-[10px] text-muted-foreground">{v.authored_by}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-muted-foreground italic">Unknown author</span>
                  )}
                  <Badge variant="outline" className="h-3.5 text-[9px] px-1">{v.source_type}</Badge>
                </div>
                {v.change_summary && (
                  <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2 italic">{v.change_summary}</p>
                )}
              </button>
            );
          })}
        </div>

        {/* Version detail */}
        <Card>
          <CardHeader className="pb-2 pt-3 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Version {active.version}</CardTitle>
              {!isCurrent && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-1">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="text-[10px] font-medium">Historical version — not current</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs gap-1 h-7"
                    onClick={handleRestore}
                    disabled={createValue.isPending}
                  >
                    <RotateCcw className="h-3 w-3" /> Restore
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <ContextValuePreview item={item} value={active} mode="detail" />
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/50 text-[10px] text-muted-foreground">
              <span>{active.char_count?.toLocaleString() ?? 0} chars</span>
              {active.data_point_count != null && <span>{active.data_point_count} data points</span>}
              <span>Source: {active.source_type}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
