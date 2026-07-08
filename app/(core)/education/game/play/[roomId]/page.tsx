// /education/game/play/[roomId]?code=XXXXX — the live multiplayer game (lobby →
// play → results). Server shell resolves the roomId + join code; the heavy
// realtime surface (Broadcast, presence, game engine) is code-split behind
// next/dynamic({ ssr:false }) via MultiplayerGame. The `code` param lets both
// host AND joiner hydrate the room via the cross-owner RPC.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MultiplayerGame } from "@/features/education/engage/components/multiplayer/MultiplayerGame";

export const metadata: Metadata = {
  title: "Live Game — Study Games",
};

interface PlayPageProps {
  params: Promise<{ roomId: string }>;
  searchParams: Promise<{ code?: string }>;
}

export default async function GamePlayPage({
  params,
  searchParams,
}: PlayPageProps) {
  const { roomId } = await params;
  const { code } = await searchParams;
  // The join code is required to hydrate the room cross-owner; without it a
  // joiner can't read a room they don't own. Send them to Join.
  if (!code) redirect("/education/game/join");
  return (
    <div className="h-full overflow-hidden">
      <MultiplayerGame roomId={roomId} code={code} />
    </div>
  );
}
