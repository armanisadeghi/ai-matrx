// drillstd_green's own built-in plant: the organization lane's narrowing removed -> A goes RED.
export default { id: "drill-one-door-nolane", check: "drill.sql-one-door", items: ["R05"], description: "the drill door's organization lane narrowing removed (in the suite's rolled-back transaction)", mode: "vars", vars: { plant: "nolane" } };
