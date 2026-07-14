import { buildVariantFaviconMetadata } from "../faviconMeta";
import VariantPreview from "../VariantPreview";

export const metadata = buildVariantFaviconMetadata("archivoClip");

export default function Page() {
  return <VariantPreview id="archivoClip" />;
}
