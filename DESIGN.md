# Design Specification (MWE)

## Design Direction
- Visual theme: cyan hologram on deep ocean/space background.
- Typography: Syne for headings, Space Grotesk for body.
- Tone: futuristic but readable.

## Screens
1. Creator Screen
- Hero statement and simple upload panel.
- Inputs: GIF file + one-line overlay text.
- Result card with QR and viewer URL.
- Marker page shortcut.

2. Viewer Screen
- Full-screen camera feed.
- Floating hologram card above detected marker.
- Status badge and manual fallback button.
- Fallback panel with static hologram card.

3. Marker Screen
- Large printable/displayable marker QR.
- Simple instructions for using marker in viewer.

## Motion
- Hologram card has subtle float animation.
- Position updates are smoothed (lerp) to reduce jitter.
- Reduced visual behavior appears automatically in fallback mode.

## Accessibility
- Strong color contrast on important text.
- Clear status labels for current viewer state.
- Manual fallback button always available.

## Mobile behavior
- Mobile-first viewer layout.
- HUD stacks vertically on small screens.
- Camera feed covers viewport with object-fit cover.
