"use client";

// The 404 boundary for /applets/<slug>: the slug named no Applet this person can open. The canonical
// access answer says which — no such app, or one they have no access to — never an invented reason.

import { useParams } from "next/navigation";
import { SlugAccessGate } from "@/features/access-gate/components/SlugAccessGate";

const TOKENS = ["app"] as const;

export default function AppletUnavailable() {
  const params = useParams();
  const slug = typeof params?.slug === "string" ? params.slug : "";
  return (
    <div className="h-dvh bg-textured">
      <SlugAccessGate tokens={TOKENS} slug={slug} noun="Applet" fallbackHref="/" fallbackLabel="Home" />
    </div>
  );
}
