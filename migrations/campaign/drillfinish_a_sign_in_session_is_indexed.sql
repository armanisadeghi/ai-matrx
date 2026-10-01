-- applied directly 2026-09-30 by the owner (autocommit)
create index concurrently if not exists user_request_jwt_session_idx
  on chat.user_request ((metadata -> 'jwt_claims' ->> 'session_id'), created_at)
  where (metadata -> 'jwt_claims' ->> 'session_id') is not null;
