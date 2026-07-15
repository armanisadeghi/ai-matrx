"use server";

/** Compatibility seam retained while old demo bookmarks age out. */
export async function processDebate(_formData: FormData): Promise<never> {
  throw new Error(
    "This legacy debate demo has been retired. Use the voice playground.",
  );
}
