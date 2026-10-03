-- chair-step: undo chairdoors3b_b_workflow_messages_have_a_text_rate_knob_and_an_email_price.sql: deletes the two knob rows workflows/texts_per_hour_per_organization and platform.external_api_prices/workflow_email_usd (the code defaults 200 and 0.0004 apply again and every send files the missing-knob error again).
-- lane: CHAIR-DOORS-3B
delete from platform.feature_knob where feature = 'workflows' and key = 'texts_per_hour_per_organization';
delete from platform.feature_knob where feature = 'platform.external_api_prices' and key = 'workflow_email_usd';
