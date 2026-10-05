import { Providers } from "@/app/Providers";
import { MdButtonsGallery } from "./MdButtonsGallery";

export const metadata = { title: "Markdown block buttons" };

// Temporary visual-verification page for the markdown block button conversion.
export default function MdButtonsLabPage() {
  return (
    <Providers>
      <MdButtonsGallery />
    </Providers>
  );
}
