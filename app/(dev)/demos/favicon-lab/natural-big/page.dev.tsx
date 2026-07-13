import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("naturalBig");

export default function Page() {
  return <VariantPreview id="naturalBig" />;
}
