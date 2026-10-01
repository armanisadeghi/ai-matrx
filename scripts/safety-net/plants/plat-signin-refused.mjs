// The app answers "nobody is signed in" to the test browser after the login form (the session check
// /api/whoami answers no email — the shape a broken sign-in has from the person's chair; the login
// itself posts server-side, so its token call cannot be cut at the browser). P01 must go RED.
export default { id: "plat-signin-refused", check: "platform.walk-platform", items: ["P01"], description: "/api/whoami answers no signed-in person in the test browser", mode: "intercept", rules: [{ match: "/api/whoami", action: "fake-ok", body: "{\"email\":null}" }] };
