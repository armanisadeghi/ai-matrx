// PrintSectionFrame — the body every `/print/<section>` page sits in.
//
// Server Component. It owns the two things a (core) route body must get right
// and no section should re-litigate: the header injection (via the ONE
// `/print` header) and the top offset that keeps the first row out of the
// glass header band. Sections render their own `SectionShell` card inside.

import { PrintSectionHeader } from "./PrintSectionHeader";

export function PrintSectionFrame({
    sectionId,
    right,
    children,
}: {
    sectionId: string;
    right?: React.ReactNode;
    children: React.ReactNode;
}) {
    return (
        <div className="flex h-full flex-col overflow-hidden bg-textured">
            <PrintSectionHeader sectionId={sectionId} right={right} />
            <div className="flex-1 overflow-y-auto">
                <div className="mx-auto w-full max-w-7xl px-3 pb-12 pt-[calc(var(--shell-header-h)+0.75rem)] sm:px-4">
                    {children}
                </div>
            </div>
        </div>
    );
}
