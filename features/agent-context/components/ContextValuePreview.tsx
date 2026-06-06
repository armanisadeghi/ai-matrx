'use client';

import type { ContextItemManifest, ContextItemValue, ContextValueType } from '../types';
import { Badge } from '@/components/ui/badge';

type ValuePreviewProps = {
  item: ContextItemManifest;
  value?: ContextItemValue | null;
  mode?: 'card' | 'detail';
};

export function ContextValuePreview({ item, value, mode = 'card' }: ValuePreviewProps) {
  if (!value && !item.char_count) {
    return <span className="text-xs text-muted-foreground italic">No value yet</span>;
  }

  if (mode === 'card') {
    return <CardPreview item={item} />;
  }

  return <DetailPreview value={value} valueType={item.value_type} />;
}

function CardPreview({ item }: { item: ContextItemManifest }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
        {item.char_count != null && item.char_count > 0 && (
          <span>~{item.char_count.toLocaleString()} chars</span>
        )}
        {item.data_point_count != null && item.data_point_count > 0 && (
          <>
            {item.char_count != null && item.char_count > 0 && <span className="text-border">|</span>}
            <span>{item.data_point_count} data points</span>
          </>
        )}
        {item.has_nested_objects && (
          <Badge variant="outline" className="h-4 text-[10px] px-1">nested</Badge>
        )}
      </div>
      {/* Show top-level JSON keys as chips for object type */}
      {item.value_type === 'object' && item.data_point_count != null && item.data_point_count > 0 && item.json_keys && (
        <div className="flex flex-wrap gap-1">
          {item.json_keys.slice(0, 4).map(k => (
            <Badge key={k} variant="outline" className="h-4 text-[9px] px-1 font-mono">{k}</Badge>
          ))}
          {item.json_keys.length > 4 && (
            <Badge variant="outline" className="h-4 text-[9px] px-1">+{item.json_keys.length - 4} more</Badge>
          )}
        </div>
      )}
    </div>
  );
}

function DetailPreview({ value, valueType }: { value?: ContextItemValue | null; valueType: ContextValueType }) {
  if (!value) return <span className="text-sm text-muted-foreground italic">No value stored</span>;

  switch (valueType) {
    case 'string':
      return (
        <div className="space-y-2">
          <p className="text-sm whitespace-pre-wrap">{value.value_text}</p>
          <p className="text-xs text-muted-foreground">
            {value.char_count?.toLocaleString()} characters
          </p>
        </div>
      );

    case 'number':
      return <p className="text-2xl font-mono font-semibold">{value.value_number}</p>;

    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <span className={`h-3 w-3 rounded-full ${value.value_boolean ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm font-medium">{value.value_boolean ? 'True' : 'False'}</span>
        </div>
      );

    case 'date':
      return <p className="text-lg font-mono font-semibold">{value.value_date}</p>;

    case 'object':
      return <ObjectPreview data={value.value_json as Record<string, unknown>} dataPointCount={value.data_point_count} />;

    case 'array':
      return <ArrayPreview data={value.value_json as unknown[]} dataPointCount={value.data_point_count} />;

    case 'document':
      return (
        <div className="space-y-2 rounded-lg border border-border p-3">
          {value.value_document_url && (
            <a href={value.value_document_url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline break-all">
              {value.value_document_url}
            </a>
          )}
          {value.value_document_size_bytes && (
            <p className="text-xs text-muted-foreground">{formatBytes(value.value_document_size_bytes)}</p>
          )}
          {value.value_text && (
            <p className="text-sm text-muted-foreground">{value.value_text}</p>
          )}
        </div>
      );

    case 'reference':
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline">{value.value_reference_type}</Badge>
          <code className="text-xs font-mono text-muted-foreground">{value.value_reference_id}</code>
        </div>
      );

    default:
      return null;
  }
}

function ObjectPreview({ data, dataPointCount }: { data: Record<string, unknown> | null; dataPointCount: number | null }) {
  if (!data) return <span className="text-sm text-muted-foreground italic">Empty object</span>;

  const entries = Object.entries(data);
  return (
    <div className="space-y-1">
      {dataPointCount != null && (
        <p className="text-xs text-muted-foreground mb-2">{dataPointCount} data points</p>
      )}
      <div className="border border-border rounded-lg overflow-hidden">
        {entries.map(([key, val], i) => (
          <div key={key} className={`flex gap-3 px-3 py-1.5 text-sm ${i % 2 === 0 ? 'bg-muted/30' : ''}`}>
            <span className="font-medium font-mono text-xs min-w-[120px] text-muted-foreground">{key}</span>
            <span className="text-sm truncate">
              {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ArrayPreview({ data, dataPointCount }: { data: unknown[] | null; dataPointCount: number | null }) {
  if (!data || data.length === 0) return <span className="text-sm text-muted-foreground italic">Empty array</span>;

  return (
    <div className="space-y-1">
      {dataPointCount != null && (
        <p className="text-xs text-muted-foreground mb-2">{dataPointCount} items</p>
      )}
      <ol className="list-decimal list-inside space-y-0.5">
        {data.map((item, i) => (
          <li key={i} className="text-sm">{typeof item === 'object' ? JSON.stringify(item) : String(item)}</li>
        ))}
      </ol>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
