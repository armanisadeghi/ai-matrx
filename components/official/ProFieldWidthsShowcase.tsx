"use client";

// The ProInput / ProTextarea control cluster at real widths: the compact mic
// capsule, and ProInput stepping its cluster down as the field narrows.

import { useState, type ReactNode } from "react";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";

const INPUT_WIDTHS = [520, 320, 220, 160, 110];
const TEXTAREA_WIDTHS = [560, 320, 220];

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-24 shrink-0 pt-2 font-mono type-secondary text-muted-foreground">
        {label}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border border-border bg-card p-4">
      <h2 className="type-title text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export function ProFieldWidthsShowcase() {
  const [values, setValues] = useState<Record<string, string>>({});
  const bind = (key: string) => ({
    value: values[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setValues((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <div className="space-y-4">
      <Section title="ProInput — plain">
        {INPUT_WIDTHS.map((w) => (
          <Row key={w} label={`${w}px`}>
            <div style={{ width: w, maxWidth: "100%" }}>
              <ProInput {...bind(`in-${w}`)} placeholder="Type a title…" />
            </div>
          </Row>
        ))}
      </Section>

      <Section title="ProInput — submit + clear">
        {INPUT_WIDTHS.map((w) => (
          <Row key={w} label={`${w}px`}>
            <div style={{ width: w, maxWidth: "100%" }}>
              <ProInput
                {...bind(`sub-${w}`)}
                placeholder="Ask something…"
                clearable
                onSubmit={() => setValues((p) => ({ ...p, [`sub-${w}`]: "" }))}
              />
            </div>
          </Row>
        ))}
      </Section>

      <Section title="ProTextarea">
        {TEXTAREA_WIDTHS.map((w) => (
          <Row key={w} label={`${w}px`}>
            <div style={{ width: w, maxWidth: "100%" }}>
              <ProTextarea
                {...bind(`ta-${w}`)}
                placeholder="Type your transcript…"
              />
            </div>
          </Row>
        ))}
      </Section>

      <Section title="ProTextarea — submit">
        {TEXTAREA_WIDTHS.map((w) => (
          <Row key={w} label={`${w}px`}>
            <div style={{ width: w, maxWidth: "100%" }}>
              <ProTextarea
                {...bind(`tas-${w}`)}
                placeholder="Message…"
                onSubmit={() => setValues((p) => ({ ...p, [`tas-${w}`]: "" }))}
              />
            </div>
          </Row>
        ))}
      </Section>
    </div>
  );
}
