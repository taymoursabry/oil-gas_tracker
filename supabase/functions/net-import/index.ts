// One-off importer: reads a byte window of a Global Energy Monitor map file, keeps pipeline routes,
// simplifies them and stores them in og_network. Called window by window so each run stays small.
// Body: { src: 'goit' | 'ggit', start: number, len: number, probe?: boolean, token: string }
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BASE = 'https://publicgemdata.nyc3.digitaloceanspaces.com/';
const URLS: Record<string, string> = {
  goit: BASE + 'interim_maps/goit_map_2026-06.1.geojson',
  ggit: BASE + 'Historical%20maps%20%28old%20system%29/ggit/2026-03/ggit_map_2026-02-20.geojson',
};
const OVER = 14_000_000;
const MARK = new TextEncoder().encode('"type": "Feature"');
const WS = (c: number) => c === 32 || c === 10 || c === 13 || c === 9;

function findMarks(b: Uint8Array): number[] {
  const out: number[] = [], n = b.length - MARK.length - 1;
  for (let i = 0; i < n; i++) {
    if (b[i] !== 34 || b[i + 1] !== 116 || b[i + 2] !== 121) continue;
    let ok = true;
    for (let j = 3; j < MARK.length; j++) if (b[i + j] !== MARK[j]) { ok = false; break; }
    if (ok && b[i + MARK.length] !== 67) {
      let s = i - 1; while (s >= 0 && WS(b[s])) s--;
      if (s >= 0 && b[s] === 123) out.push(s);
      i += MARK.length;
    }
  }
  return out;
}
function simplify(pts: number[][], tol: number): number[][] {
  const n = pts.length; if (n < 3) return pts;
  const keep = new Uint8Array(n); keep[0] = 1; keep[n - 1] = 1;
  const stack = [0, n - 1], t2 = tol * tol;
  while (stack.length) {
    const b = stack.pop()!, a = stack.pop()!;
    const ax = pts[a][0], ay = pts[a][1], dx = pts[b][0] - ax, dy = pts[b][1] - ay, L = dx * dx + dy * dy;
    let md = -1, mi = -1;
    for (let i = a + 1; i < b; i++) {
      let t = L ? ((pts[i][0] - ax) * dx + (pts[i][1] - ay) * dy) / L : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const ex = ax + t * dx - pts[i][0], ey = ay + t * dy - pts[i][1], d = ex * ex + ey * ey;
      if (d > md) { md = d; mi = i; }
    }
    if (md > t2) { keep[mi] = 1; stack.push(a, mi, mi, b); }
  }
  const out: number[][] = []; for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i]);
  return out;
}
function km(pts: number[][]): number {
  let s = 0; const R = Math.PI / 180;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], x = (b[0] - a[0]) * R * Math.cos((a[1] + b[1]) / 2 * R), y = (b[1] - a[1]) * R;
    s += Math.sqrt(x * x + y * y) * 6371;
  }
  return s;
}
function lines(g: any, out: number[][][]) {
  if (!g) return;
  if (g.type === 'LineString') out.push(g.coordinates);
  else if (g.type === 'MultiLineString') for (const l of g.coordinates) out.push(l);
  else if (g.type === 'GeometryCollection') for (const x of g.geometries || []) lines(x, out);
}
const pick = (p: any, ...ks: string[]) => { for (const k of ks) { const v = p[k]; if (v !== undefined && v !== null && String(v).trim() !== '') return String(v).trim(); } return null; };
const ST: Record<string, string> = { operating: 'o', construction: 'c', proposed: 'p', announced: 'p', 'pre-construction': 'p', idle: 'x', mothballed: 'x' };

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  if (body.token !== '__SET_A_ONE_TIME_TOKEN_BEFORE_DEPLOYING__') return new Response('forbidden', { status: 403 });
  const url = URLS[body.src]; const start = Number(body.start) || 0, len = Number(body.len) || 6_000_000;
  if (!url) return new Response('bad src', { status: 400 });
  const r = await fetch(url, { headers: { Range: 'bytes=' + start + '-' + (start + len + OVER - 1) } });
  if (r.status !== 206 && r.status !== 200) return new Response('fetch ' + r.status, { status: 502 });
  const total = Number((r.headers.get('content-range') || '/0').split('/')[1]);
  const b = new Uint8Array(await r.arrayBuffer());
  const eof = start + b.length >= total;
  const marks = findMarks(b);
  const dec = new TextDecoder();
  const rows: any[] = []; let seen = 0, incomplete: number | null = null; const statuses: Record<string, number> = {}; let probe: any = null;
  for (let m = 0; m < marks.length; m++) {
    const s = marks[m]; if (s >= len) break;
    let e: number;
    if (m + 1 < marks.length) e = marks[m + 1];
    else if (eof) { e = b.length; while (e > s && b[e - 1] !== 93) e--; e--; }
    else { incomplete = start + s; break; }
    while (e > s && (WS(b[e - 1]) || b[e - 1] === 44)) e--;
    let f: any; try { f = JSON.parse(dec.decode(b.subarray(s, e))); } catch (_) { incomplete = start + s; continue; }
    seen++;
    const raw: number[][][] = []; lines(f.geometry, raw); if (!raw.length) continue;
    const p = f.properties || {};
    if (body.probe) { if (!probe) { probe = {}; for (const k of Object.keys(p)) probe[k] = String(typeof p[k] === 'object' ? JSON.stringify(p[k]) : p[k]).slice(0, 60); } continue; }
    const stt = (pick(p, 'status') || '').toLowerCase(); statuses[stt] = (statuses[stt] || 0) + 1;
    const st = ST[stt]; if (!st) continue;
    let L = 0; const enc: number[][] = [];
    for (const ln of raw) {
      if (!ln || ln.length < 2) continue; L += km(ln);
      const q = simplify(ln, 0.008).map((c) => [Math.round(c[0] * 100), Math.round(c[1] * 100)]);
      const a = [q[0][0], q[0][1]]; let px = q[0][0], py = q[0][1];
      for (let i = 1; i < q.length; i++) { if (q[i][0] === px && q[i][1] === py) continue; a.push(q[i][0] - px, q[i][1] - py); px = q[i][0]; py = q[i][1]; }
      if (a.length >= 4) enc.push(a);
    }
    if (!enc.length) continue;
    const bcm = pick(p, 'capacityinbcm/y', 'capacity-bcm/y', 'capacitybcm/y'), cap = pick(p, 'capacity-display', 'capacity', 'capacity-table'), un = pick(p, 'units-of-m', 'capacityunits', 'capacity-units');
    const lk = Number(pick(p, 'lengthmergedkm', 'length-merged-km', 'lengthknownkm', 'lengthestimateakm') || 0);
    rows.push({ src: body.src, chunk: start, kind: body.src === 'ggit' ? 'g' : 'l', pid: pick(p, 'project-id', 'pid', 'projectid', 'ProjectID'), name: pick(p, 'name', 'pipelinename'),
      segment: pick(p, 'unit-name', 'segmentname', 'segment-name'), fuel: pick(p, 'fuel'), status: st, status_text: stt, owner: pick(p, 'owner'), parent: pick(p, 'parent'),
      capacity_text: bcm ? bcm + ' billion cubic metres a year' : cap ? cap + (un ? ' ' + un : '') : null, start_year: pick(p, 'start-year', 'startyear1', 'startyear'),
      countries: pick(p, 'all-countries', 'areas', 'country-area1', 'countries'), length_km: Math.round((lk > 0 ? lk : L) * 10) / 10, url: pick(p, 'url', 'wiki'), enc });
  }
  if (body.probe) return Response.json({ total, bytes: b.length, marks: marks.length, seen, incomplete, probe });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  await db.from('og_network').delete().eq('src', body.src).eq('chunk', start);
  let err: string | null = null;
  for (let i = 0; i < rows.length; i += 200) { const { error } = await db.from('og_network').insert(rows.slice(i, i + 200)); if (error) err = error.message; }
  return Response.json({ total, start, eof, seen, saved: rows.length, incomplete, err, statuses });
});
