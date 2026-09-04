# Ladeplanner — Hetzner-Deployment (Runbook)

Stack: **App (Next.js standalone) + Caddy (TLS) + ofelia (Cron)** per Docker
Compose. Die **Datenbank ist extern (Neon)** — kein Postgres-Container.

## Was DU brauchst
- Eine **Hetzner-Cloud-VPS** (CX22 reicht: 2 vCPU, 4 GB) mit **Ubuntu 24.04**.
- Eine **Domain/Subdomain**, deren A/AAAA-Record auf die Server-IP zeigt.
- Die **Neon-POOLED-Connection-URL** (mit `-pooler`).
- Deinen **TomTom-Key** (+ optional Google), ein **NTFY_TOPIC**, ein
  selbstgewaehltes **CRON_SECRET**.

## Erstmaliges Setup auf dem Server
```bash
ssh root@<server-ip>

# Docker installieren
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker

# Repo holen (Branch bis zum Merge nach main)
git clone -b claude/new-project-kickoff-69wgyp \
  https://github.com/roitsch-code/electric-charging-tool.git /opt/ladeplanner
cd /opt/ladeplanner

# .env anlegen
cp .env.example .env
nano .env
```

In der `.env` mindestens setzen:
```
DATABASE_URL=postgresql://…-pooler.…neon.tech/neondb?sslmode=require
CHARGER_SOURCE=postgis
TOMTOM_API_KEY=…
NTFY_TOPIC=ladeplanner-…
CRON_SECRET=<zufälliger String>
DOMAIN=ladeplanner.deine-domain.de
ACME_EMAIL=du@example.com
```

## Starten
```bash
docker compose up -d --build
docker compose logs -f app     # Start prüfen
```
- Caddy holt automatisch ein TLS-Zertifikat für `DOMAIN`.
- Aufruf: `https://<DOMAIN>/plan?lat=53.5443&lng=9.9490&name=GINN&dwell=nacht`
  → echte DE-Ladepunkte + TomTom-Live-Belegung.

## DB-Schema/Import
Sind bereits in Neon vorhanden (über HTTPS eingespielt: Tabellen, PostGIS,
209k Ladepunkte). Ein erneuter Import ist nur bei Datenaktualisierung nötig.
Da diese Cloud-Session keinen TCP-Zugang (5432) hat, läuft der Import über den
Neon-HTTPS-Endpunkt; das Skript dafür liegt in der Sitzung (auf Wunsch
dauerhaft als `scripts/` ergänzen).

## Update-Deploy (nach Code-Änderungen)
```bash
cd /opt/ladeplanner && git pull && docker compose up -d --build
```

## Cron (ofelia)
`deploy/ofelia.ini` fährt im Container:
- `/api/cron/dispatch` jede Minute (fällige Pushes),
- `/api/cron/poll` alle 5 min (nur falls DB-Status-Poller genutzt wird).
Beide mit `Authorization: Bearer $CRON_SECRET`.

## Ressourcen
App-Image ~200–300 MB, Container-RAM < 512 MB. Eine CX22 trägt das locker;
Ladeplanner kann auch neben einem bestehenden Stack laufen (dann Caddy nur
einmal betreiben und beide Domains dort routen).
