import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({path:'.env.local'});
const c=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SECRET_KEY!);
const meeting='58a80682-3d15-4be1-90f4-86106b2801cb';
async function main(){const {data,error}=await c.schema('communication').from('meet_participants').select('id,identity,display_name,role,admission_state,is_agent,knocked_at,joined_at,left_at').eq('meeting_id',meeting).order('knocked_at'); if(error)throw error; console.log(JSON.stringify(data,null,2));}
main().catch(e=>{console.error(e);process.exit(1)});
