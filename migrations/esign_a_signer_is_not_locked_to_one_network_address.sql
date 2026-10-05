-- A SIGNER IS NOT LOCKED TO ONE NETWORK ADDRESS (2026-10-04, found by the owner signing on his
-- own phone). The outsider session was pinned to the exact IP that entered the code. A dual-stack
-- connection moves between its IPv4 and IPv6 address on its own — the owner's code was entered
-- from 68.4.250.160 and his Sign press arrived from 2600:8802:… two minutes later — so the press
-- was refused as `session_ip_moved`, the page fell back to "Send me the code", and the document
-- could not be signed at all. SPEC-ESIGN §8 test 18 makes the pin a per-consumer choice
-- (`platform.outsider_consumer.ip_pinned`); for e-sign it now leans open. Every act still records
-- the caller's address on `esign.envelope_event` — the evidence keeps the IP, the door no longer
-- slams on it. Sessions issued before this keep the address they were issued with.
update platform.outsider_consumer
   set ip_pinned = false
 where consumer_key = 'esign.signer' and ip_pinned;
