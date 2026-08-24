// /demos/kind-loaders — the whole kind loading library on one screen, with a
// simulated early-key arrival so each loader's empty→fed progression shows.

import type { Metadata } from "next";
import KindLoaderGallery from "./KindLoaderGallery";

export const metadata: Metadata = {
  title: "Kind Loading Library",
  description:
    "Every loader in the kind loading library, side by side, with live early keys.",
};

export default function KindLoadersDemoPage() {
  return <KindLoaderGallery />;
}
