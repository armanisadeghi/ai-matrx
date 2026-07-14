import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("michromaStretch");

export default function Page() {
  return <VariantPreview id="michromaStretch" />;
}
