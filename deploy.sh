#!/usr/bin/env bash
# Auto-Deploy für den Co-Host-Stack. Wird von GitHub Actions per SSH aufgerufen
# (in ~/.ssh/authorized_keys als Forced-Command hinterlegt → der Deploy-Key kann
# NICHTS außer dieses Skript ausführen). Holt main und baut den Stack neu.
set -euo pipefail
cd /opt/ladeplanner
git pull --ff-only origin main
docker compose -f docker-compose.cohost.yml up -d --build
echo "Deploy fertig auf $(git rev-parse --short HEAD)"
