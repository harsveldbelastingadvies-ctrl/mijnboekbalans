# BoekBalans Online Zetten

Deze route gebruikt GitHub voor de code en Cloudflare voor hosting en database.

## 1. GitHub

Maak op GitHub een nieuwe repository aan, bijvoorbeeld:

```text
boekbalans
```

Daarna kan deze lokale map als eerste versie naar GitHub worden gepusht.

Na het aanmaken van de repository kun je vanuit deze projectmap draaien:

```text
scripts/setup-github-cloudflare.sh <github-repo-url>
```

Voorbeeld:

```text
scripts/setup-github-cloudflare.sh git@github.com:gebruikersnaam/boekbalans.git
```

## 2. Cloudflare

Maak in Cloudflare een D1 database aan:

```text
wrangler d1 create boekbalans
```

Cloudflare geeft daarna een `database_id`. Zet die waarde in `wrangler.jsonc`
op de plek van:

```text
00000000-0000-0000-0000-000000000000
```

Voer daarna de database-migratie uit:

```text
wrangler d1 execute boekbalans --file=drizzle/0000_create_workspace_store.sql
```

## 3. GitHub Secrets

Zet in GitHub bij de repository onder Settings > Secrets and variables > Actions:

```text
CLOUDFLARE_API_TOKEN
CLOUDFLARE_ACCOUNT_ID
```

De API token moet Workers kunnen deployen en D1 kunnen gebruiken.

## 4. Automatisch publiceren

Na iedere push naar `main` draait GitHub Actions:

```text
pnpm lint
pnpm build:worker
pnpm deploy:worker
```

De app wordt dan gepubliceerd naar Cloudflare Workers.

## 5. Domein koppelen

Koppel daarna je domein, bijvoorbeeld `boek-balans.nl`, in Cloudflare aan de
Worker-route.
