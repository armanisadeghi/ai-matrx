import { createRouteMetadata } from "@/utils/route-metadata";
import { PdfNamedSwitcherDemo } from "./components/PdfNamedSwitcherDemo";

export const metadata = createRouteMetadata("/demos/pdf-named-switcher", {
  title: "PDF Named Surface Switcher",
  description:
    "Interactive demo: PdfNamedSurfaceSwitcher — editable filename + PDF icon + surface switcher.",
});

export default function PdfNamedSwitcherDemoPage() {
  return <PdfNamedSwitcherDemo />;
}
