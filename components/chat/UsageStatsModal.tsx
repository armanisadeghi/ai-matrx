'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { 
  Clock, 
  Zap, 
  DollarSign, 
  Hash, 
  Cpu, 
  CheckCircle2, 
  Wrench,
  TrendingUp,
  Activity
} from 'lucide-react';

interface UsageStatsData {
  status: string;
  iterations: number;
  total_usage: {
    by_model: Record<string, {
      input_tokens: number;
      output_tokens: number;
      cached_input_tokens: number;
      total_tokens: number;
      api: string;
      request_count: number;
      cost: number | null;
    }>;
    total: {
      input_tokens: number;
      output_tokens: number;
      cached_input_tokens: number;
      total_tokens: number;
      total_requests: number;
      unique_models: number;
      total_cost: number | null;
    };
  };
  timing_stats: {
    total_duration: number;
    api_duration: number;
    tool_duration: number;
    iterations: number;
    avg_iteration_duration: number;
  };
  tool_call_stats: {
    total_tool_calls: number;
    iterations_with_tools: number;
    by_tool: Record<string, {
      count: number;
      success: number;
      error: number;
    }>;
  };
  finish_reason: string;
}

interface UsageStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: UsageStatsData | null;
}

function formatDuration(seconds: number): string {
  if (seconds < 1) return `${Math.round(seconds * 1000)}ms`;
  return `${seconds.toFixed(2)}s`;
}

function formatCost(cost: number | null | undefined): string {
  if (cost == null) return 'N/A';
  if (cost === 0) return 'Free';
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  return `$${cost.toFixed(4)}`;
}

function StatCard({ 
  icon: Icon, 
  label, 
  value, 
  sublabel, 
  variant = 'default' 
}: { 
  icon: any; 
  label: string; 
  value: string | number; 
  sublabel?: string;
  variant?: 'default' | 'success' | 'warning' | 'info';
}) {
  const variantStyles = {
    default: 'border-border',
    success: 'border-green-500/20 bg-green-500/5',
    warning: 'border-yellow-500/20 bg-yellow-500/5',
    info: 'border-blue-500/20 bg-blue-500/5',
  };

  const iconStyles = {
    default: 'text-muted-foreground',
    success: 'text-green-600 dark:text-green-400',
    warning: 'text-yellow-600 dark:text-yellow-400',
    info: 'text-blue-600 dark:text-blue-400',
  };

  return (
    <Card className={`p-3 ${variantStyles[variant]}`}>
      <div className="flex items-start gap-2">
        <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${iconStyles[variant]}`} />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
          <div className="text-lg font-semibold">{value}</div>
          {sublabel && <div className="text-xs text-muted-foreground mt-0.5">{sublabel}</div>}
        </div>
      </div>
    </Card>
  );
}

export function UsageStatsModal({ isOpen, onClose, data }: UsageStatsModalProps) {
  if (!data) return null;

  const { total_usage, timing_stats, tool_call_stats, finish_reason, status, iterations } = data;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between mr-4">
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Usage Statistics
            </DialogTitle>
            <Badge variant={status === 'complete' ? 'default' : 'secondary'}>
              {status}
            </Badge>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard
              icon={CheckCircle2}
              label="Status"
              value={status.charAt(0).toUpperCase() + status.slice(1)}
              variant="success"
            />
            <StatCard
              icon={TrendingUp}
              label="Iterations"
              value={iterations}
              variant="info"
            />
            <StatCard
              icon={DollarSign}
              label="Total Cost"
              value={formatCost(total_usage.total.total_cost)}
              variant="warning"
            />
            <StatCard
              icon={Clock}
              label="Total Duration"
              value={formatDuration(timing_stats.total_duration)}
            />
          </div>

          <Separator />

          {/* Token Usage */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Token Usage
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={Hash}
                label="Input Tokens"
                value={total_usage.total.input_tokens.toLocaleString()}
              />
              <StatCard
                icon={Hash}
                label="Output Tokens"
                value={total_usage.total.output_tokens.toLocaleString()}
              />
              {total_usage.total.cached_input_tokens > 0 && (
                <StatCard
                  icon={Zap}
                  label="Cached Tokens"
                  value={total_usage.total.cached_input_tokens.toLocaleString()}
                  variant="success"
                />
              )}
              <StatCard
                icon={Hash}
                label="Total Tokens"
                value={total_usage.total.total_tokens.toLocaleString()}
              />
            </div>
          </div>

          {/* Model Breakdown */}
          {Object.keys(total_usage.by_model).length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  Model Breakdown
                </h3>
                <div className="space-y-3">
                  {Object.entries(total_usage.by_model).map(([modelName, modelStats]) => (
                    <Card key={modelName} className="p-3 bg-muted/50">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-medium text-sm">{modelName}</div>
                        <Badge variant="outline" className="text-xs">
                          {modelStats.api}
                        </Badge>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                        <div>
                          <div className="text-muted-foreground">Input</div>
                          <div className="font-mono">{modelStats.input_tokens.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Output</div>
                          <div className="font-mono">{modelStats.output_tokens.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Total</div>
                          <div className="font-mono">{modelStats.total_tokens.toLocaleString()}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Requests</div>
                          <div className="font-mono">{modelStats.request_count}</div>
                        </div>
                        <div>
                          <div className="text-muted-foreground">Cost</div>
                          <div className="font-mono">{formatCost(modelStats.cost)}</div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Timing Stats */}
          <Separator />
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Timing Breakdown
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatCard
                icon={Clock}
                label="API Duration"
                value={formatDuration(timing_stats.api_duration)}
                sublabel={`${((timing_stats.api_duration / timing_stats.total_duration) * 100).toFixed(1)}% of total`}
              />
              <StatCard
                icon={Wrench}
                label="Tool Duration"
                value={formatDuration(timing_stats.tool_duration)}
                sublabel={`${((timing_stats.tool_duration / timing_stats.total_duration) * 100).toFixed(1)}% of total`}
              />
              <StatCard
                icon={TrendingUp}
                label="Avg Iteration"
                value={formatDuration(timing_stats.avg_iteration_duration)}
              />
              <StatCard
                icon={Hash}
                label="Iterations"
                value={timing_stats.iterations}
              />
            </div>
          </div>

          {/* Tool Call Stats */}
          {tool_call_stats.total_tool_calls > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Wrench className="h-4 w-4" />
                  Tool Usage
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                  <StatCard
                    icon={Wrench}
                    label="Total Calls"
                    value={tool_call_stats.total_tool_calls}
                  />
                  <StatCard
                    icon={TrendingUp}
                    label="Iterations with Tools"
                    value={tool_call_stats.iterations_with_tools}
                  />
                  <StatCard
                    icon={CheckCircle2}
                    label="Success Rate"
                    value={`${((Object.values(tool_call_stats.by_tool).reduce((acc, t) => acc + t.success, 0) / tool_call_stats.total_tool_calls) * 100).toFixed(0)}%`}
                    variant="success"
                  />
                </div>
                <div className="space-y-2">
                  {Object.entries(tool_call_stats.by_tool).map(([toolName, toolStats]) => (
                    <Card key={toolName} className="p-2.5 bg-muted/50">
                      <div className="flex items-center justify-between">
                        <div className="font-medium text-sm">{toolName}</div>
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-1">
                            <span className="text-muted-foreground">Total:</span>
                            <span className="font-mono">{toolStats.count}</span>
                          </div>
                          <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                            <CheckCircle2 className="h-3 w-3" />
                            <span className="font-mono">{toolStats.success}</span>
                          </div>
                          {toolStats.error > 0 && (
                            <div className="flex items-center gap-1 text-destructive">
                              <span className="text-muted-foreground">Errors:</span>
                              <span className="font-mono">{toolStats.error}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Finish Reason */}
          <Separator />
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Finish Reason:</span>
            <Badge variant="outline">{finish_reason.replace('FinishReason.', '')}</Badge>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

