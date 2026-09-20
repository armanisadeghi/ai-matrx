-- chair-step: an UPDATE of one row of platform.feature_knob. The allow-list admits INSERT
--   into a registry table and no UPDATE of one, and rightly - an UPDATE rewrites a row that is
--   already there. This rewrites exactly one: it gives `custom/member_default_level` the
--   organization rung it shipped without, so an organization can set the level its own members
--   get by default. Nothing else in the database is touched, the knob's VALUE is unchanged
--   (shipped default stays `viewer`), and the inverse puts the row back as it was.
--
-- LEVEL-FIX - A DEFAULT NOBODY CAN CHANGE IS NOT A DEFAULT.
--
-- `custom/member_default_level` shipped `overridable_by = {}` and no taxonomy node, which made it
-- a platform constant: the knob `custom.share_access` quotes to a person in the Access tab, the
-- knob `iam.member_default_level` resolves, and the knob the access kernel now obeys - and no
-- organization on the platform could set it. This gives it the organization rung and the taxonomy
-- node `custom/member_default_visibility` already sits under, which on the universal settings
-- platform IS its registration on the organization's settings screen (`platform.knob_index`
-- builds itself over `platform.feature_knob`), so this adds no served code and no React.

set local statement_timeout = '60s';
set local lock_timeout = '20s';
set local idle_in_transaction_session_timeout = '60s';

update platform.feature_knob k
   set overridable_by   = array['organization']::text[],
       value_type       = 'enum',
       allowed_values   = '["viewer","commenter","editor","admin","none"]'::jsonb,
       taxonomy_node_id = coalesce(
         k.taxonomy_node_id,
         (select k2.taxonomy_node_id from platform.feature_knob k2
           where k2.feature = 'custom' and k2.key = 'member_default_visibility')),
       label            = 'What membership alone confers',
       description      = 'How much a plain member of this organization may do with a record '
         'nobody has shared with them. "Viewer" (the shipped default) lets them read it; '
         '"Commenter" lets them comment; "Editor" lets them change it; "Admin" lets them share '
         'it too; "None" means membership shows them nothing and every record needs a share of '
         'its own. Owners and administrators of the organization are not affected. Anything you '
         'share with somebody directly overrides this for that person and that record - share '
         'at Viewer and they can only view, whatever this says. A single table can set its own '
         'answer, and a table with a restricted field always confers nothing.'
 where k.feature = 'custom' and k.key = 'member_default_level';
