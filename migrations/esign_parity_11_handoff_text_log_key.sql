-- e-sign parity §4 step 2 (A-R4): platform.device_handoff_text stamps each text it sends
-- ({at, ip, last4}) under metadata.texts so the per-IP daily limit can be counted. That is system
-- state written only by the SECURITY DEFINER door, never user content (DD-060).
insert into platform.metadata_reserved_keys (table_token, key, reason)
values ('device_handoff', 'texts', 'System state: platform.device_handoff_text stamps each phone-handoff text {at, ip, last4} so the per-IP daily limit (esign.signature.handoff_texts_per_ip_per_day) can be counted; written only by that door.'),
       ('esign_envelope_signer', 'recipient_key', 'System state: esign.materialize_draft stamps the draft recipient key a signer row came from, so the access-code hash and the draft can be matched to the row; written only by that door.')
on conflict do nothing;
