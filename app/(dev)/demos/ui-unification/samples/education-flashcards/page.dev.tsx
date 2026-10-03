import { FlashcardSetSample } from "./_components/FlashcardSetSample";

/** The deck the owner named (2026-10-03). `?id=<setId>` opens any other. */
const DEFAULT_SET_ID = "a55a0b20-a6e9-47e4-a47d-bf4c74677cc3";

/** Sample: /education/flashcards/[setId] rebuilt on the 28px system — an honest fork, real deck data. */
export default async function EducationFlashcardsSamplePage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  const setId = id && /^[0-9a-f-]{36}$/i.test(id) ? id : DEFAULT_SET_ID;
  return <FlashcardSetSample key={setId} setId={setId} />;
}
