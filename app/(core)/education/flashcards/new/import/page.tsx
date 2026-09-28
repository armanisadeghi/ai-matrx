// /education/flashcards/new/import — retired. Importing a deck file is now a
// choice on /education/flashcards/new; this opens it there.
import { redirect } from "next/navigation";
import { createDeckHref } from "@/features/flashcards/components/create/createDeckHref";

export default async function ImportRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  redirect(createDeckHref(await searchParams, { start: "import" }));
}
