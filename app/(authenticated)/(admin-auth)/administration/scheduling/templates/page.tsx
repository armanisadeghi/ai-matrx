// app/(authenticated)/(admin-auth)/administration/scheduling/templates/page.tsx

"use client";

import { CalendarRange } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";

const SEEDS = [
  {
    title: "Daily morning briefing",
    description: "Summarize unread mail + calendar at 8 AM weekdays.",
    trigger: "cron 0 8 * * 1-5",
  },
  {
    title: "Hourly inbox triage",
    description: "Heartbeat agent monitoring a label/folder for new mail.",
    trigger: "heartbeat 3600s",
  },
  {
    title: "GitHub PR helper",
    description:
      "Fires when the user opens a GitHub pull request page (Chrome ext only).",
    trigger: "context-match github.com /pull/",
  },
];

export default function TemplatesPage() {
  return (
    <div className="h-full overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarRange className="h-5 w-5 text-blue-500" />
        <div>
          <h1 className="text-lg font-semibold leading-none">Templates</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Admin-curated starter schedules. Users will be able to clone any
            template into their own account from the create form.
          </p>
        </div>
      </div>

      <Alert>
        <AlertTitle>Coming next</AlertTitle>
        <AlertDescription>
          Backed by a new <code>sch_template</code> table owned by a system
          user and exposed via a curated read RPC. Until that lands, the seeds
          below show the shape we&apos;re going for.
        </AlertDescription>
      </Alert>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {SEEDS.map((s) => (
          <Card key={s.title}>
            <CardContent className="p-4 space-y-2">
              <div className="font-medium">{s.title}</div>
              <p className="text-xs text-muted-foreground leading-snug">
                {s.description}
              </p>
              <div className="text-[11px] font-mono text-muted-foreground">
                {s.trigger}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
