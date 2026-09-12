import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  SettingsFlatNavigation,
  settingsNavigationSections,
} from "./SettingsFlatNavigation";

describe("settingsNavigationSections", () => {
  it("keeps root links together and maps configuration folders to their Overview leaf", () => {
    const sections = settingsNavigationSections([
      { id: "camera", label: "Camera" },
      { id: "email", label: "Email" },
      {
        id: "general",
        label: "General",
        children: [{ id: "general.profile", label: "Profile" }],
      },
      { id: "video", label: "Video" },
      {
        id: "configuration",
        label: "Configuration",
        children: [
          {
            id: "configuration.commerce",
            label: "Commerce",
            children: [
              {
                id: "configuration.commerce.overview",
                label: "Overview",
              },
            ],
          },
        ],
      },
    ]);

    expect(sections).toMatchObject([
      { id: "unsectioned:camera", items: [{ id: "camera" }, { id: "email" }] },
      { id: "general", label: "General", items: [{ id: "general.profile" }] },
      { id: "unsectioned:video", items: [{ id: "video" }] },
      {
        id: "configuration",
        label: "Configuration",
        items: [
          {
            id: "configuration.commerce.overview",
            label: "Commerce",
            location: "Configuration / Commerce",
          },
        ],
      },
    ]);
  });
});


describe("SettingsFlatNavigation rendering", () => {
  it("styles native link and button roots without shell navigation classes", () => {
    const markup = renderToStaticMarkup(
      <SettingsFlatNavigation
        activeId="button"
        sections={[{
          id: "general",
          label: "General",
          items: [
            { id: "link", label: "Link", location: "Settings", node: { id: "link", label: "Link" } },
            { id: "button", label: "Button", location: "Settings", node: { id: "button", label: "Button" } },
          ],
        }]}
        renderItem={(item) => item.id === "link"
          ? createElement("a", { href: "/settings/link" }, item.label)
          : createElement("button", { type: "button" }, item.label)}
      />,
    );

    expect(markup).toContain("[&amp;&gt;a]:min-h-[1.875rem]");
    expect(markup).toContain("[&amp;&gt;button]:min-h-[1.875rem]");
    expect(markup).toContain("[&amp;&gt;button]:bg-muted");
    expect(markup).not.toContain("shell-nav-item");
  });
});
