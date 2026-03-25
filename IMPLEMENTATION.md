# Implementation Plan (MWE)

## Completed in this starter implementation
1. Backend server and static hosting.
2. GIF upload endpoint with validation.
3. Metadata persistence and expiration fields.
4. Viewer URL generation and QR image endpoint.
5. Creator page with upload form and QR result panel.
6. Marker page rendering HOLO_MARKER_V1 QR marker.
7. Viewer page with camera flow and marker detection.
8. Overlay anchoring with smoothing.
9. Automatic fallback mode when camera or marker detection is unavailable.

## How the flow works
1. Creator uploads GIF and optional text on home page.
2. Server stores GIF and metadata, returns item id + viewer URL.
3. Creator shares generated QR.
4. Scanner opens viewer URL.
5. Viewer requests camera and looks for marker QR with value HOLO_MARKER_V1.
6. On marker found, hologram card positions above marker.
7. On failure/unsupported, fallback panel shows non-camera hologram.

## Immediate next tasks
1. Add request rate limiting middleware.
2. Add scan analytics endpoint separate from metadata fetch.
3. Improve in-app browser detection and show Open in Safari/Chrome hint only when needed.
4. Add Playwright smoke tests for upload and viewer fallback.
5. Move storage to managed provider for production.

## Test checklist
1. Upload valid GIF under 8 MB.
2. Verify QR image appears and URL copies.
3. Open viewer URL and allow camera.
4. Show marker from /marker on a second screen and confirm overlay follows marker.
5. Deny camera permission and confirm fallback mode appears.
