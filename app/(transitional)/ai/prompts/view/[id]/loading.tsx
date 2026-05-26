import MatxRouteLoader from "@/components/loaders/route-loading";

export default function ViewPromptLoading() {
    return (
        <MatxRouteLoader
            title="Loading Prompt"
            subtitle="Fetching prompt details..."
            step1="Fetching"
            step2="Loading"
            step3="Ready"
            fullscreen={true}
        />
    );
}

