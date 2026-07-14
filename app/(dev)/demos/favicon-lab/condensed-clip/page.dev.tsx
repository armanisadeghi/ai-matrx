import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("condensedClip");

export default function Page() {
  return <VariantPreview id="condensedClip" />;
}
