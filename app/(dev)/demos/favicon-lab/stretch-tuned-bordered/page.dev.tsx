import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("stretchTunedBordered");

export default function Page() {
  return <VariantPreview id="stretchTunedBordered" />;
}
