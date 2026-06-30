// /education/flashcards — the Flashcards tool home (list-first "savior" view).
// Server component shell (no "use client"): metadata for SEO + the client list
// island. FlashcardsHome is a "use client" leaf, so importing it here forms the
// client boundary and Next.js code-splits it automatically — no `dynamic`
// needed (and `dynamic({ ssr:false })` is illegal in a Server Component).
import type { Metadata } from "next";
import { toolMetadata } from "@/features/education/route-helpers";
import { FlashcardsHome } from "@/features/flashcards/components/home/FlashcardsHome";

export const metadata: Metadata = toolMetadata("flashcards");

export default function FlashcardsToolPage() {
  return <FlashcardsHome />;
}
