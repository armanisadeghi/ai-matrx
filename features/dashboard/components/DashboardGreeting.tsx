"use client";

import { useSyncExternalStore } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectActiveUserName } from "@/lib/redux/selectors/userSelectors";

function greetingFor(hour: number): string {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const subscribeToClock = () => () => {};
const getLocalGreeting = () => greetingFor(new Date().getHours());
const getServerGreeting = () => "Welcome back";

export function DashboardGreeting() {
  const name = useAppSelector(selectActiveUserName);
  // The server timezone and the user's browser timezone can differ. Keep the
  // server + hydration text deterministic, then personalize by local time once
  // the browser has mounted.
  const greeting = useSyncExternalStore(
    subscribeToClock,
    getLocalGreeting,
    getServerGreeting,
  );
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
