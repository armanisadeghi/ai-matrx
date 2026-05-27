import { join } from "path";
import { RouteIndexPage } from "@/components/ssr/RouteIndexPage";

export default async function ChatTestsPage() {
    return (
        <RouteIndexPage
            directory={join(process.cwd(), "app", "(dev)", "demos", "tests", "chat-tests")}
            basePath="/legacy/tests/chat-tests"
            title="Chat Tests"
        />
    );
}
