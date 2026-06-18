"use client";

// app/(core)/war-room/[id]/page.tsx
//
// The War Room experience for one saved session. Auth is enforced by the
// (core) layout; the room shell hydrates the session + tiles from Redux.

import { useEffect } from "react";
import { useParams } from "next/navigation";
import { WarRoomShell } from "@/features/war-room/components/room/WarRoomShell";
import { traceWarRoomRenderPath } from "@/features/war-room/utils/renderPathTrace";

export default function WarRoomSessionPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : "";

  useEffect(() => {
    if (!id) return;
    traceWarRoomRenderPath(1, "WarRoomSessionPage", { sessionId: id });
  }, [id]);

  if (!id) return null;
  return <WarRoomShell sessionId={id} />;
}
