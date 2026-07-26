"use client";

import { useState, useCallback } from "react";
import { JsonTruncator } from "@/components/official-candidate/json-truncator/JsonTruncator";

// ─── Sample-data loader (page-level concern, not part of the component) ───────

async function fetchSample(name: "message" | "large"): Promise<string> {
  const path =
    name === "message"
      ? "/free/data-truncator/sample-data/message-data.json"
      : "/free/data-truncator/sample-data/large-tool-sample.json";
  const res = await fetch(path);
  return res.text();
}

export default function DataTruncatorPage() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(false);

  const loadSample = useCallback(async (name: "message" | "large") => {
    setLoading(true);
    try {
      const text = await fetchSample(name);
      setValue(text);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      {/* Sample loader bar — page-specific, not part of the reusable component */}
      <div className="flex items-center gap-2 px-3 py-1 bg-card border-b border-border flex-shrink-0">
        <span className="text-[10px] text-muted-foreground">Samples:</span>
        <button
          onClick={() => loadSample("message")}
          disabled={loading}
          className="text-[10px] px-2 py-0.5 bg-muted hover:bg-accent rounded border border-border text-foreground disabled:opacity-40"
        >
          message-data.json
        </button>
        <button
          onClick={() => loadSample("large")}
          disabled={loading}
          className="text-[10px] px-2 py-0.5 bg-muted hover:bg-accent rounded border border-border text-foreground disabled:opacity-40"
        >
          large-tool-sample.json
        </button>
        {loading && (
          <span className="text-[10px] text-muted-foreground animate-pulse">
            Loading…
          </span>
        )}
      </div>

      {/* The component itself — takes the remaining height */}
      <div className="flex-1 min-h-0">
        <JsonTruncator initialValue={value} tabbed={false} className="h-full" />
      </div>
    </div>
  );
}
