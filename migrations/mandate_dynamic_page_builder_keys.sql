-- The content-plan P6 builder fleet is intentionally keyed by the page type.
-- Page types are business nouns, so a valid type such as `service` must not be
-- rejected by the generic mandate-role naming guard. Keep every other naming
-- rule intact and scope the exception to the dynamic P6 builder namespace.

set local lock_timeout = '8s';

alter table agent.mandate
  drop constraint if exists mandate_feature_owned_name_check;

alter table agent.mandate
  add constraint mandate_feature_owned_name_check
  check (
    mandate_key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$'
    and mandate_key !~ '(^|[._])internal([._]|$)'
    and split_part(mandate_key, '.', 1) <> all (
      array[
        'system', 'platform', 'core', 'shared', 'common', 'misc',
        'miscellaneous', 'generic', 'general', 'utility', 'utilities',
        'helper', 'helpers', 'default', 'builtin', 'custom', 'temp',
        'temporary', 'test', 'testing', 'demo', 'sample', 'other', 'unknown'
      ]
    )
    and (
      mandate_key ~ '^content_plan\.p6_build\.[a-z][a-z0-9_]*$'
      or (
        mandate_key !~ '(^|\.)(agent|assistant|bot|model|worker|runner|handler|processor|manager|service|task|job|helper)(\.|$)'
        and mandate_key !~ '(^|\.)[a-z0-9_]*_(agent|assistant|bot|model|worker|runner|handler|processor|manager|service|task|job|helper)(\.|$)'
      )
    )
    and label !~* '(^|[^a-z])internal([^a-z]|$)'
  );
