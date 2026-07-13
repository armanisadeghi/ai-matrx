import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("condensed");

export default function Page() {
  return <VariantPreview id="condensed" />;
}
