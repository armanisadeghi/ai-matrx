"use client";

import { useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveUserName } from "@/lib/redux/selectors/userSelectors";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function DashboardGreeting() {
  const name = useAppSelector(selectActiveUserName);
  // Computed once in a useState initializer → server + first client render agree.
  const [greeting] = useState(() => greetingFor(new Date().getHours()));
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";

  return (
    <div className="flex flex-col gap-0.5">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        {greeting}
        {first ? `, ${first}` : ""}
      </h1>
    </div>
  );
}
