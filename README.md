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

## Production hardening (next)
- Add rate limiting and abuse controls.
- Move uploads to cloud object storage.
- Move metadata from JSON file to managed database.
