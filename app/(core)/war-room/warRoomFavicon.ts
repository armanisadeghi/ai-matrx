// EXPERIMENTAL favicon bakeoff (see /demos/favicon-lab): War Room is the live
// test route for the new two-letter "flush" badge. It uses Claude's textLength
// approach, inset 4px so the caps don't clip the rounded corners. Compare
// alternatives in the lab, then fold the winner into generateSVGFavicon and
// delete this file.
import { svgToDataURI } from "@/utils/favicon-utils";
import { FAVICON_VARIANTS } from "@/utils/favicon-variants";

const variant = FAVICON_VARIANTS.find((v) => v.id === "stretchInset")!;

/** Metadata `icons` override for every War Room layout — big flush "WR" badge. */
export const warRoomIcons = {
  icon: [
    {
      url: svgToDataURI(variant.generate({ letter: "WR", color: "#dc2626" })),
      type: "image/svg+xml",
    },
  ],
} as const;
