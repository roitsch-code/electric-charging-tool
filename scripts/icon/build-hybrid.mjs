// Hybrid-App-Icon bauen: FLUX-Textur (organische Wolken) über exaktem
// Marken-Verlauf (Pink #FF86B9 -> Coral #FF7E5A), knallig, mit zentriertem
// Vektor-Blitz. Reproduzierbar, rein per sharp (kein Chromium).
//
// Warum so: FLUX trifft keine exakten Markenfarben (driftet in Orange/Violett/
// Blau), liefert aber schöne organische Helligkeits-Struktur. Deshalb nutzen wir
// von FLUX NUR die entsättigte, stark geblurrte Luminanz als Soft-Light-Ebene
// über einem exakten Pink->Coral-Verlauf. So bleibt die Palette markentreu.
//
// Eingabe:  scripts/icon/flux-bg.png  (approvte FLUX-Textur; FLUX ist nicht
//           deterministisch, daher als Datei eingecheckt. Neue Textur erzeugen:
//           BFL_API_KEY=… node scripts/icon/flux.mjs "<prompt>" scripts/icon/flux-bg.png)
// Ausgabe:  scripts/icon/icon-master.png (1024, Referenz)
//           src/app/apple-icon.png (180)  – iPhone-Homescreen
//           public/icon-192.png, public/icon-512.png – PWA/Manifest
//           src/app/icon.svg – Favicon (Vektor, gleiche Optik)
//
// Aufruf (aus dem Repo-Root):  node scripts/icon/build-hybrid.mjs
import sharp from "sharp";
import { writeFileSync } from "node:fs";

const W = 1024;
const BRIGHTNESS = 0.95; // größer = heller/knalliger
const SATURATION = 1.26; // größer = kräftigere Farben
const TEXTURE = { blur: 55, gain: 0.42, bias: 74 }; // dezente FLUX-Wolken (wenig Entsättigung)

// Exakter Marken-Verlauf (110deg Pink->Coral) + heller Zentralglow (Backlight).
const baseSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="g" x1="8%" y1="80%" x2="92%" y2="20%">
      <stop offset="0%" stop-color="#FF86B9"/><stop offset="100%" stop-color="#FF7E5A"/>
    </linearGradient>
    <radialGradient id="c" cx="50%" cy="48%" r="60%">
      <stop offset="0%" stop-color="#FFE1EC" stop-opacity="0.6"/>
      <stop offset="55%" stop-color="#FFD0DA" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#FFD0DA" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#g)"/>
  <rect width="512" height="512" fill="url(#c)"/>
</svg>`;

// Zentrierter Blitz (Bounding-Box exakt mittig, kompakte Höhe ~334) + heller
// Halo, damit der dunkle Blitz auf sattem Grund abhebt.
const BOLT = "M296 89 L193 264 L258 264 L216 423 L319 248 L254 248 Z";
const boltSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><filter id="h" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="22"/></filter></defs>
  <path d="${BOLT}" fill="#FFF4EE" opacity="0.5" filter="url(#h)"/>
  <path d="${BOLT}" fill="#160a0e" stroke="#160a0e" stroke-width="10" stroke-linejoin="round"/>
</svg>`;

// Favicon: gleiche Optik als reiner Vektor (crisp bei 16–32 px, ohne FLUX-Textur).
const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="g" x1="8%" y1="80%" x2="92%" y2="20%">
      <stop offset="0%" stop-color="#FF86B9"/><stop offset="100%" stop-color="#FF7E5A"/>
    </linearGradient>
    <radialGradient id="c" cx="50%" cy="48%" r="60%">
      <stop offset="0%" stop-color="#FFE1EC" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#FFD0DA" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect x="-8" y="-8" width="528" height="528" fill="url(#g)"/>
  <rect x="-8" y="-8" width="528" height="528" fill="url(#c)"/>
  <path d="${BOLT}" fill="#160a0e" stroke="#160a0e" stroke-width="10" stroke-linejoin="round"/>
</svg>`;

const base = await sharp(Buffer.from(baseSvg)).resize(W, W).png().toBuffer();
const bolt = await sharp(Buffer.from(boltSvg)).resize(W, W).png().toBuffer();
// FLUX-Luminanz: entsättigen, stark blurren, Kontrast gegen Mittelgrau stauchen
// (nur weiche Wolken, kaum Entsättigung des Verlaufs).
const fluxGray = await sharp("scripts/icon/flux-bg.png")
  .resize(W, W).greyscale().blur(TEXTURE.blur).linear(TEXTURE.gain, TEXTURE.bias)
  .toColourspace("srgb").toBuffer();

const graded = await sharp(base).composite([{ input: fluxGray, blend: "soft-light" }]).toBuffer();
const punchy = await sharp(graded).modulate({ brightness: BRIGHTNESS, saturation: SATURATION }).toBuffer();
const master = await sharp(punchy).composite([{ input: bolt }]).png().toBuffer();

writeFileSync("scripts/icon/icon-master.png", master);
for (const [out, size] of [
  ["src/app/apple-icon.png", 180],
  ["public/icon-192.png", 192],
  ["public/icon-512.png", 512],
]) {
  await sharp(master).resize(size, size, { kernel: "lanczos3" }).png({ compressionLevel: 9 }).toFile(out);
  console.log("ok", out, size);
}
writeFileSync("src/app/icon.svg", faviconSvg);
console.log("ok src/app/icon.svg (Favicon)");
console.log("Fertig.");
