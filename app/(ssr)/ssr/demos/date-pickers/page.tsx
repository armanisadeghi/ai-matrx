import { createRouteMetadata } from "@/utils/route-metadata";
import DatePickersDemo from "./_client";

export const metadata = createRouteMetadata("/ssr/demos/date-pickers", {
  title: "Date pickers — canonical",
  description:
    "The three date-picker patterns we're standardizing on across the app: single date, date range, and date + time — all on the same Calendar with the year-dropdown height, range-double-click, and time-cutoff bugs fixed.",
});

export default function DatePickersDemoPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="mx-auto max-w-7xl space-y-8 px-6 py-8">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Date pickers — canonical
          </h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            The three patterns we're standardizing on across the app. All sit on
            the same{" "}
            <code className="font-mono text-xs">
              components/ui/calendar.tsx
            </code>{" "}
            with three fixes baked in: the year/month dropdowns now scroll
            inside a 288px max-height panel (no more full-screen lists), the
            range picker resets on every click (no more double-click trap), and
            the time field is sized to fit AM/PM without clipping.
          </p>
        </header>
        <DatePickersDemo />
      </div>
    </div>
  );
}
