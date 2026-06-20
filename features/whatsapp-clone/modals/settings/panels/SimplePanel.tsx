import type { ReactNode } from "react";
import { Switch } from "@/components/ui/switch";

interface SimplePanelProps {
  intro?: string;
  children?: ReactNode;
}

export function SimplePanel({ intro, children }: SimplePanelProps) {
  return (
    <div className="flex flex-col gap-4 text-foreground">
      {intro ? (
        <p className="text-[14px] leading-relaxed text-muted-foreground">
          {intro}
        </p>
      ) : null}
      {children}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description?: string;
  defaultChecked?: boolean;
}

export function ToggleRow({
  label,
  description,
  defaultChecked,
}: ToggleRowProps) {
  return (
    <div className="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-muted px-4 py-3.5">
      <div className="min-w-0">
        <div className="text-[15px] text-foreground">{label}</div>
        {description ? (
          <div className="mt-0.5 text-[12.5px] text-muted-foreground">
            {description}
          </div>
        ) : null}
      </div>
      <Switch defaultChecked={defaultChecked} />
    </div>
  );
}

interface RowGroupProps {
  children: ReactNode;
}

export function RowGroup({ children }: RowGroupProps) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-lg bg-muted">
      {children}
    </div>
  );
}
