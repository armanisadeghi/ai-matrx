'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ColumnMapperProps {
  columns: string[];
  previewData: any[];
  onConfirm: (mapping: { zipColumn: string; countColumn: string }) => void;
  onCancel: () => void;
}

// Fuzzy match function to find likely column names
function fuzzyMatchColumn(columns: string[], patterns: string[]): string | null {
  const normalizedColumns = columns.map(c => c.toLowerCase().trim());
  
  for (const pattern of patterns) {
    const patternLower = pattern.toLowerCase();
    
    // Exact match
    const exactIndex = normalizedColumns.indexOf(patternLower);
    if (exactIndex !== -1) return columns[exactIndex];
    
    // Contains match
    const containsIndex = normalizedColumns.findIndex(c => c.includes(patternLower));
    if (containsIndex !== -1) return columns[containsIndex];
    
    // Reverse contains match (column name contains pattern)
    const reverseIndex = normalizedColumns.findIndex(c => patternLower.includes(c));
    if (reverseIndex !== -1) return columns[reverseIndex];
  }
  
  return null;
}

export default function ColumnMapper({ columns, previewData, onConfirm, onCancel }: ColumnMapperProps) {
  const [zipColumn, setZipColumn] = useState<string>('');
  const [countColumn, setCountColumn] = useState<string>('');

  // Auto-detect columns on mount
  useEffect(() => {
    const zipPatterns = ['zipcode', 'zip_code', 'zip', 'postal', 'postalcode', 'postal_code'];
    const countPatterns = ['count', 'value', 'total', 'amount', 'number', 'quantity', 'qty'];

    const detectedZip = fuzzyMatchColumn(columns, zipPatterns);
    const detectedCount = fuzzyMatchColumn(columns, countPatterns);

    if (detectedZip) setZipColumn(detectedZip);
    if (detectedCount) setCountColumn(detectedCount);
  }, [columns]);

  const canConfirm = zipColumn && countColumn;

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm({ zipColumn, countColumn });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div className="bg-background border rounded-lg shadow-lg max-w-2xl w-full max-h-[90dvh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold mb-2">Map Your Columns</h2>
          <p className="text-sm text-muted-foreground">
            Select which columns contain your zip codes and count values
          </p>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Column Selectors */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Zip Code Column</label>
              <Select value={zipColumn} onValueChange={setZipColumn}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column..." />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>
                      {col}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Count Column</label>
              <Select value={countColumn} onValueChange={setCountColumn}>
                <SelectTrigger>
                  <SelectValue placeholder="Select column..." />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((col) => (
                    <SelectItem key={col} value={col}>
                      {col}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview */}
          {zipColumn && countColumn && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Preview (First 5 Rows)</label>
              <div className="border rounded-md overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Zip Code</th>
                        <th className="px-3 py-2 text-left font-medium">Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {previewData.slice(0, 5).map((row, idx) => (
                        <tr key={idx} className="hover:bg-muted/50">
                          <td className="px-3 py-2">{row[zipColumn]}</td>
                          <td className="px-3 py-2">{row[countColumn]}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* All Available Columns */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Available Columns ({columns.length})</label>
            <div className="flex flex-wrap gap-2">
              {columns.map((col) => (
                <span
                  key={col}
                  className={`px-2 py-1 text-xs rounded-md border ${
                    col === zipColumn || col === countColumn
                      ? 'bg-primary/10 border-primary text-primary'
                      : 'bg-muted border-border'
                  }`}
                >
                  {col}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex justify-end gap-3">
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!canConfirm}>
            <Check className="w-4 h-4 mr-2" />
            Confirm Mapping
          </Button>
        </div>
      </div>
    </div>
  );
}

