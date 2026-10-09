// /demos/composer/make-copy — a copy of the /make describe box, for redesigning it on the
// shared composer beside the real page (/make). Nothing here changes the real box.
import type { Metadata } from "next";
import { DescribeBoxCopy } from "./DescribeBoxCopy";

export const metadata: Metadata = { title: "Make (copy)", description: "A copy of the /make describe box." };

export default function MakeCopyPage() {
  return (
    <div className="h-full overflow-y-auto bg-background pt-[var(--shell-header-h,2.75rem)]">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <h1 className="text-2xl font-semibold text-foreground">What do you want to make?</h1>
        <DescribeBoxCopy />
      </div>
    </div>
  );
}
