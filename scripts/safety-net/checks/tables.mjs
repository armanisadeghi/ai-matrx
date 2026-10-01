// Checks for area "tables": one sub-registry per sub-lane so two lanes never edit one file.
import life from "./tables-life.mjs";
import bulk from "./tables-bulk.mjs";
import views from "./tables-views.mjs";
import trash from "./tables-trash.mjs";

export default [...life, ...bulk, ...views, ...trash];
