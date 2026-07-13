import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("condensedHeavy");

export default function Page() {
  return <VariantPreview id="condensedHeavy" />;
}
