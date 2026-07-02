import React from 'react';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ConfigJSONViewerProps {
  data: unknown;
  copied: boolean;
  onCopy: () => void;
  className?: string;
}

const cleanJsonData = (data: unknown): unknown => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return data;
    }
  }
  
  if (Array.isArray(data)) {
    return data.map(item => cleanJsonData(item));
  }
  
  if (typeof data === 'object' && data !== null) {
    return Object.fromEntries(
      Object.entries(data).map(([key, value]) => [key, cleanJsonData(value)])
    );
  }
  
  return data;
};

const ConfigJSONViewer = ({
  data,
  copied,
  onCopy,
  className = '',
}: ConfigJSONViewerProps) => {
  const cleanedData = cleanJsonData(data);

  return (
    <div className="flex-1">
      <div 
        className={cn(
          'relative border rounded-lg bg-card text-card-foreground shadow-sm p-2 resize overflow-auto min-h-[200px] min-w-[75px]',
          className
        )}
        style={{
          resize: 'both',
          overflow: 'auto'
        }}
      >
        <Button
          variant="ghost"
          size="sm"
          onClick={onCopy}
          className="absolute top-0 right-0 h-6 w-6 p-0"
          title="Copy to clipboard"
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </Button>
        <pre className="text-xs leading-tight whitespace-pre-wrap font-mono text-muted-foreground pr-6">
          {JSON.stringify(cleanedData, null, 2)}
        </pre>
      </div>
    </div>
  );
};

export default ConfigJSONViewer;