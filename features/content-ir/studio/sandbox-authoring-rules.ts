/**
 * THE AUTHORING RULES for an organization-authored component — what it may and
 * may not do once it renders inside the Shape sandbox frame (DD-123 S7).
 *
 * WHY THIS IS A DECLARED LIST AND NOT A PARAGRAPH SOMEWHERE. Every rule below
 * is a real boundary the running system enforces: a Content Security Policy on
 * the frame's own document, a build-time audit of the bundle the frame loads, a
 * render-time protocol check, or the plain geometry of an iframe. An author who
 * only finds out at render time that their remote image never loads has been
 * failed by this screen, not by the sandbox. So each row says three things in
 * the author's own language: what they may do, what they may not, and WHAT THEY
 * WILL SEE when they cross the line — because a rule whose consequence is
 * invisible reads as a suggestion.
 *
 * Pure data — no React, no server imports — so the same list can be rendered on
 * the authoring screen, handed to the component-authoring agent, and asserted
 * in a test. When the sandbox gains or loses a boundary, THIS is the file that
 * changes, and the screen follows.
 *
 * Cross-repo context lives once, in
 * `common-docs/projects/data-doctrine-adoption/plans/DD-123-shape-sandbox.md`.
 */

export type SandboxRuleTopic =
    | "network"
    | "storage"
    | "page"
    | "layout"
    | "images"
    | "links"
    | "overlays"
    | "actions";

export interface SandboxAuthoringRule {
    topic: SandboxRuleTopic;
    /** The heading an author scans for. */
    title: string;
    /** What they CAN do — always first, because most of this is permission. */
    allowed: string;
    /** What they cannot, in one sentence, with no jargon. */
    forbidden: string;
    /** What actually happens if they do it anyway. Never vague. */
    consequence: string;
}

export const SANDBOX_AUTHORING_RULES: readonly SandboxAuthoringRule[] = [
    {
        topic: "network",
        title: "No network calls of any kind",
        allowed:
            "Render everything from the data you are given. Everything the component needs to show should arrive in that value.",
        forbidden:
            "No fetch, no XMLHttpRequest, no WebSocket, no sendBeacon, no loading a script or stylesheet from another site.",
        consequence:
            "The request is refused by the browser before it leaves the page and the console names it as a security-policy violation. Nothing is sent, and your component renders without whatever it was waiting for.",
    },
    {
        topic: "storage",
        title: "No cookies, no local storage, no session storage",
        allowed:
            "Hold anything you need in ordinary React state for as long as the component is on screen.",
        forbidden:
            "No document.cookie, localStorage, sessionStorage, IndexedDB, or any other place that outlives the render.",
        consequence:
            "The browser refuses the read or the write and throws. Anything a person should be able to keep belongs in the Shape's own data, which is saved properly and is visible to the rest of the platform.",
    },
    {
        topic: "page",
        title: "You cannot reach the page around you",
        allowed:
            "Everything inside your own component: your own document, your own styles, your own event handlers.",
        forbidden:
            "No window.parent, window.top, window.opener, no reading the address bar, no navigating the page, no touching another component.",
        consequence:
            "Every one of these throws a security error. This is the whole point of the sandbox: a component cannot read the signed-in session or change a page it does not own.",
    },
    {
        topic: "layout",
        title: "Size against your own box — container queries, not screen sizes",
        allowed:
            "Container queries: @container with @sm:, @md:, @lg: and friends. They measure the space your component was actually given, which is what you want everywhere.",
        forbidden:
            "Screen-width classes — sm:, md:, lg:, xl:, 2xl:. Inside the frame these measure YOUR box, not the window, so a component in a narrow panel will render its phone layout on a desktop.",
        consequence:
            "Nothing errors: it simply lays out at the wrong size, which is the hardest kind of mistake to see. Use container queries and your component looks right in a chat message, a side panel and a full page alike.",
    },
    {
        topic: "images",
        title: "Images come from the platform, not from someone else's server",
        allowed:
            "Images the platform serves, and images carried inside the data itself (a data: or blob: value).",
        forbidden:
            "An <img> or a CSS background pointing at any other website.",
        consequence:
            "The image never loads and the browser logs a security-policy violation — a broken picture, nothing worse. A remote image is also how a component could quietly report what a reader is looking at to another site, which is why the door is closed. Upload the image to the platform and point at it there.",
    },
    {
        topic: "links",
        title: "Links must be ordinary links",
        allowed:
            "http:, https:, mailto:, tel:, and relative links inside the platform.",
        forbidden:
            "javascript: and data: in a link — including one that arrives inside the data your component is rendering.",
        consequence:
            "The link is rendered inert and says so rather than doing something on click. This one matters even for a component you trust: the value in the field may not be one you wrote.",
    },
    {
        topic: "overlays",
        title: "Dialogs and popovers stay inside your component",
        allowed:
            "Dialogs, popovers, tooltips and menus from the platform's component library — they work normally.",
        forbidden:
            "Expecting one to cover the whole page. Your component owns its own rectangle and an overlay is clipped to it.",
        consequence:
            "A dialog opens centred in your component's box, not the window. Design overlays that make sense at your component's size, and put anything that genuinely needs the whole screen behind an action instead.",
    },
    {
        topic: "actions",
        title: "Actions are how you ask the platform to do something",
        allowed:
            "runAction(key, input) for everything that leaves your component — including the copy bar's Groom with an agent and Send to Google, which are relayed to the platform on exactly the same pipe.",
        forbidden:
            "Reaching for the platform's data layer, the signed-in session, or any client library directly.",
        consequence:
            "An action key nobody has registered comes back as a refusal with a sentence you can show the reader — it never throws and never fails silently. Everything else is simply not there to import.",
    },
] as const;

/** How tall a component may get before the reader is offered a control. */
export const SANDBOX_HEIGHT_NOTE =
    "A component taller than the height limit is held at it, with a control saying how tall it really is — nothing is ever cut off without saying so. The limit is a platform setting, not a number in the code.";
