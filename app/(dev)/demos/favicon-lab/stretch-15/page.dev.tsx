import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("stretch15");

export default function Page() {
  return <VariantPreview id="stretch15" />;
}
