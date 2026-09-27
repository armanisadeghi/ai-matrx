-- chat_composer_knobs_2026_09_27.sql — the AI Matrx Composer's settings (Amendment 1, A7).
--
-- Arman, composer-spec-amendment-1.md A7: "default mode (Chat) · remember last mode (on) ·
-- compact input max height (50% of panel) · quick actions list (one row) · floating panel
-- default size (340×400). All: system default, overridable per org and per user."
--
-- Registered in the ONE register (platform.feature_knob) so the organization configuration
-- screen and the Personal configuration tab render them with no deploy. Read at run time
-- through the session snapshot (lib/scoped-config/sessionKnob.ts) — never a constant.
-- "Last mode used" is NOT a knob: it is a cookie the server reads on first paint.
--
-- Map: common-docs/projects/ai-matrx-composer/MAP.md.
-- Idempotent. ON CONFLICT refreshes presentation only; it never touches a value a human set
-- and never touches overridable_by (curated, per feature-knobs FEATURE.md).

insert into platform.feature_knob
  (feature, key, value, default_value, value_type, allowed_values, min_value, max_value, unit,
   label, description, set_by, basis, review_due, overridable_by, ui, taxonomy_node_id, propagation)
values
  ('agents.chat_composer', 'default_mode',
   '"chat"'::jsonb, '"chat"'::jsonb, 'enum', '["chat","work","advanced"]'::jsonb, null, null, null,
   'Default composer mode',
   'Which mode the chat composer opens in: Chat shows the least, Work adds tools and connections, Advanced shows everything.',
   'agent',
   'Amendment 1 A1/A7: a new person starts in Chat; an organization or a person may choose Work or Advanced instead.',
   '2026-11-11', array['organization','user'],
   jsonb_build_object('group', 'Composer', 'order', 1,
                      'help', 'Every mode is one click away in the top bar; this only picks where you start.'),
   (select id from platform.taxonomy_node where slug = 'chat' and level = 'domain'),
   'next_load'),

  ('agents.chat_composer', 'remember_last_mode',
   'true'::jsonb, 'true'::jsonb, 'boolean', null, null, null, null,
   'Remember the last mode',
   'Open the composer in the mode you used last instead of the default mode.',
   'agent',
   'Amendment 1 A1/A7: the composer returns to the last mode used; on by default.',
   '2026-11-11', array['organization','user'],
   jsonb_build_object('group', 'Composer', 'order', 2),
   (select id from platform.taxonomy_node where slug = 'chat' and level = 'domain'),
   'next_load'),

  ('agents.chat_composer', 'compact_input_max_height_pct',
   '50'::jsonb, '50'::jsonb, 'integer', null, 20, 90, 'percent',
   'Chat panel input height',
   'How tall the message box in a side chat panel may grow as you type, as a share of the panel, before it scrolls inside.',
   'agent',
   'Amendment 1 A5/A7: the reply input grows to about half the panel, then scrolls.',
   '2026-11-11', array['organization','user'],
   jsonb_build_object('group', 'Composer', 'order', 3),
   (select id from platform.taxonomy_node where slug = 'chat' and level = 'domain'),
   'next_load'),

  ('agents.chat_composer', 'quick_actions',
   jsonb_build_array(
     jsonb_build_object('label', 'Show off what you can do', 'mandateKey', 'chat.quick_showcase'),
     jsonb_build_object('label', 'I want fair news',          'mandateKey', 'chat.quick_fair_news'),
     jsonb_build_object('label', 'Help me write something',   'mandateKey', 'chat.quick_writing_partner'),
     jsonb_build_object('label', 'Make me flashcards',        'mandateKey', 'chat.quick_flashcards'),
     jsonb_build_object('label', 'Create an image',           'mandateKey', 'chat.quick_image'),
     jsonb_build_object('label', 'Conduct research',          'mandateKey', 'chat.quick_research'),
     jsonb_build_object('label', 'Audio to structured plan',  'mandateKey', 'chat.quick_audio_plan'),
     jsonb_build_object('label', 'Customize chat',            'mandateKey', 'chat.cx_default')),
   jsonb_build_array(
     jsonb_build_object('label', 'Show off what you can do', 'mandateKey', 'chat.quick_showcase'),
     jsonb_build_object('label', 'I want fair news',          'mandateKey', 'chat.quick_fair_news'),
     jsonb_build_object('label', 'Help me write something',   'mandateKey', 'chat.quick_writing_partner'),
     jsonb_build_object('label', 'Make me flashcards',        'mandateKey', 'chat.quick_flashcards'),
     jsonb_build_object('label', 'Create an image',           'mandateKey', 'chat.quick_image'),
     jsonb_build_object('label', 'Conduct research',          'mandateKey', 'chat.quick_research'),
     jsonb_build_object('label', 'Audio to structured plan',  'mandateKey', 'chat.quick_audio_plan'),
     jsonb_build_object('label', 'Customize chat',            'mandateKey', 'chat.cx_default')),
   'json', null, null, null, null,
   'Quick actions',
   'The one-click starters under the new-chat composer. Each is a label and the agent job it opens.',
   'agent',
   'Amendment 1 A4/A7: one scrolling row of eight, copy as data per organization and per person.',
   '2026-11-11', array['organization','user'],
   jsonb_build_object('group', 'Composer', 'order', 4),
   (select id from platform.taxonomy_node where slug = 'chat' and level = 'domain'),
   'next_load'),

  ('agents.chat_composer', 'floating_panel_size',
   jsonb_build_object('width', 340, 'height', 400),
   jsonb_build_object('width', 340, 'height', 400),
   'json', null, null, null, null,
   'Floating chat size',
   'The size a popped-out chat panel opens at over a canvas, in pixels.',
   'agent',
   'Amendment 1 A5/A7: the floating panel is about 340 by 400.',
   '2026-11-11', array['organization','user'],
   jsonb_build_object('group', 'Composer', 'order', 5),
   (select id from platform.taxonomy_node where slug = 'chat' and level = 'domain'),
   'next_load')
on conflict (feature, key) do update
  set label = excluded.label,
      description = excluded.description,
      ui = excluded.ui,
      taxonomy_node_id = excluded.taxonomy_node_id,
      propagation = excluded.propagation,
      updated_at = now();
