import React from 'react';
import { Copy } from 'lucide-react';

interface DataDisplayProps {
  data: unknown;
  level?: number;
  label?: string;
}

interface ConfigItemProps {
  label: string;
  value: unknown;
  level?: number;
}

const copyToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    // You might want to add a toast notification here
    console.log('Copied to clipboard');
  } catch (err) {
    console.error('Failed to copy:', err);
  }
};

const ConfigItem: React.FC<ConfigItemProps> = ({ label, value, level = 0 }) => {
  const padding = `pl-${level * 4}`;
  
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    copyToClipboard(typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value));
  };

  if (Array.isArray(value)) {
    return (
      <div className={`mb-2 ${padding}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}:</span>
          <button 
            onClick={handleCopy}
            className="p-1 hover:bg-accent/50 rounded"
            title="Copy to clipboard"
          >
            <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
        <div className="ml-4">
          {value.map((item: unknown, index: number) => (
            <div key={index} className="text-sm">
              {typeof item === 'object' ? (
                <DataDisplay data={item} level={(level || 0) + 1} />
              ) : (
                <div className="flex items-center justify-between">
                  <code className="text-xs bg-muted rounded px-1 py-0.5">{String(item)}</code>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      copyToClipboard(String(item));
                    }}
                    className="p-1 hover:bg-accent/50 rounded"
                    title="Copy to clipboard"
                  >
                    <Copy className="w-3 h-3 text-muted-foreground" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (typeof value === 'object' && value !== null) {
    return (
      <div className={`mb-2 ${padding}`}>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{label}:</span>
          <button 
            onClick={handleCopy}
            className="p-1 hover:bg-accent/50 rounded"
            title="Copy to clipboard"
          >
            <Copy className="w-3 h-3 text-muted-foreground" />
          </button>
        </div>
        <div className="ml-4">
          <DataDisplay data={value} level={(level || 0) + 1} />
        </div>
      </div>
    );
  }

  return (
    <div className={`flex items-center justify-between mb-2 ${padding}`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">{label}:</span>
        <code className="text-xs bg-muted rounded px-1 py-0.5">{String(value)}</code>
      </div>
      <button 
        onClick={handleCopy}
        className="p-1 hover:bg-accent/50 rounded"
        title="Copy to clipboard"
      >
        <Copy className="w-3 h-3 text-muted-foreground" />
      </button>
    </div>
  );
};

const DataDisplay: React.FC<DataDisplayProps> = ({ data, level = 0, label }) => {
  if (typeof data !== 'object' || data === null) {
    return (
      <div className="flex items-center justify-between">
        <code className="text-xs bg-muted rounded px-1 py-0.5">{String(data)}</code>
        <button 
          onClick={() => copyToClipboard(String(data))}
          className="p-1 hover:bg-accent/50 rounded"
          title="Copy to clipboard"
        >
          <Copy className="w-3 h-3 text-muted-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {Object.entries(data).map(([key, value]) => (
        <ConfigItem 
          key={key} 
          label={key} 
          value={value} 
          level={level}
        />
      ))}
    </div>
  );
};

export default DataDisplay;