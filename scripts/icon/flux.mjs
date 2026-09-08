// FLUX-Aufruf via Black Forest Labs API. Key aus $BFL_API_KEY.
// Nutzung: node flux.mjs "<prompt>" <out.png> [breite] [hoehe]
const KEY = process.env.BFL_API_KEY;
if (!KEY) { console.error('BFL_API_KEY fehlt'); process.exit(1); }
const [,, prompt, out, w='1024', h='1024'] = process.argv;
const BASE = 'https://api.bfl.ai';
const MODEL = process.env.FLUX_MODEL || 'flux-pro-1.1';

const sleep = ms => new Promise(r => setTimeout(r, ms));

const post = await fetch(`${BASE}/v1/${MODEL}`, {
  method: 'POST',
  headers: { 'x-key': KEY, 'Content-Type': 'application/json', accept: 'application/json' },
  body: JSON.stringify({
    prompt, width: +w, height: +h, output_format: 'png',
    prompt_upsampling: false, safety_tolerance: 2,
  }),
});
const created = await post.json();
if (!post.ok) { console.error('POST-Fehler', post.status, JSON.stringify(created)); process.exit(1); }
console.error('Task', created.id, '→ polling…');
const pollUrl = created.polling_url || `${BASE}/v1/get_result?id=${created.id}`;

let sample;
for (let i = 0; i < 60; i++) {
  await sleep(1500);
  const r = await fetch(pollUrl, { headers: { 'x-key': KEY, accept: 'application/json' } });
  const j = await r.json();
  if (j.status === 'Ready') { sample = j.result.sample; break; }
  if (['Error','Content Moderated','Request Moderated','Task not found'].includes(j.status)) {
    console.error('Abbruch:', j.status, JSON.stringify(j.result||{})); process.exit(1);
  }
  process.stderr.write('.');
}
if (!sample) { console.error('\nTimeout'); process.exit(1); }
const img = await fetch(sample);
const buf = Buffer.from(await img.arrayBuffer());
const fs = await import('node:fs');
fs.writeFileSync(out, buf);
console.error(`\ngespeichert: ${out} (${buf.length} Bytes)`);
