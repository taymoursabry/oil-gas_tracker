// Collects live vessel positions from aisstream.io for about 40 seconds and stores the latest
// position per vessel in og_vessels. Run on a schedule (every 5 minutes).
// Secrets required: AISSTREAM_API_KEY. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
import { createClient } from 'jsr:@supabase/supabase-js@2';

// Bounding boxes [[lat, lon], [lat, lon]]: the waters this map cares about most.
const BOXES = [
  [[22, 47], [31, 60]],    // Gulf and Strait of Hormuz
  [[11, 32], [32, 45]],    // Red Sea, Suez, Bab el-Mandeb
  [[30, -7], [46, 37]],    // Mediterranean
  [[40, 26], [47, 42]],    // Black Sea
  [[48, -6], [62, 30]],    // North Sea and Baltic
  [[-37, -20], [20, 20]],  // West and southern Africa
  [[-30, 30], [15, 60]],   // East Africa
  [[-6, 95], [8, 106]],    // Malacca and Singapore
  [[17, -98], [31, -80]],  // United States Gulf
];
const TANKER = (t: number) => t >= 80 && t <= 89;

Deno.serve(async () => {
  const key = Deno.env.get('AISSTREAM_API_KEY');
  if (!key) return new Response('AISSTREAM_API_KEY is not set', { status: 500 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const pos = new Map<number, Record<string, unknown>>();
  const stat = new Map<number, Record<string, unknown>>();

  await new Promise<void>((resolve) => {
    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');
    const done = () => { try { ws.close(); } catch (_) { /* already closed */ } resolve(); };
    const timer = setTimeout(done, 40_000);
    ws.onopen = () => ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: BOXES, FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }));
    ws.onerror = () => { clearTimeout(timer); done(); };
    ws.onclose = () => { clearTimeout(timer); resolve(); };
    ws.onmessage = async (ev) => {
      try {
        const text = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
        const m = JSON.parse(text);
        const mmsi = m.MetaData?.MMSI;
        if (!mmsi) return;
        if (m.MessageType === 'PositionReport') {
          const p = m.Message.PositionReport;
          pos.set(mmsi, { mmsi, name: (m.MetaData.ShipName || '').trim() || null, lat: p.Latitude, lon: p.Longitude, speed: p.Sog, course: p.Cog, nav_status: p.NavigationalStatus ?? null, updated_at: new Date().toISOString() });
        } else if (m.MessageType === 'ShipStaticData') {
          const s = m.Message.ShipStaticData;
          const d = s.Dimension || {}, e = s.Eta || {};
          const len = (d.A || 0) + (d.B || 0), beam = (d.C || 0) + (d.D || 0);
          const p2 = (n: number) => String(n).padStart(2, '0');
          stat.set(mmsi, { mmsi, name: (s.Name || '').trim() || null, ship_type: s.Type, destination: (s.Destination || '').trim() || null,
            imo: s.ImoNumber || null, callsign: (s.CallSign || '').trim() || null, length_m: len || null, beam_m: beam || null,
            draught_m: s.MaximumStaticDraught || null, eta: e.Month && e.Day ? p2(e.Month) + '-' + p2(e.Day) + ' ' + p2(e.Hour || 0) + ':' + p2(e.Minute || 0) : null });
        }
      } catch (_) { /* skip malformed message */ }
    };
  });

  // Static data first, so ship type is known. Then positions.
  const statics = [...stat.values()].filter((s) => TANKER(s.ship_type as number));
  const chunks = <T>(a: T[], n = 500) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
  for (const c of chunks(statics)) await db.from('og_vessels').upsert(c, { onConflict: 'mmsi' });
  // Only keep positions for vessels already known to be tankers.
  const ids = [...pos.keys()];
  const known = new Set<number>();
  for (const c of chunks(ids, 300)) {
    const { data } = await db.from('og_vessels').select('mmsi').in('mmsi', c);
    (data || []).forEach((r: { mmsi: number }) => known.add(Number(r.mmsi)));
  }
  const positions = [...pos.values()].filter((p) => known.has(p.mmsi as number));
  for (const c of chunks(positions)) await db.from('og_vessels').upsert(c, { onConflict: 'mmsi' });
  // Drop vessels not heard from in three days.
  await db.from('og_vessels').delete().lt('updated_at', new Date(Date.now() - 3 * 864e5).toISOString());

  return new Response(JSON.stringify({ heard: pos.size, tankers_identified: statics.length, positions_saved: positions.length }), { headers: { 'Content-Type': 'application/json' } });
});
