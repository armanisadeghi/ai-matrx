// The leak itself put back: the real bytes of LEAK-T10's inverse migration, inside the suite's
// transaction (rolled back). leakt10_green must go RED.
export default {
  id: "drill-leak-t10-inverse",
  check: "drill.sql-leak-t10",
  items: ["R05"],
  description: "LEAK-T10's inverse (a Home of a Table is the whole table again), executed inside the rolled-back transaction",
  mode: "in-transaction",
  apply: "\\i migrations/inverse/leakt10_a_home_of_a_table_is_not_the_whole_table_down.sql",
};
