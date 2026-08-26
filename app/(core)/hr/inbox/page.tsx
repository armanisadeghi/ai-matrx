import { permanentRedirect } from "next/navigation";

/**
 * `/hr/inbox` is the workflow spec's original name for the inbox; SPEC-UI-IA
 * owns the route map and `/hr/tasks` is canonical (R-L8-L9-L10 U-5). A 308 keeps
 * every link ever written against the old name working, and keeps there being
 * exactly ONE inbox rather than two paths that drift apart.
 */
export default function HrInboxRedirect() {
    permanentRedirect("/hr/tasks");
}
