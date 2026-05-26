// page.tsx

import NextNavCardFull from "@/components/matrx/navigation/NextNavCardFull";
import { filteredPages } from "./config";

export default function Page() {
  return (
    <div className="container mx-auto py-6">
      <NextNavCardFull items={filteredPages} />
    </div>
  );
}
