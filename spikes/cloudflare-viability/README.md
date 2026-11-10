# Cloudflare viability spike

Isolated proof of Worker request verification, D1 idempotency, and a minimal
`googleapis` compatibility probe. It does not import into the Seresta Local
runtime and is not production-ready.

## Local webhook and D1

From this directory:

```powershell
npm install
```

Create `.dev.vars` locally with synthetic values for offline testing. This file
is ignored by Git:

```text
META_WEBHOOK_VERIFY_TOKEN=local-value
META_APP_SECRET=local-value
```

Then apply only the local migration and start the Worker:

```powershell
npm run db:migrations:local
npm run dev
```

The local Worker accepts a GET subscription challenge and signed POST
notifications at `/webhook`. It stores unique message IDs in the local D1
database, not message content or contact details. All runtime checks so far use
synthetic data. Do not pass `--remote` or use production secrets.

Webhook unit tests run from the repository root:

```powershell
npx vitest run tests/cloudflare-spike
```

## Google API client compatibility probe

This only bundles and instantiates OAuth2/Calendar clients and generates an
offline authorization URL. It does not open a consent flow, exchange tokens,
refresh credentials, access a real calendar, or prove that the package is
appropriate for production:

```powershell
npm run probe:googleapis
npx wrangler dev --config wrangler.googleapis-probe.jsonc
```

## Safety and limitations

- The test Worker acknowledges webhook messages after D1 persistence; it does
  not run the conversation engine, send WhatsApp replies, or process statuses.
- The D1 schema has no production retention policy. Never use it with real
  customer messages or IDs.
- OAuth requires a separately authorized Google test account and secure,
  local-only credentials. No test credentials belong in this repository.
- Never deploy this spike remotely or use the provided Meta test token in
  automated tests. The production integration requires a reviewed security,
  privacy, retention, retry, and operational design.
