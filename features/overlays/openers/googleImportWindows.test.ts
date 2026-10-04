import { readGoogleContactsImportLaunchData } from "./googleImportWindows";

it("narrows restored Directory launch data and keeps its organization", () => {
  expect(
    readGoogleContactsImportLaunchData({
      organizationId: "org-one",
      initialExternalId: 42,
      initialView: "directory",
      ignored: "value",
    }),
  ).toEqual({
    organizationId: "org-one",
    initialExternalId: null,
    initialView: "directory",
  });
});

it.each([null, {}, { initialView: "admin" }, { initialView: 12 }])(
  "defaults malformed restored launch data to Contacts",
  (value) => {
    expect(readGoogleContactsImportLaunchData(value)).toEqual({
      organizationId: null,
      initialExternalId: null,
      initialView: "contacts",
    });
  },
);
