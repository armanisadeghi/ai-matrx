"use client";

import { useEffect, useState, type RefObject } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RenderedFindBar } from "./RenderedFindBar";

/** Places the shared rendered-content finder in a reader's existing header. */
export function ContentFindControl({
  rootRef,
  label = "Find in this content",
}: {
  rootRef: RefObject<HTMLElement | null>;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);

  const openFind = () => {
    setOpen(true);
    setFocusRequest((value) => value + 1);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f" && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        setOpen(true);
        setFocusRequest((value) => value + 1);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  return (
    <div className="relative shrink-0">
      <Button type="button" variant="ghost" size="icon" aria-label={label} title={label} onClick={openFind}>
        <Search className="h-4 w-4" aria-hidden />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-[min(88vw,520px)]">
          <RenderedFindBar rootRef={rootRef} label={label} focusRequest={focusRequest} onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
