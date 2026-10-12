// One-off importer for point assets (terminals, fields, plants) from Global Energy Monitor map files.
// Reads one byte window, keeps point features and the listed properties, stores them raw in og_gem_raw.
// Body: { url, layer, start, len, keep: string[], probe?: boolean, token }
import { createClient } from 'jsr:@supabase/supabase-js@2';
const HOST = 'https://publicgemdata.nyc3.digitaloceanspaces.com/';
const OVER = 14_000_000;
const MARK = new TextEncoder().encode('"type": "Feature"');
const WS = (c: number) => c === 32 || c === 10 || c === 13 || c === 9;
function findMarks(b: Uint8Array): number[] {
  const out: number[] = [], n = b.length - MARK.length - 1;
  for (let i = 0; i < n; i++) {
    if (b[i] !== 34 || b[i + 1] !== 116 || b[i + 2] !== 121) continue;
    let ok = true;
    for (let j = 3; j < MARK.length; j++) if (b[i + j] !== MARK[j]) { ok = false; break; }
    if (ok && b[i + MARK.length] !== 67) { let s = i - 1; while (s >= 0 && WS(b[s])) s--; if (s >= 0 && b[s] === 123) out.push(s); i += MARK.length; }
  }
  return out;
}
Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body.token !== '__SET_A_ONE_TIME_TOKEN_BEFORE_DEPLOYING__') return new Response('forbidden', { status: 403 });
  if (typeof body.url !== 'string' || !body.url.startsWith(HOST)) return new Response('bad url', { status: 400 });
  const start = Number(body.start) || 0, len = Number(body.len) || 6_000_000, keep: string[] = body.keep || [];
  const r = await fetch(body.url, { headers: { Range: 'bytes=' + start + '-' + (start + len + OVER - 1) } });
  if (r.status !== 206 && r.status !== 200) return new Response('fetch ' + r.status, { status: 502 });
  const total = Number((r.headers.get('content-range') || '/0').split('/')[1]);
  const b = new Uint8Array(await r.arrayBuffer()); const eof = start + b.length >= total;
  const marks = findMarks(b), dec = new TextDecoder();
  const rows: any[] = []; let seen = 0, incomplete: number | null = null, probe: any = null;
  for (let m = 0; m < marks.length; m++) {
    const s = marks[m]; if (s >= len) break;
    let e: number;
    if (m + 1 < marks.length) e = marks[m + 1];
    else if (eof) { e = b.length; while (e > s && b[e - 1] !== 93) e--; e--; }
    else { incomplete = start + s; break; }
    while (e > s && (WS(b[e - 1]) || b[e - 1] === 44)) e--;
    if (e - s > 400_000) continue; // long routes are not point assets
    let f: any; try { f = JSON.parse(dec.decode(b.subarray(s, e))); } catch (_) { incomplete = start + s; continue; }
    seen++;
    const g = f.geometry; if (!g || g.type !== 'Point') continue;
    const p = f.properties || {};
    if (body.probe) { if (!probe) { probe = {}; for (const k of Object.keys(p)) probe[k] = String(typeof p[k] === 'object' ? JSON.stringify(p[k]) : p[k]).slice(0, 50); } continue; }
    const o: Record<string, string> = {};
    for (const k of keep) { const v = p[k]; if (v !== undefined && v !== null && typeof v !== 'object' && String(v).trim() !== '') o[k] = String(v).trim().slice(0, 300); }
    rows.push({ layer: body.layer, chunk: start, lon: g.coordinates[0], lat: g.coordinates[1], p: o });
  }
  if (body.probe) return Response.json({ total, marks: marks.length, seen, incomplete, probe });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await db.from('og_gem_raw').delete().eq('layer', body.layer).eq('chunk', start);
  let err: string | null = null;
  for (let i = 0; i < rows.length; i += 500) { const { error } = await db.from('og_gem_raw').insert(rows.slice(i, i + 500)); if (error) err = error.message; }
  return Response.json({ total, start, eof, seen, saved: rows.length, incomplete, err });
});
