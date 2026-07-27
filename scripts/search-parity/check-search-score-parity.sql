-- Run this against the live DB whenever features/agents/search/score.ts or
-- public.agx_search_score changes. Every row must read MATCH.
-- The TS half is guarded by features/agents/search/score.parity.test.ts
-- against the SAME fixture (__fixtures__/search-score-parity.json).
with cases(why, q, id, nm, ds, cat, tags, email, expected) as (values
 ('name exact','image','11111111-1111-1111-1111-111111111111'::uuid,'image',null,null,null::text[],null,10000),
 ('name starts-with','image','11111111-1111-1111-1111-111111111111'::uuid,'Image Prompt Generator',null,null,null::text[],null,5000),
 ('name word-boundary','image','11111111-1111-1111-1111-111111111111'::uuid,'Basic Image Generator',null,null,null::text[],null,3000),
 ('substring not word-boundary','image','11111111-1111-1111-1111-111111111111'::uuid,'Generate Images with Styles',null,null,null::text[],null,2000),
 ('description only','image','11111111-1111-1111-1111-111111111111'::uuid,'App Description Generator','Generates an image for the listing',null,null::text[],null,500),
 ('category only','vision','11111111-1111-1111-1111-111111111111'::uuid,'Helper',null,'Vision Tools',null::text[],null,300),
 ('tag only','seo','11111111-1111-1111-1111-111111111111'::uuid,'Helper',null,null,array['matrx-seo'],null,300),
 ('shared-by email','arman','11111111-1111-1111-1111-111111111111'::uuid,'Helper',null,null,null::text[],'arman@armansadeghi.com',200),
 ('id exact','11111111-1111-1111-1111-111111111111','11111111-1111-1111-1111-111111111111'::uuid,'Helper',null,null,null::text[],null,100000),
 ('no match','zzzznope','11111111-1111-1111-1111-111111111111'::uuid,'Helper','nothing',null,null::text[],null,0),
 ('multi-term all land','image gen','11111111-1111-1111-1111-111111111111'::uuid,'Picture Imagerator','gen tool',null,null::text[],null,500),
 ('multi-term one missing','image zzzznope','11111111-1111-1111-1111-111111111111'::uuid,'Basic Image Generator',null,null,null::text[],null,0)
)
select why, expected,
       public.agx_search_score(q, id, nm, ds, cat, tags, null, null, email, false) as sql_score,
       case when public.agx_search_score(q, id, nm, ds, cat, tags, null, null, email, false) = expected
            then 'MATCH' else 'DRIFT' end as parity
from cases order by 1;
