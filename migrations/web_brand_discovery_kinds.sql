-- Expand confirmed brand truth to preserve the specific kinds already emitted
-- by homepage discovery instead of forcing them through the generic "other" kind.

alter table web.brand_asset
  drop constraint if exists brand_asset_kind_check;

alter table web.brand_asset
  add constraint brand_asset_kind_check check (kind in (
    'logo','logo_dark','favicon','wordmark','hero_image','og_image',
    'twitter_image','image','video','color','font','document','other'
  ));

alter table web.business_fact
  drop constraint if exists business_fact_kind_check;

alter table web.business_fact
  add constraint business_fact_kind_check check (kind in (
    'phone','fax','email','address','hours','tagline','legal_name','title',
    'description','site_name','social_profile','service_area','registration','other'
  ));
