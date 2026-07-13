import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("stretchFull");

export default function Page() {
  return <VariantPreview id="stretchFull" />;
}
