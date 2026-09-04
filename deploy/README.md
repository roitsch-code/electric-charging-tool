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

## Variante: MITBENUTZEN eines bestehenden Servers (empfohlen, ~0 € extra)

Ladeplanner läuft neben einem bestehenden Stack (z. B. BrewLog). Kein zweites
Caddy — der vorhandene Caddy routet eine Subdomain auf den App-Container, der
sich in dessen Docker-Netz hängt.

```bash
# auf dem bestehenden Server
git clone -b claude/new-project-kickoff-69wgyp \
  https://github.com/roitsch-code/electric-charging-tool.git /opt/ladeplanner
cd /opt/ladeplanner && cp .env.example .env && nano .env
#   DATABASE_URL, CHARGER_SOURCE=postgis, TOMTOM_API_KEY, NTFY_TOPIC, CRON_SECRET
#   (DOMAIN/ACME_EMAIL werden hier NICHT gebraucht — Caddy läuft schon)

# Netzname des bestehenden Stacks prüfen (Default brewlog_default):
docker network ls | grep -E "brewlog|default"
#   weicht er ab -> in .env:  SHARED_NETWORK=<name>

docker compose -f docker-compose.cohost.yml up -d --build
```

Dann im **bestehenden Caddyfile** (z. B. `/opt/brewlog/Caddyfile`) einen Block
ergänzen und Caddy neu laden:
```
ladeplanner.deine-domain.de {
    reverse_proxy ladeplanner-app:3000
}
```
```bash
cd /opt/brewlog && docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```
DNS: `ladeplanner.deine-domain.de` → dieselbe Server-IP. Fertig — Caddy holt
das TLS-Zertifikat automatisch.

**Update-Deploy:** `cd /opt/ladeplanner && git pull && docker compose -f docker-compose.cohost.yml up -d --build`

## Ressourcen
App-Image ~200–300 MB, Container-RAM < 512 MB. Eine CX22 trägt das locker;
Ladeplanner kann auch neben einem bestehenden Stack laufen (dann Caddy nur
einmal betreiben und beide Domains dort routen).
