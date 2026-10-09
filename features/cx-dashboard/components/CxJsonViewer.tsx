"use client";

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronRight, Copy, Check } from "lucide-react";

type Props = {
  data: unknown;
  label?: string;
  defaultCollapsed?: boolean;
  maxHeight?: string;
};

export function CxJsonViewer({ data, label, defaultCollapsed = true, maxHeight = "300px" }: Props) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const [copied, setCopied] = useState(false);

  const jsonStr = JSON.stringify(data, null, 2);

  const handleCopy = async () => {
    if (!(await copyText(jsonStr))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div
        className="flex items-center gap-2 px-3 py-1.5 bg-muted/50 cursor-pointer select-none"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
        )}
        <span className="text-xs font-medium text-muted-foreground">{label || "JSON Data"}</span>
        <Button
          variant="quiet"
          className="ml-auto"
          onClick={(e) => {
            e.stopPropagation();
            handleCopy();
          }}
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
        </Button>
      </div>
      {!collapsed && (
        <pre
          className="text-xs p-3 overflow-auto bg-card font-mono"
          style={{ maxHeight }}
        >
          {jsonStr}
        </pre>
      )}
    </div>
  );
}
