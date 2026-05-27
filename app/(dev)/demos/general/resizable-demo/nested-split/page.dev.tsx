import { NestedResizableLayout, Section } from '@/components/matrx/resizable/NestedResizableLayout';

import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/demo/resizable-demo/nested-split", {
  title: "Resizable Demo Nested Split",
  description: "Interactive demo: Resizable Demo Nested Split. AI Matrx demo route.",
});

export default function EntityBrowserPage() {
    const sections: Section[] = [
        {
            type: 'content',
            content: <div>Left Panel</div>,
            defaultSize: 25,
            minSize: 15
        },
        {
            type: 'nested',
            defaultSize: 50,
            sections: [
                {
                    type: 'content',
                    content: <div>Top Middle</div>,
                    defaultSize: 40
                },
                {
                    type: 'content',
                    content: <div>Bottom Middle</div>,
                    defaultSize: 60,
                    collapsible: true
                }
            ]
        },
        {
            type: 'nested',
            defaultSize: 25,
            sections: [
                {
                    type: 'content',
                    content: <div>Top Right</div>,
                    defaultSize: 30
                },
                {
                    type: 'content',
                    content: <div>Middle Right</div>,
                    defaultSize: 40
                },
                {
                    type: 'content',
                    content: <div>Bottom Right</div>,
                    defaultSize: 30
                }
            ]
        }
    ];



    return (
        <NestedResizableLayout sections={sections} />
    );
}
