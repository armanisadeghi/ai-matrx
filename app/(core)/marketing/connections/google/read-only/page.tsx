import { permanentRedirect } from "next/navigation";
import { marketingRoutes } from "@/features/marketing/lib/routes";

/** Legacy address — the Google read-only sweep is an agency operation now. */
export default function GoogleReadOnlySweepShim() {
  permanentRedirect(`${marketingRoutes.connectionsGoogle()}/read-only`);
}
