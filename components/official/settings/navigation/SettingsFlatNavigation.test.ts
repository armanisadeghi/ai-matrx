import { settingsNavigationSections } from "./SettingsFlatNavigation";

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
