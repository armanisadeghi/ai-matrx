// /education/start — retired address of the study-kit create page. It forwards
// to the ONE create route (/education/kits/new), carrying ?source= / ?from= so a
// passed source still pre-picks.
import { redirect } from "next/navigation";
import { newKitHref } from "@/features/education/onboard/startRoutes";

export default async function EducationStartPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(newKitHref(await searchParams));
}
