import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("michromaClip");

export default function Page() {
  return <VariantPreview id="michromaClip" />;
}
