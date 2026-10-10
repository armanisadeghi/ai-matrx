import Link from "next/link";
import { asClause } from "@ai-matrx/kit/text";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";

import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { createClient } from "@/utils/supabase/server";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
/**
 * `/marketing/calendar` lands on the PR calendar. The calendar belongs to one client
 * (`/marketing/<brand>/planning/calendar`), so with exactly one brand it goes straight
 * there, and with several it asks which — it never guesses a client.
 *
 * It used to `permanentRedirect` to the Google read-only sweep, which was never a
 * calendar. This is a TEMPORARY redirect now: a 308 is cached by browsers indefinitely.
 */
export default async function MarketingCalendarPage() {
  const supabase = await createClient();
  const { data: brands, error } = await supabase
    .schema("web")
    .from("brand")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .limit(200);

  const calendarOf = (id: string) => `${marketingRoutes.brand(id)}/planning/calendar`;
  if (!error && brands?.length === 1) redirect(calendarOf(brands[0].id));

  return (
    <>
      <RecordPageHeader record={{ name: "PR Calendar" }} />
      <div className="h-full overflow-y-auto pt-[var(--shell-header-h)]">
        <div className="mx-auto flex max-w-xl flex-col gap-3 p-6">
          <div className="flex items-center gap-2">
            <CalendarDays className="size-4 text-primary" aria-hidden />
            <h2 className="text-sm font-semibold">Whose calendar?</h2>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              Your clients could not be read: {asClause(error.message)}. Open one from{" "}
              <Link className="underline" href={marketingRoutes.brands()}>
                your client list
              </Link>{" "}
              and choose Planning, then Calendar.
            <ErrorAlchemyMenu /></p>
          ) : !brands?.length ? (
            <p className="text-sm text-muted-foreground">
              There is no client yet. <Link className="underline" href={marketingRoutes.brands()}>Add one</Link> and
              its PR calendar will live here.
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {brands.map((b) => (
                <li key={b.id}>
                  <Link href={calendarOf(b.id)} className="block px-3 py-2 text-sm hover:bg-muted">
                    {b.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
