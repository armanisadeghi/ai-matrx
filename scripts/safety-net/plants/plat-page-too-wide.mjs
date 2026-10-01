// A layout fault: every page is forced 600 px wide, so at 390 px it scrolls sideways. P05 and P06 must go RED.
export default { id: "plat-page-too-wide", check: "platform.walk-platform", items: ["P05", "P06"], description: "a style forcing min-width 600px is added to every page in the test browser", mode: "intercept", rules: [], css: "body{min-width:600px !important}" };
