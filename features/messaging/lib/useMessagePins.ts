"use client";

import { useEffect, useState } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { favoritesService } from "@/features/scopes/service/favoritesService";
import { toast } from "@/lib/toast";

/** Per-person pins use the platform's durable user-entity state. */
export function useMessagePins() {
  const userId = useAppSelector(selectUserId);
  const [loaded, setLoaded] = useState<{
    userId: string | null;
    pins: string[];
  }>({ userId: null, pins: [] });
  const pins = loaded.userId === userId ? loaded.pins : [];
  const [pending, setPending] = useState(false);
  useEffect(() => {
    let current = true;
    if (!userId) return;
    const read = async () => {
      try {
        const result = await favoritesService.list("pinned");
        if (!result.ok) throw new Error(result.error.message);
        if (current)
          setLoaded({
            userId,
            pins: result.data.items
              .filter(
                (item) =>
                  item.entityType === "dm_conversation" && item.isPinned,
              )
              .map((item) => item.entityId),
          });
      } catch (error) {
        if (current)
          toast.error(
            error instanceof Error
              ? error.message
              : "Couldn't load pinned conversations",
          );
      }
    };
    void read();
    window.addEventListener("messages-pins-changed", read);
    return () => {
      current = false;
      window.removeEventListener("messages-pins-changed", read);
    };
  }, [userId]);
  async function toggle(id: string) {
    if (pending) return;
    setPending(true);
    try {
      const result = await favoritesService.setPinned(
        "dm_conversation",
        id,
        !pins.includes(id),
      );
      if (!result.ok) throw new Error(result.error.message);
      window.dispatchEvent(new Event("messages-pins-changed"));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Couldn't update pinned conversation",
      );
    } finally {
      setPending(false);
    }
  }
  return { pins, toggle, pending };
}
