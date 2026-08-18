// app/(core)/marketing/pr/sharp/page.tsx
//
// THE PRESS ROOM — the hub for the Press & PR pillar (ui-sharp bake-off entry).
//
// Server Component. It owns route chrome and one decision — which data scenario
// the client workspace loads — and nothing else. Everything interactive lives in
// `features/marketing/pr/sharp/`.
//
// `?data=ready|empty|error|stalled` forces one of the four load states so a
// reviewer can see the unglamorous ones on the real route. It defaults to the
// real path, and it is read here rather than in the client so the URL stays the
// single source of that decision.
//
// `(core)` route conventions: chrome via <PageHeader>, body `h-full
// overflow-hidden`, never `h-page` / `calc(100dvh - header)`.

import PageHeader from "@/features/shell/components/header/PageHeader";
import { PressRoom, PressRoomHeading } from "@/features/marketing/pr/sharp/PressRoom";
import { parseScenario } from "@/features/marketing/pr/sharp/scenario";

export default async function PressRoomSharpPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string }>;
}) {
  const { data } = await searchParams;
  const scenario = parseScenario(data ?? null);

  return (
    <>
      <PageHeader>
        <PressRoomHeading />
      </PageHeader>
      <div className="h-full overflow-hidden">
        <PressRoom scenario={scenario} />
      </div>
    </>
  );
}
