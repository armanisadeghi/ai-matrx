# New Route Scaffold — Coming Soon Placeholder

Read only when the route's real UI isn't built yet and `page.tsx` needs a placeholder.

## `page.tsx` — placeholder for routes under development

When a route's real UI isn't built yet, use `ComingSoonPage` from `components/coming-soon/CominSoonTemplate.tsx`. **Always customize all four props** — the defaults are generic marketing copy that will confuse users and hurt SEO.

```typescript
import ComingSoonPage from "@/components/coming-soon/CominSoonTemplate";

export default function MyFeaturePage() {
    return (
        <ComingSoonPage
            heroTitleLine1="Your Notes,"
            heroTitleLine2="organised by AI"
            description="A smart note-taking workspace with AI tagging, linking, and search. Coming soon."
            statusBadgeText="Notes is under active development"
        />
    );
}
```

Props to always set: `heroTitleLine1`, `heroTitleLine2`, `description` (feature-specific, SEO-friendly), `statusBadgeText` (present-tense, names the feature).
