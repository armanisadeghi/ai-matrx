// app/(authenticated)apps/debug/[slug]/page.tsx

import AppRendererTest from "../../AppRendererTest";

type Params = Promise<{ slug: string }>;

export default async function Page({ params }: { params: Params }) {
    const { slug } = await params; // Await the params Promise
    return (
        <div>
            <AppRendererTest slug={slug} />
        </div>
    );
}
