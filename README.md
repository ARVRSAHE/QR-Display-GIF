# QR Display GIF - MWE

Prototype app for:
- Uploading a GIF and optional top text.
- Generating a QR code for a viewer URL.
- Opening viewer via QR where browser camera detects marker and displays hovering hologram-style GIF overlay.
- Falling back automatically when camera/marker mode is unavailable.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start app:

```bash
npm run dev
```

3. Open in browser:

- http://localhost:3000 (or the PORT value from your environment, e.g. 9000)

## Routes
- `/` creator page (upload + QR)
- `/v/:id` viewer page
- `/marker` marker page (`HOLO_MARKER_V1`)
- `/api/upload` upload endpoint
- `/api/item/:id` fetch item metadata
- `/api/qr/:id` QR image endpoint

## Notes
- Camera requires HTTPS or localhost.
- For marker mode, keep `/marker` open on another screen or print it.
- Uploads and metadata expire after 30 days.

## Persistence modes
- Default mode: local JSON + local files.
- Durable mode: `PERSISTENCE_MODE=supabase` (Supabase Postgres + Storage).

## Production env validation
On startup in production (`NODE_ENV=production`), the server fails fast if these are invalid:
- `PUBLIC_BASE_URL` missing or not `https://...`
- `JWT_SECRET` missing or still default
- `ADMIN_USERNAME` invalid or still `admin`
- `ADMIN_PASSWORD` missing, too short, or still default
- Supabase mode without required Supabase credentials

## Supabase setup (exact steps)
1. Create a Supabase project.
2. Open SQL Editor and run [supabase/schema.sql](supabase/schema.sql).
3. Go to Storage and create bucket `gifs`.
4. Set bucket access:
- Simple option: make `gifs` public (matches current `getPublicUrl` behavior).
5. Copy these values from Supabase project settings:
- Project URL -> `SUPABASE_URL`
- Service role key -> `SUPABASE_SERVICE_ROLE_KEY`

## One-time migration from local files to Supabase
1. In your local shell, set migration env vars:

```bash
SUPABASE_URL=your_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_BUCKET=gifs
```

2. Run migration:

```bash
npm run migrate:supabase
```

3. Migration imports:
- users from [data/users.json](data/users.json)
- upload metadata from [data/uploads.json](data/uploads.json)
- gif files from [uploads](uploads)

## Render free-tier deploy (exact steps)
1. Push this repository to GitHub.
2. In Render, click New -> Web Service -> connect your repo.
3. Configure service:
- Runtime: Node
- Build Command: `npm install`
- Start Command: `npm start`
- Plan: Free
4. Add environment variables in Render:
- `NODE_ENV=production`
- `PERSISTENCE_MODE=supabase`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`
- `SUPABASE_BUCKET=gifs`
- `SUPABASE_USERS_TABLE=users`
- `SUPABASE_UPLOADS_TABLE=uploads`
- `PUBLIC_BASE_URL=https://<your-render-service>.onrender.com`
- `JWT_SECRET=<strong random secret>`
- `ADMIN_USERNAME=<non-default username>`
- `ADMIN_PASSWORD=<strong password>`
5. Deploy the service.

## Post-deploy verification checklist
1. Open homepage and confirm it loads over HTTPS.
2. Log in to admin and confirm authentication works.
3. Upload one GIF and confirm viewer URL opens correctly.
4. Open gallery and verify uploaded item is listed.
5. Restart service in Render and verify same data still exists.
6. Confirm one migrated legacy viewer link still resolves.

## Rollback procedure
If a new deploy breaks production:
1. In Render, open the service -> Events/Deploys -> select last successful deploy -> Redeploy.
2. If issue is env-related, revert changed env vars and redeploy.
3. Emergency fallback:
- Set `PERSISTENCE_MODE=local`
- Redeploy
- App will run from local JSON/files (not durable on free tier).
4. Keep Supabase data intact; no destructive rollback is required.

## Free-tier behavior notes
- Render free web services can sleep when idle; first request after idle may be slow.
- Treat occasional cold starts as expected behavior on free tier.
