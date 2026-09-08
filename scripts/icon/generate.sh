#!/usr/bin/env bash
# App-Icon aus icon.svg neu erzeugen.
#
# Design: vollflächiger Marken-Verlauf (Coral -> Pink, Ecke zu Ecke) mit hellem
# Glow-Kern in der Mitte, dahinter ein zentrierter dunkler Blitz. Kein dunkler
# Rand, keine Vignette.
#
# Warum dieser Weg: Headless-Chromium rendert Fenster < ~256 px falsch
# (Capture-Region stimmt nicht), und width/height-Attribute der SVG per sed zu
# ersetzen ist fragil (killt schon mal Verläufe). Darum: SVG UNVERÄNDERT
# einbetten, Größe rein per CSS setzen (viewBox skaliert den Inhalt inkl. Blur),
# EIN scharfes 1024er-Master rendern und mit sharp (Lanczos) herunterrechnen.
#
# Erzeugt:
#   src/app/apple-icon.png   180x180  (iPhone-Homescreen, Apple-Touch-Icon)
#   src/app/icon.svg         (Favicon, skalierbar — = Quelle)
#   public/icon-192.png      192x192  (PWA/Android, Manifest)
#   public/icon-512.png      512x512  (PWA/Android, Manifest, Splash)
#
# Voraussetzungen: Node, Chromium unter /opt/pw-browsers/chromium (Session-Umgebung).
# sharp wird bei Bedarf ohne Projekt-Dependency installiert (npm i sharp --no-save).
set -euo pipefail
cd "$(dirname "$0")"
ROOT="$(cd ../.. && pwd)"
CHROME="${CHROME:-/opt/pw-browsers/chromium}"

# 1) 1024er-Master rendern (SVG unverändert, Größe per CSS)
cat > _m.html <<HTML
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#FF7E5A}svg{display:block;width:1024px;height:1024px}</style>
</head><body>
$(cat icon.svg)
</body></html>
HTML
"$CHROME" --headless=new --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1024,1024 \
  --screenshot="icon-1024.png" "file://$PWD/_m.html"
rm -f _m.html

# 2) Master herunterrechnen (flatten: falls am Rand transparent, mit Coral füllen)
node -e "
const sharp = require('sharp');
const src = 'icon-1024.png';
const jobs = [
  ['$ROOT/src/app/apple-icon.png', 180],
  ['$ROOT/public/icon-192.png', 192],
  ['$ROOT/public/icon-512.png', 512],
];
(async () => {
  for (const [out, size] of jobs) {
    await sharp(src).resize(size, size, { kernel: 'lanczos3' })
      .flatten({ background: '#FF7E5A' })
      .png({ compressionLevel: 9 }).toFile(out);
    console.log('ok', out, size);
  }
})();
"

# 3) Favicon = Quelle
cp icon.svg "$ROOT/src/app/icon.svg"
echo "Fertig. Icons neu erzeugt."
