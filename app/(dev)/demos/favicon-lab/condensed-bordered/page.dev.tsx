import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("condensedBordered");

export default function Page() {
  return <VariantPreview id="condensedBordered" />;
}
