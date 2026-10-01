// SAFETY-NET-B · C06. The press's platform-value step silently skips data_tables/older_tables_moved, so an organization
// made after the press would be born on the older side. The chain's C06 must go RED: "the platform value
// data_tables/older_tables_moved is not true". In-transaction: rolled back with the suite.
export default {
  id: "b-births-stay-older",
  check: "cutover.switch-chain",
  items: ["C06"],
  description: "platform.feature_knob_set ignores data_tables/older_tables_moved (every other value is set as asked)",
  mode: "in-transaction",
  apply: `alter function platform.feature_knob_set(text, text, jsonb) rename to feature_knob_set__sn_real;
create function platform.feature_knob_set(p_feature text, p_key text, p_value jsonb) returns jsonb language plpgsql set search_path to 'pg_catalog'
  as $$ begin
    if p_feature = 'data_tables' and p_key = 'older_tables_moved' then return '{}'::jsonb; end if;
    return platform.feature_knob_set__sn_real(p_feature, p_key, p_value);
  end $$;`,
};
