# Operator censuses — NOT product suites, and the seat ratchet does not count them

A file in here measures the store from the OPERATOR's side: it calls helpers that
`platform.client_callable_door` declares server-only, so it cannot run as `authenticated` and
there is no defect in that. `pnpm check:store-doors-decide` is in the same lane.

A file in here is NOT excused from anything — it is a different KIND of file. If what you are
writing asserts something a signed-in person can do, it is a campaign suite, it belongs in
`scripts/campaign-tests/`, and it takes the seat (`scripts/campaign-tests/doorfix_green.sql`
PART 0 is the worked example). Moving a product suite in here to dodge the ratchet is the
excuse list that guard exists to prevent, and a reviewer reads the file, not the directory.

Every file here states its server-only reason on its first line.
