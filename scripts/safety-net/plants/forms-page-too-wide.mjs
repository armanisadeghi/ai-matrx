// A layout fault: the public form's page is forced 600 px wide, so at 390 px it scrolls sideways. F01 must go RED.
export default {
  id: "forms-page-too-wide",
  check: "forms.walk-public-form",
  items: ["F01"],
  description: "a style forcing min-width 600px on the public form's page in the test browser",
  mode: "intercept",
  rules: [],
  css: "body{min-width:600px !important}",
};
