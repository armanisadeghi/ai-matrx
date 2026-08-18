-- Repairs the canonical examples of `generated_audio` and `podcast_episode` so
-- every media reference in them RESOLVES.
--
-- WHY: both examples were seeded with a fabricated audio identity
-- (file_id 1f2e3d4c-5b6a-4798-8899-aabbccddeeff and its matching CDN URL,
-- which returns 403). A canonical example is what `/shapes/<kind>` renders as
-- the shape's showcase and what every future component change is checked
-- against, so a permanently-404ing player there reads as a broken component
-- forever. The image and video examples were already real; these two now are
-- too. Both point at a real public episode audio
-- (podcast.pc_episodes 9448a7bc-1754-4b15-90f9-041a3e98e8bd), and the podcast
-- example takes that episode's real identity (title / slug / id) so its
-- "Open episode" door goes somewhere.
--
-- The `kind_example_recompute_validation` trigger re-derives
-- `validation_status` on write — never written by hand here.

update content_ir.kind_example e
   set data = $mtx${"model": "eleven_v3", "usage": {"cost_usd": 0.02}, "file_id": "8f6a40e7-3ecc-4a17-a1ad-d73deebfbd5f", "audio_url": "https://cdn.matrxserver.com/4cf62e4e-2679-484f-b652-034e697418df/8f6a40e7-3ecc-4a17-a1ad-d73deebfbd5f?v=267a7ff0", "mime_type": "audio/mpeg", "audio_cdn_url": "https://cdn.matrxserver.com/4cf62e4e-2679-484f-b652-034e697418df/8f6a40e7-3ecc-4a17-a1ad-d73deebfbd5f?v=267a7ff0", "duration_seconds": 42.5}$mtx$::jsonb
  from content_ir.kind_definition kd
 where kd.id = e.kind_definition_id
   and kd.kind = 'generated_audio'
   and kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
   and e.is_canonical
   and e.deleted_at is null
   and e.data ->> 'file_id' is distinct from '8f6a40e7-3ecc-4a17-a1ad-d73deebfbd5f';

update content_ir.kind_example e
   set data = $mtx${"title": "Beat the Post-Meal Slump: The Science of Walking", "script": "Sarah: Owen, let me describe a scenario and you tell me if this sounds painfully familiar. It is one forty-five in the afternoon, you just finished a decent lunch, and suddenly your eyelids weigh fifty pounds.\nOwen: That is not just familiar, Sarah — that is my entire week.", "show_id": "381c8b21-400a-4414-865d-22b18cabbbc7", "speakers": [{"name": "Sarah", "voice": "af_heart", "gender": "female"}, {"name": "Owen", "voice": "am_michael", "gender": "male"}], "audio_url": "https://cdn.matrxserver.com/4cf62e4e-2679-484f-b652-034e697418df/8f6a40e7-3ecc-4a17-a1ad-d73deebfbd5f?v=267a7ff0", "episode_id": "9448a7bc-1754-4b15-90f9-041a3e98e8bd", "host_count": 2, "image_urls": ["https://cdn.matrxserver.com/4cf62e4e-2679-484f-b652-034e697418df/db22f2a2-9548-4eb7-946b-19b267bdee09?v=84f485d6"], "video_urls": ["https://cdn.matrxserver.com/4cf62e4e-2679-484f-b652-034e697418df/28805c30-3848-40eb-8f51-b7d34ea4ea15?v=d7a1a053"], "description": "How a ten-minute walk after eating restores focus — the glucose uptake and optic-flow story, with protocols you can run today.", "audio_file_id": "8f6a40e7-3ecc-4a17-a1ad-d73deebfbd5f", "episode_slug": "beat-the-post-meal-slump-the-science-of-walking-90d3b3fb", "image_file_ids": ["db22f2a2-9548-4eb7-946b-19b267bdee09"], "video_file_ids": ["28805c30-3848-40eb-8f51-b7d34ea4ea15"], "official_video_url": "https://cdn.matrxserver.com/4cf62e4e-2679-484f-b652-034e697418df/004a1057-a4f9-434a-beca-827cc9f82714?v=9e8d7c6b", "official_video_error": "", "official_video_file_id": "004a1057-a4f9-434a-beca-827cc9f82714"}$mtx$::jsonb
  from content_ir.kind_definition kd
 where kd.id = e.kind_definition_id
   and kd.kind = 'podcast_episode'
   and kd.organization_id = '39c38960-d30c-4840-b0c1-c9960de95582'
   and e.is_canonical
   and e.deleted_at is null
   and e.data ->> 'audio_file_id' is distinct from '8f6a40e7-3ecc-4a17-a1ad-d73deebfbd5f';
