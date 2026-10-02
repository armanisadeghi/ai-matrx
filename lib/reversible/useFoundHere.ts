"use client";

// lib/reversible/useFoundHere.ts — THE OTHER END OF A FOUND-AT LINK.
//
// A reversible-action announcement says where the thing went and opens that place
// (`foundAt: { href, highlight }` → `?found=<highlight>`). The destination page names the spot with
// this hook: it answers whether the address asked for that spot (so a closed disclosure can open
// itself), and — once the element is mounted — scrolls to it and flashes the platform attention
// ring (`@ai-matrx/kit/dom` `revealAndFlash`), once per arrival.

import { useEffect, useRef, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { foundHighlightOf } from "@ai-matrx/kit/reversible";
import { revealAndFlash } from "@ai-matrx/kit/dom";

export function useFoundHere(spot: string, ref: RefObject<HTMLElement | null>): boolean {
  const params = useSearchParams();
  const asked = foundHighlightOf(params) === spot;
  const flashed = useRef(false);
  useEffect(() => {
    if (!asked) {
      flashed.current = false;
      return;
    }
    if (flashed.current || !ref.current) return;
    flashed.current = true;
    revealAndFlash(ref.current, { behavior: "smooth", block: "center" });
  }, [asked, ref]);
  return asked;
}
