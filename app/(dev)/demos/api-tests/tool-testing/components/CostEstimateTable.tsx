'use client';

import { Badge } from '@/components/ui/badge';
import { DollarSign, Hash, FileText, Info } from 'lucide-react';
import type { CostEstimate } from '@/features/tool-call-visualization/testing/types';

interface CostEstimateTableProps {
  costEstimate: CostEstimate | null;
}

export function CostEstimateTable({ costEstimate }: CostEstimateTableProps) {
  if (!costEstimate) {
    return (
      <div className="flex flex-col items-center justify-center py-8 gap-2 text-muted-foreground">
        <Info className="h-6 w-6 opacity-40" />
        <p className="text-xs">No cost estimate available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FileText className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Characters</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">
            {costEstimate.char_count.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Hash className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Est. Tokens</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">
            ~{costEstimate.estimated_tokens.toLocaleString()}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="text-[10px] font-medium uppercase tracking-wider">Chars/Token</span>
          </div>
          <p className="text-lg font-semibold tabular-nums">
            {costEstimate.chars_per_token.toFixed(1)}
          </p>
        </div>
      </div>

      {/* Model cost comparison table */}
      {costEstimate.models.length > 0 && (
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left px-3 py-2 font-semibold">Model</th>
                <th className="text-left px-3 py-2 font-semibold">API</th>
                <th className="text-right px-3 py-2 font-semibold">$/M Input</th>
                <th className="text-right px-3 py-2 font-semibold">Est. Cost</th>
              </tr>
            </thead>
            <tbody>
              {costEstimate.models.map((model, idx) => (
                <tr
                  key={idx}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-3 py-2 font-medium">{model.model}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 font-mono">
                      {model.api}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {model.input_price_per_million !== null
                      ? `$${model.input_price_per_million.toFixed(2)}`
                      : '—'}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {model.estimated_cost_usd !== null
                      ? formatCost(model.estimated_cost_usd)
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground text-center">
        Cost estimates are based on input token pricing only. Actual costs may vary.
      </p>
    </div>
  );
}

function formatCost(usd: number): string {
  if (usd < 0.001) return `$${usd.toFixed(6)}`;
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
