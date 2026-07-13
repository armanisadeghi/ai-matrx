import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("stretchInset");

export default function Page() {
  return <VariantPreview id="stretchInset" />;
}
