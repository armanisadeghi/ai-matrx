import Link from "next/link";
import { LAB_PAGES } from "./lab-pages";

export const metadata = { title: "Lab" };

export default function LabIndexPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Lab</h1>
      <ul className="divide-y divide-border rounded-md border border-border bg-card">
        {LAB_PAGES.map((page) => (
          <li key={page.href}>
            <Link href={page.href} className="block px-4 py-3 text-sm hover:bg-muted">
              {page.title}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
