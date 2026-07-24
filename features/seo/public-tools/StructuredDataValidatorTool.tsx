"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { postNdjson } from "@/lib/python-client";
import { getFingerprint } from "@/lib/services/fingerprint-service";

interface StructuredDataIssue {
  severity: "error" | "warning" | string;
  code: string;
  message: string;
}

interface StructuredDataBlockReport {
  source: string;
  types: string[];
  primary_type: string | null;
  known_type: boolean;
  rich_result_eligible: boolean;
  issues: StructuredDataIssue[];
  data: Record<string, unknown>;
}

interface StructuredDataValidateResult {
  url: string;
  fetched_url: string;
  block_count: number;
  types_found: string[];
  rich_result_eligible_types: string[];
  blocks: StructuredDataBlockReport[];
  error_count: number;
  warning_count: number;
}

const STAGE_LABELS: Record<string, string> = {
  "seo.budget_check_passed": "Checked usage limits",
  "seo.fetch_started": "Fetching page",
  "seo.fetch_completed": "Page fetched",
  "seo.extraction_completed": "Parsing JSON-LD & microdata",
  "seo.validation_completed": "Validated against schema.org",
};

export function StructuredDataValidatorTool() {
  const [url, setUrl] = useState("");
  const [running, setRunning] = useState(false);
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StructuredDataValidateResult | null>(null);

  const run = useCallback(async () => {
    const target = url.trim();
    if (!target || running) return;
    setRunning(true);
    setError(null);
    setResult(null);
    setStage("Connecting");
    try {
      const fingerprint = await getFingerprint();
      for await (const evt of postNdjson(
        "/seo/public/structured-data/validate",
        { url: target },
        { guestFingerprint: fingerprint },
      )) {
        if (evt.event === "error") {
          setError(evt.data.user_message ?? evt.data.message);
          continue;
        }
        if (evt.event !== "data") continue;
        const data = evt.data as unknown as Record<string, unknown>;
        const kind = typeof data.kind === "string" ? data.kind : null;
        if (!kind) continue;
        if (kind === "seo.structured_data_result") {
          const final = data.result as StructuredDataValidateResult | undefined;
          if (final) setResult(final);
          continue;
        }
        setStage(STAGE_LABELS[kind] ?? kind);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
      setStage(null);
    }
  }, [url, running]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="rounded-2xl border-border">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/product/widget"
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="flex-1"
              disabled={running}
            />
            <Button onClick={run} disabled={running || !url.trim()} className="sm:w-40">
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Validating
                </>
              ) : (
                <>
                  <Sparkles className="mr-2 h-4 w-4" /> Validate
                </>
              )}
            </Button>
          </div>
          {running && stage ? (
            <p className="text-xs text-muted-foreground">{stage}…</p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Badge variant={result.error_count > 0 ? "destructive" : "default"}>
              {result.error_count} error{result.error_count === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">
              {result.warning_count} warning{result.warning_count === 1 ? "" : "s"}
            </Badge>
            <Badge variant="outline">{result.block_count} structured-data block(s)</Badge>
            {result.rich_result_eligible_types.length > 0 ? (
              <span className="text-xs text-muted-foreground">
                Rich-result eligible: {result.rich_result_eligible_types.join(", ")}
              </span>
            ) : null}
          </div>

          {result.blocks.length === 0 ? (
            <Card className="rounded-2xl border-border bg-muted/30">
              <CardContent className="p-5 text-sm text-muted-foreground">
                No JSON-LD or microdata structured data was found on this page.
              </CardContent>
            </Card>
          ) : (
            result.blocks.map((block, i) => (
              <Card key={i} className="rounded-2xl border-border">
                <CardContent className="space-y-2 p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-foreground">
                      {block.primary_type ?? "Unknown type"}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {block.source}
                    </Badge>
                    {block.rich_result_eligible ? (
                      <Badge className="text-[10px]">Rich-result eligible</Badge>
                    ) : null}
                    {!block.known_type ? (
                      <Badge variant="outline" className="text-[10px]">
                        Not yet validated
                      </Badge>
                    ) : null}
                  </div>
                  {block.issues.length === 0 ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" /> No issues found.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {block.issues.map((issue, j) => (
                        <li
                          key={j}
                          className={cn(
                            "flex items-start gap-1.5 text-xs",
                            issue.severity === "error"
                              ? "text-destructive"
                              : "text-muted-foreground",
                          )}
                        >
                          {issue.severity === "error" ? (
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <Circle className="mt-0.5 h-2 w-2 shrink-0 fill-current" />
                          )}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
