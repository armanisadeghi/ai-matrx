import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("stretchTuned");

export default function Page() {
  return <VariantPreview id="stretchTuned" />;
}
