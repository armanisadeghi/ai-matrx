import MatxRouteLoader from "@/components/loaders/route-loading";

export default function EditPromptLoading() {
    return (
        <MatxRouteLoader
            title="Loading Prompt"
            subtitle="Preparing your prompt for editing..."
            step1="Fetching"
            step2="Loading"
            step3="Ready"
            fullscreen={true}
        />
    );
}

