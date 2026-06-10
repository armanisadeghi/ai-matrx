import type { Metadata } from "next";
import { CreateConsole } from "./_components/CreateConsole";

export const metadata: Metadata = {
  title: "Create Episode — Podcast Studio",
  description:
    "Configure your source and production options, then generate a fully produced two-host episode.",
};

// Variation E — the production console.
//
// Server entry. All interactivity lives in <CreateConsole/> (client).
export default function CreateEpisodePageE() {
  return (
    <div className="h-page w-full overflow-hidden bg-textured">
      <CreateConsole />
    </div>
  );
}
