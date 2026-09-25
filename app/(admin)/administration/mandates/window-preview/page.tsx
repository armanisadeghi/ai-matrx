import { WindowPreviewPage } from "@/features/mandates/record-next/WindowPreviewPage";

/**
 * /administration/mandates/window-preview — opens the NEW mandate window
 * (MandateWindowNext) so it can be compared with the old one.
 */
export const metadata = {
  title: "Mandate window (preview)",
  description: "Try the new mandate window",
};

export default function MandateWindowPreviewRoute() {
  return <WindowPreviewPage />;
}
