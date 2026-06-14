"use client";

// features/war-room/components/all/NewSessionButton.tsx

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createWarRoomSession } from "@/features/war-room/redux/thunks";

export function NewSessionButton() {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const busy = creating || pending;

  async function handleCreate() {
    if (busy) return;
    setCreating(true);
    const session = await dispatch(createWarRoomSession());
    setCreating(false);
    if (session) {
      startTransition(() => router.push(`/war-room/${session.id}`));
    }
  }

  return (
    <Button size="sm" onClick={handleCreate} disabled={busy} className="gap-1.5">
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Plus className="size-4" />
      )}
      New War Room
    </Button>
  );
}
