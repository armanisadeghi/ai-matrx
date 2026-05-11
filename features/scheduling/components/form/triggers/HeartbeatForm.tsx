// features/scheduling/components/form/triggers/HeartbeatForm.tsx

"use client";

import { IntervalForm } from "./IntervalForm";

interface Props {
  value: { every_seconds?: number };
  onChange: (v: { every_seconds: number }) => void;
  error?: string;
}

export function HeartbeatForm({ value, onChange, error }: Props) {
  return (
    <IntervalForm value={value} onChange={onChange} error={error} heartbeat />
  );
}
