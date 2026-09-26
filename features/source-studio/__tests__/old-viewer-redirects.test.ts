/**
 * Every old viewer route redirects to the one Source screen WITH its params
 * (SOURCE-CONVERGENCE §8.2, Phase 2 done-when: "every old viewer route
 * redirects with its params"). The real route modules are imported and run;
 * `redirect` is the only double (Next throws from it in production).
 */
const redirect = jest.fn((to: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { to });
});
jest.mock("next/navigation", () => ({ redirect: (to: string) => redirect(to) }));

import KnowledgeViewer from "@/app/(core)/knowledge/viewer/[id]/page";
import RagViewer from "@/app/(core)/rag/viewer/[id]/page";
import KnowledgePreview from "@/app/(core)/knowledge/library/[id]/preview/page";
import RagPreview from "@/app/(core)/rag/library/[id]/preview/page";
import PdfStudioDoc from "@/app/(core)/tools/pdf-extractor/[id]/page";

type RoutePage = (props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) => Promise<unknown>;

async function landing(page: RoutePage, id: string, search: Record<string, string>) {
  redirect.mockClear();
  await expect(
    page({ params: Promise.resolve({ id }), searchParams: Promise.resolve(search) }),
  ).rejects.toThrow("NEXT_REDIRECT");
  expect(redirect).toHaveBeenCalledTimes(1);
  return redirect.mock.calls[0][0];
}

const ID = "7e49f65f-0000-4000-8000-000000000001";

describe("old viewer routes land on /knowledge/sources/[id]", () => {
  it.each([
    ["/knowledge/viewer/[id]", KnowledgeViewer],
    ["/rag/viewer/[id]", RagViewer],
  ])("%s keeps ?page=&chunk=", async (_name, page) => {
    expect(await landing(page as RoutePage, ID, { page: "12", chunk: "c-1" })).toBe(
      `/knowledge/sources/${ID}?page=12&chunk=c-1`,
    );
  });

  it.each([
    ["/knowledge/library/[id]/preview", KnowledgePreview],
    ["/rag/library/[id]/preview", RagPreview],
  ])("%s keeps ?assets=1 and ?page=", async (_name, page) => {
    expect(await landing(page as RoutePage, ID, { assets: "1", page: "2" })).toBe(
      `/knowledge/sources/${ID}?page=2&assets=1`,
    );
  });

  it("/tools/pdf-extractor/[id] opens the Source screen", async () => {
    expect(await landing(PdfStudioDoc as RoutePage, ID, {})).toBe(
      `/knowledge/sources/${ID}`,
    );
  });
});
