// drillusage_parity_green's own plant (nolane) -> its parity/seat clauses go RED.
export default { id: "drill-usage-nolane", check: "drill.sql-usage-parity", items: ["R04"], description: "the usage definition's organization lane removed (rolled back)", mode: "vars", vars: { plant: "nolane" } };
