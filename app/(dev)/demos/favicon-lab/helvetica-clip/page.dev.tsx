import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("helveticaClip");

export default function Page() {
  return <VariantPreview id="helveticaClip" />;
}
