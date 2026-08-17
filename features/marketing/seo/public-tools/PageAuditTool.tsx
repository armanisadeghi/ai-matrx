"use client";

import { useCallback, useState } from "react";
import { AlertTriangle, Info, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useSeoCommandRun } from "@/features/marketing/seo/durable-run/useSeoCommandRun";

interface PageAuditIssue {
  severity: "error" | "warning" | "info" | string;
  code: string;
  message: string;
}

interface PageAuditResult {
  url: string;
  fetched_url: string;
  status_code: number;
  score: number;
  issues: PageAuditIssue[];
  audit: Record<string, unknown>;
}

const STAGE_LABELS: Record<string, string> = {
  "seo.budget_check_passed": "Checked usage limits",
  "seo.fetch_started": "Fetching page",
  "seo.fetch_completed": "Page fetched",
  "seo.audit_completed": "Ran on-page audit",
  "seo.scoring_completed": "Scored the page",
};

function scoreColor(score: number): string {
  if (score >= 90) return "text-success";
  if (score >= 60) return "text-warning";
  return "text-destructive";
}

const SEVERITY_ICON: Record<string, typeof AlertTriangle> = {
  error: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
};

export function PageAuditTool() {
  const [url, setUrl] = useState("");
  // Durable: the audit's `seo.collection_run` row is opened server-side before
  // the fetch, and this rejoins it on load — a reload lands on the running
  // audit (or on its finished score), never on an empty form.
  const command = useSeoCommandRun<PageAuditResult>({
    key: "page-audit",
    path: "/seo/public/page-audit",
    finalKind: "seo.page_audit_result",
    stageLabels: STAGE_LABELS,
    parseResult: (raw) =>
      raw && typeof raw === "object" ? (raw as PageAuditResult) : null,
  });
  const { running, stage, error, result, rejoinedTarget, status } = command;

  const run = useCallback(() => {
    const target = url.trim();
    if (!target || running) return;
    void command.launch({ url: target }, target);
  }, [url, running, command]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card className="rounded-2xl border-border">
        <CardContent className="space-y-3 p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/blog/post"
              onKeyDown={(e) => e.key === "Enter" && run()}
              className="flex-1"
              disabled={running}
            />
            <Button onClick={run} disabled={running || !url.trim()} className="sm:w-40">
              {running ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Auditing
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Audit page
                </>
              )}
            </Button>
          </div>
          {running && stage ? (
            <p className="text-xs text-muted-foreground">
              {status === "rejoining" && rejoinedTarget
                ? `Still auditing ${rejoinedTarget} — ${stage}…`
                : `${stage}…`}
            </p>
          ) : null}
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      {result ? (
        <div className="space-y-4">
          <Card className="rounded-2xl border-border">
            <CardContent className="flex items-center gap-4 p-5">
              <div className={cn("text-4xl font-bold", scoreColor(result.score))}>
                {result.score}
              </div>
              <div className="text-sm text-muted-foreground">
                <div className="font-medium text-foreground">On-page SEO score</div>
                <div>
                  HTTP {result.status_code} · {result.issues.length} issue
                  {result.issues.length === 1 ? "" : "s"} found
                </div>
              </div>
            </CardContent>
          </Card>

          {result.issues.length === 0 ? (
            <Card className="rounded-2xl border-border bg-muted/30">
              <CardContent className="p-5 text-sm text-muted-foreground">
                No issues found — this page looks clean on every check this tool runs.
              </CardContent>
            </Card>
          ) : (
            <Card className="rounded-2xl border-border">
              <CardContent className="space-y-2 p-5">
                {result.issues.map((issue, i) => {
                  const Icon = SEVERITY_ICON[issue.severity] ?? Info;
                  return (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Icon
                        className={cn(
                          "mt-0.5 h-4 w-4 shrink-0",
                          issue.severity === "error"
                            ? "text-destructive"
                            : issue.severity === "warning"
                              ? "text-warning"
                              : "text-muted-foreground",
                        )}
                      />
                      <div>
                        <span className="text-foreground">{issue.message}</span>
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {issue.code}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
