// data/[id]/page.tsx

import DataTableDetailClient from "./DataTableDetailClient";

interface AppletPageProps {
    params: {
        id: string;
    };
}

export default async function AppletPage({ params }: AppletPageProps) {
    const { id } = await params;

    return <DataTableDetailClient tableId={id} />;
}
