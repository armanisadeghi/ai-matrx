import MatxRouteLoader from "@/components/loaders/route-loading";

export default function RunPromptLoading() {
    return (
        <MatxRouteLoader
            title="Loading Prompt"
            subtitle="Preparing your prompt..."
            step1="Fetching"
            step2="Loading"
            step3="Ready"
            fullscreen={true}
        />
    );
}

