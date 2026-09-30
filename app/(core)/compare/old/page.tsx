// app/(core)/compare/old/page.tsx — the index of old Knowledge pages kept for
// comparison, each beside its new page. Review-only; linked from nowhere.

import Link from "next/link";
import { COMPARE_PAIRS } from "./_components/pairs";

export default function CompareOldIndexPage() {
  return (
    <div className="h-full overflow-auto bg-background pt-[var(--shell-header-h)]">
      <div className="mx-auto max-w-4xl space-y-4 px-4 py-6 sm:px-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">Old pages, kept for comparison</h1>
          <p className="text-sm text-muted-foreground">
            Each old page next to the page that replaced it. The old addresses still send people to the
            new pages; these copies are here only until the comparison is confirmed, then they are deleted.
          </p>
        </header>
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Page</th>
                <th className="px-3 py-2 font-medium">Old</th>
                <th className="px-3 py-2 font-medium">New</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE_PAIRS.map((p) => (
                <tr key={p.oldHref} className="border-t align-top">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">was {p.oldAddress}</div>
                    {p.note ? <div className="mt-0.5 text-xs text-muted-foreground">{p.note}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <Link href={p.oldHref} className="whitespace-nowrap text-primary underline underline-offset-2">
                      Old page
                    </Link>
                  </td>
                  <td className="px-3 py-2">
                    <Link href={p.newHref} className="whitespace-nowrap text-primary underline underline-offset-2">
                      {p.newLabel}
                    </Link>
                    {p.extra ? (
                      <div className="mt-0.5 text-xs">
                        <Link href={p.extra.href} className="text-muted-foreground underline underline-offset-2">
                          {p.extra.label}
                        </Link>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
