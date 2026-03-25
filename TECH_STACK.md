# Tech Stack (MWE)

## Stack Summary
- Frontend: Vanilla HTML/CSS/JS (served by Express)
- Backend/API: Node.js + Express
- Upload handling: multer
- QR generation: qrcode
- Marker tracking: BarcodeDetector API (QR marker)
- Data persistence: local JSON store (prototype)
- File storage: local uploads folder (prototype)

## Why This Stack For MWE
- Fastest path to a working prototype in one repo.
- No heavy framework overhead for first iteration.
- Easy to migrate later to Next.js + managed storage.

## Marker Strategy
- Marker value: HOLO_MARKER_V1
- Marker page renders a QR with this value.
- Viewer camera detects this marker and anchors GIF overlay to marker bounding box.

## Compatibility Strategy
- Tier A: camera + marker overlay (BarcodeDetector supported)
- Tier B: non-camera hologram fallback mode
- Tier C: plain GIF view behavior within fallback panel

## Security Baseline
- GIF only upload restriction.
- 8 MB max file size.
- Overlay text sanitization.
- 30-day expiration cleanup.

## Future Upgrade Path
- Replace local JSON with Postgres.
- Replace local uploads with cloud object storage.
- Add stronger rate limiting and analytics.
