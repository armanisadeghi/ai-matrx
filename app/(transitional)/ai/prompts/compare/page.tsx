import { Beaker, GitCompare, Construction } from 'lucide-react';

export const metadata = {
    title: 'Multi-Version Testing | AI Matrx',
    description: 'Test multiple prompt versions simultaneously to compare results side-by-side.',
};

export default function MultiVersionTestingPage() {
    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
                <div className="p-3 rounded-xl bg-primary/10">
                    <Beaker className="w-8 h-8 text-primary" />
                </div>
            </div>

            <h1 className="text-2xl font-bold mb-2">Multi-Version Testing</h1>

            <p className="text-muted-foreground text-center max-w-md mb-8">
                Test 2–5 prompt versions simultaneously and compare results side-by-side.
                This feature is coming soon.
            </p>

            {/* Placeholder slots */}
            <div className="w-full max-w-4xl grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                {[1, 2, 3].map((slot) => (
                    <div
                        key={slot}
                        className="border-2 border-dashed border-border rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-muted-foreground/50"
                    >
                        <GitCompare className="w-6 h-6" />
                        <span className="text-sm font-medium">Version Slot {slot}</span>
                        <span className="text-xs">Select a version</span>
                    </div>
                ))}
            </div>

            {/* Coming soon banner */}
            <div className="flex items-center gap-2 px-4 py-2 bg-muted/50 rounded-full">
                <Construction className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground font-medium">
                    Coming Soon — Multi-version parallel testing
                </span>
            </div>
        </div>
    );
}
