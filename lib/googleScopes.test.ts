import { GOOGLE_SCOPE, hasGoogleGrantedScope } from "./googleScopes";

describe("hasGoogleGrantedScope", () => {
  it.each([
    [GOOGLE_SCOPE.gmailModify, GOOGLE_SCOPE.gmailReadonly],
    [GOOGLE_SCOPE.contactsWrite, GOOGLE_SCOPE.contactsReadonly],
    [GOOGLE_SCOPE.tasksWrite, GOOGLE_SCOPE.tasksReadonly],
    [GOOGLE_SCOPE.calendarEventsWrite, GOOGLE_SCOPE.calendarEventsReadonly],
    [GOOGLE_SCOPE.webmasters, GOOGLE_SCOPE.webmastersReadonly],
  ])("recognizes the confirmed %s coverage of %s", (granted, required) => {
    expect(hasGoogleGrantedScope([granted], required)).toBe(true);
  });

  it.each([
    [GOOGLE_SCOPE.gmailReadonly, GOOGLE_SCOPE.gmailModify],
    [GOOGLE_SCOPE.contactsReadonly, GOOGLE_SCOPE.contactsWrite],
    [GOOGLE_SCOPE.tasksReadonly, GOOGLE_SCOPE.tasksWrite],
    [GOOGLE_SCOPE.contactsWrite, GOOGLE_SCOPE.contactsOtherReadonly],
    [GOOGLE_SCOPE.driveReadonly, GOOGLE_SCOPE.driveFile],
    [GOOGLE_SCOPE.gmailModify, GOOGLE_SCOPE.gmailSend],
    [GOOGLE_SCOPE.calendarEventsReadonly, GOOGLE_SCOPE.calendarEventsWrite],
    [GOOGLE_SCOPE.calendarEventsWrite, GOOGLE_SCOPE.calendarListReadonly],
    [GOOGLE_SCOPE.webmastersReadonly, GOOGLE_SCOPE.webmasters],
    [GOOGLE_SCOPE.webmasters, GOOGLE_SCOPE.analyticsReadonly],
  ])("does not invent coverage from %s to %s", (granted, required) => {
    expect(hasGoogleGrantedScope([granted], required)).toBe(false);
  });

  it("accepts an exact scope and rejects an unrelated missing scope", () => {
    expect(
      hasGoogleGrantedScope(
        [GOOGLE_SCOPE.webmastersReadonly],
        GOOGLE_SCOPE.webmastersReadonly,
      ),
    ).toBe(true);
    expect(
      hasGoogleGrantedScope(
        [GOOGLE_SCOPE.webmastersReadonly],
        GOOGLE_SCOPE.analyticsReadonly,
      ),
    ).toBe(false);
  });
});
