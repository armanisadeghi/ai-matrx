// /education/flashcards/new/from-source — retired. "A deck from your material"
// is now the Sources step of /education/flashcards/new; a document id in the
// old link arrives there as a picked Source.
import { redirect } from "next/navigation";
import { createDeckHref } from "@/features/flashcards/components/create/createDeckHref";

export default async function FromSourceRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(createDeckHref(await searchParams));
}
