#!/usr/bin/env bash
# App-Icon aus icon.svg neu erzeugen.
#
# Warum dieser Weg: Headless-Chromium rendert Fenster < ~256 px falsch
# (Capture-Region stimmt nicht). Darum EIN scharfes 1024er-Master rendern und
# mit sharp (Lanczos) auf die Zielgrößen herunterrechnen — beste Qualität.
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

# 1) 1024er-Master rendern (SVG mit fester Pixelgröße, viewBox skaliert den Inhalt)
cat > wrap.html <<HTML
<!doctype html><html><head><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:#070709}svg{display:block}</style>
</head><body>
$(sed '1s#<svg #<svg width="1024" height="1024" #' icon.svg)
</body></html>
HTML
"$CHROME" --headless=new --no-sandbox --hide-scrollbars \
  --force-device-scale-factor=1 --window-size=1024,1024 \
  --default-background-color=00000000 \
  --screenshot="icon-1024.png" "file://$PWD/wrap.html"
rm -f wrap.html

# 2) Master herunterrechnen
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
      .png({ compressionLevel: 9 }).toFile(out);
    console.log('ok', out, size);
  }
})();
"

# 3) Favicon = Quelle
cp icon.svg "$ROOT/src/app/icon.svg"
echo "Fertig. Icons neu erzeugt."
