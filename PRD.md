# Product Requirements Document (PRD)

## Product Name
QR Camera Hologram GIF (MWE)

## Objective
Build a minimum working web product where a creator uploads a GIF and optional top text, receives a QR code, and when someone scans it, the viewer page opens in a browser, uses camera access, detects a marker, and shows the GIF as a floating hologram-style overlay.

## Problem Statement
Static QR destinations are common, but immersive visual sharing is rare. This product combines QR sharing with browser-based camera effects while keeping reliable fallback behavior for unsupported devices or denied permissions.

## Target Users
- Primary: individual creators making personal demos, event invites, or playful interactive shares.
- Secondary: small teams testing interactive marketing concepts.

## Success Criteria (MWE)
- Creator can upload a valid GIF and generate a scannable QR in under 30 seconds.
- Viewer can scan QR and open the destination URL successfully on modern mobile browsers.
- On supported devices with granted permission, marker-based camera overlay works.
- On unsupported/denied camera scenarios, app auto-falls back to non-camera viewer without breaking.

## In Scope
- GIF upload (single file).
- One-line overlay text.
- QR generation for viewer URL.
- Viewer with marker-based camera overlay.
- Automatic fallback to non-camera hologram mode.
- Basic input validation and 30-day asset expiration.

## Out of Scope (MWE)
- User accounts and auth.
- True WebXR immersive AR.
- Multi-format media (video/audio).
- Rich text styling tools.

## Functional Requirements
1. Creator Flow
- User uploads GIF file.
- User enters optional one-line text.
- System validates type/size and stores media.
- System generates unique viewer URL and QR image.

2. Viewer Flow
- Viewer opens URL from QR.
- App checks secure context and camera support.
- App asks camera permission.
- App detects marker in camera feed.
- App overlays floating GIF + text aligned to marker.
- If camera unsupported/denied or marker tracking unavailable, app switches to non-camera mode.

3. Data Lifecycle
- Every upload has expiration at 30 days.
- Expired records and assets are removed by scheduled cleanup.

## Non-Functional Requirements
- Performance: target 24-30 FPS on mid-range mobile for camera overlay mode.
- Reliability: robust fallback path when camera/tracking fails.
- Security: file validation, text escaping.
- Privacy: camera stream processed in-browser only.

## Metrics (MWE)
- Upload success rate.
- Camera permission grant rate.
- Marker lock acquisition rate.
- Fallback activation rate.
