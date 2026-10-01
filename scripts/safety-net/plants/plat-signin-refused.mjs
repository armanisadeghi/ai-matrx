// Sign-in's token call is refused for this test browser: P01 must go RED (the seat never signs in).
export default { id: "plat-signin-refused", check: "platform.walk-platform", items: ["P01"], description: "auth/v1/token answers 400 in the test browser", mode: "intercept", rules: [{ match: "/auth/v1/token", action: "status", status: 400 }] };
