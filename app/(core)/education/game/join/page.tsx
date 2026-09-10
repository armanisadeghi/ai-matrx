// /education/game/join — join a multiplayer room by code. JoinRoomImpl is a
// light "use client" leaf; importing it here forms the client boundary.
import type { Metadata } from "next";
// eslint-disable-next-line no-restricted-syntax -- JoinRoomImpl has no dynamic wrapper sibling; this page IS its client boundary (see header comment), so Next code-splits it per route.
import { JoinRoomImpl } from "@/features/education/engage/components/lobby/JoinRoomImpl";

export const metadata: Metadata = {
  title: "Join a Game — Study Games",
};

export default function JoinGamePage() {
  return (
    <div className="h-full overflow-hidden">
      <JoinRoomImpl />
    </div>
  );
}
