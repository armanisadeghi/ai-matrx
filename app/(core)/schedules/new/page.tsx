// app/(authenticated)/schedules/new/page.tsx

"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScheduleForm } from "@/features/scheduling/components/form/ScheduleForm";

export default function NewSchedulePage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden bg-textured">
      <header className="shrink-0 border-b border-border bg-card/40 px-4 sm:px-6 py-3 flex items-center gap-3">
        <Button asChild variant="ghost" size="sm" className="gap-1.5">
          <Link href="/schedules">
            <ArrowLeft className="h-4 w-4" />
            Schedules
          </Link>
        </Button>
        <div>
          <h1 className="font-semibold text-base leading-none">
            New schedule
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define an agent task and when it should fire.
          </p>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-3xl mx-auto">
          <ScheduleForm />
        </div>
      </div>
    </div>
  );
}
