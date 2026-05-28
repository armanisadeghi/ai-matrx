'use client';

import React, { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AdvancedRunSettings } from '@/features/agents/components/run-controls/AdvancedRunSettings/AdvancedRunSettings';
import {
  DEFAULT_ADVANCED_RUN_SETTINGS,
  type AdvancedRunSettingsValue,
} from '@/features/agents/components/run-controls/AdvancedRunSettings/constants';
import { runAlgorithm } from '@/features/agents/components/run-controls/AdvancedRunSettings/algorithm';

export default function AdvancedRunSettingsDemoPage() {
  const [value, setValue] = useState<AdvancedRunSettingsValue>(
    DEFAULT_ADVANCED_RUN_SETTINGS,
  );

  const result = runAlgorithm(value);
  const baseTotal = result.contributions.reduce((s, c) => s + c.points, 0);
  const penaltyTotal = result.constraints.reduce((s, c) => s + c.points, 0);

  return (
    <div className="h-full overflow-y-auto bg-textured">
      <div className="max-w-[1500px] mx-auto px-6 py-8 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6">
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="px-6 py-3 border-b border-border bg-muted/30">
            <h1 className="text-sm font-semibold text-foreground">
              Advanced agent settings
            </h1>
          </div>
          <div className="px-6 py-6">
            <AdvancedRunSettings onChange={setValue} />
          </div>
        </div>

        <aside className="rounded-xl border border-border bg-card overflow-hidden self-start xl:sticky xl:top-6 max-h-[calc(100vh-4rem)] overflow-y-auto">
          <div className="px-4 py-2 border-b border-border bg-muted/30">
            <h2 className="text-xs font-semibold text-foreground">
              Algorithm trace
            </h2>
          </div>

          <div className="px-4 py-3 space-y-4 text-[11px]">
            <div className="space-y-1">
              <Row label="Base points" value={baseTotal} />
              <Row
                label="Constraint penalties"
                value={penaltyTotal}
                emphasised={penaltyTotal > 0}
              />
              <div className="border-t border-border pt-1">
                <Row label="Total" value={result.total} bold />
              </div>
              <Row label="Band" value={result.band} />
            </div>

            <Block title="Contributions">
              {result.contributions.length === 0 ? (
                <Empty />
              ) : (
                <ul className="space-y-0.5 font-mono">
                  {result.contributions.map((c) => (
                    <li
                      key={c.source}
                      className="flex justify-between gap-2"
                    >
                      <span className="text-muted-foreground truncate">
                        {c.label}
                      </span>
                      <span className="text-foreground tabular-nums shrink-0">
                        +{c.points}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block title="Constraints fired">
              {result.constraints.length === 0 ? (
                <Empty />
              ) : (
                <ul className="space-y-2">
                  {result.constraints.map((c) => (
                    <li
                      key={c.rule}
                      className="rounded-md border border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-500/10 p-2"
                    >
                      <div className="flex items-start gap-1.5">
                        <AlertTriangle className="h-3 w-3 mt-0.5 text-amber-600 dark:text-amber-400 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex justify-between gap-2 items-baseline">
                            <span className="font-mono text-[10px] text-foreground truncate">
                              {c.rule}
                            </span>
                            <span className="font-mono text-foreground tabular-nums shrink-0">
                              +{c.points}
                            </span>
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug">
                            {c.reason}
                          </p>
                          {c.disables && c.disables.length > 0 && (
                            <p className="text-[10px] text-amber-700 dark:text-amber-300 mt-1 font-medium">
                              Disables: {c.disables.flatMap((d) => d.values).join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Block>

            <Block title="Raw value">
              <pre className="text-[10px] leading-relaxed font-mono overflow-x-auto">
                {JSON.stringify(value, null, 2)}
              </pre>
            </Block>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  emphasised,
}: {
  label: string;
  value: string | number;
  bold?: boolean;
  emphasised?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-muted-foreground uppercase tracking-wide">
        {label}
      </span>
      <span
        className={
          bold
            ? 'font-semibold text-foreground tabular-nums'
            : emphasised
              ? 'text-amber-600 dark:text-amber-400 tabular-nums font-medium'
              : 'text-foreground tabular-nums'
        }
      >
        {value}
      </span>
    </div>
  );
}

function Block({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 font-semibold">
        {title}
      </div>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="text-[10px] text-muted-foreground italic">none</p>;
}
