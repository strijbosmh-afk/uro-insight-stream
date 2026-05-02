import { mockCongresses } from '../src/data/mock/congresses';
import { mockSessions } from '../src/data/mock/sessions';
import { mockAbstracts } from '../src/data/mock/abstracts';
import { mockSummaries } from '../src/data/mock/summaries';

function esc(s: unknown){ if(s===null||s===undefined) return 'NULL'; return "'"+String(s).replaceAll("'", "''")+"'"; }
function arr(a: unknown[]){ return "ARRAY[" + (a||[]).map(esc).join(',') + "]::text[]"; }
function jsonb(v: unknown){ return "'"+JSON.stringify(v).replaceAll("'", "''")+"'::jsonb"; }

const out: string[] = [];
out.push("-- congresses");
for (const c of mockCongresses) {
  out.push(`INSERT INTO public.congresses (id,name,short_code,city,country,start_date,end_date,status,primary_hashtags,seeded_from_mock) VALUES (${esc(c.id)},${esc(c.name)},${esc(c.shortCode)},${esc(c.city)},${esc(c.country)},${esc(c.startDate)},${esc(c.endDate)},${esc(c.status)},${arr(c.primaryHashtags)},true) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,short_code=EXCLUDED.short_code,city=EXCLUDED.city,country=EXCLUDED.country,start_date=EXCLUDED.start_date,end_date=EXCLUDED.end_date,status=EXCLUDED.status,primary_hashtags=EXCLUDED.primary_hashtags;`);
}
out.push("\n-- sessions");
for (const s of mockSessions) {
  out.push(`INSERT INTO public.sessions (id,congress_id,title,track,room,start_time,end_time,chairs,abstract_ids,seeded_from_mock) VALUES (${esc(s.id)},${esc(s.congressId)},${esc(s.title)},${esc(s.track)},${esc(s.room)},${esc(s.startTime)},${esc(s.endTime)},${arr(s.chairs)},${arr(s.abstractIds)},true) ON CONFLICT (id) DO NOTHING;`);
}
out.push("\n-- abstracts");
for (const a of mockAbstracts) {
  out.push(`INSERT INTO public.abstracts (id,session_id,title,authors,institution,abstract_number,seeded_from_mock) VALUES (${esc(a.id)},${esc(a.sessionId)},${esc(a.title)},${arr(a.authors)},${esc(a.institution)},${esc(a.abstractNumber)},true) ON CONFLICT (id) DO NOTHING;`);
}
out.push("\n-- summaries");
for (const s of mockSummaries) {
  out.push(`INSERT INTO public.summaries (id,target_type,target_id,bullet_points,key_quotes,sentiment,controversies,takeaways,tweet_count,generated_at,model_used,seeded_from_mock) VALUES (${esc(s.id)},${esc(s.targetType)},${esc(s.targetId)},${arr(s.bulletPoints)},${jsonb(s.keyQuotes)},${esc(s.sentiment)},${arr(s.controversies)},${arr(s.takeaways)},${s.tweetCount},${esc(s.generatedAt)},${esc(s.modelUsed)},true) ON CONFLICT (id) DO NOTHING;`);
}
console.log(out.join("\n"));
