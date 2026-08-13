// data/[id]/page.tsx

import DataTableDetailClient from "./DataTableDetailClient";

interface DataDetailPageProps {
    params: {
        id: string;
    };
}

export default async function DataDetailPage({ params }: DataDetailPageProps) {
    const { id } = await params;

    return <DataTableDetailClient tableId={id} />;
}
