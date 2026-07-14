import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("archivoStretch");

export default function Page() {
  return <VariantPreview id="archivoStretch" />;
}
