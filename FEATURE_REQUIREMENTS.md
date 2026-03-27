# Feature Requirements: Group Gifts Display & Camera Zoom Management

## Overview
This document outlines the new features and fixes for the QR Display GIF project, specifically focusing on group gifts display improvements, zoom behavior based on camera permissions, and fallback mode camera toggle.

---

## Feature 1: Remove Bounding Box Around Group Gifts

### Current Behavior
- Multiple gifts in a group are displayed within a centered `holo-card` container
- All gifts are enclosed in a visible boundary/box
- Gifts are displayed in a grid layout

### Desired Behavior  
- **Remove the visual boundary** around the group of gifts
- Display each gift **individually and sequentially** (one after another)
- Each gift should be displayed in the **same style as single gifts**
- Gifts should appear without being confined to a group container box

### Implementation Details
- Remove or hide the outer `.holo-card` container styling for group mode
- Display `groupOverlayGrid` items as independent, unboxed elements
- Each item maintains its individual styling like single gift cards
- Consider using `display: flex` or `display: contents` to achieve unboxed layout

### Files Affected
- `public/styles.css` - Modify `.holo-card.group-mode` and `.group-grid` styles  
- `public/viewer.js` - Update DOM structure/classes as needed

---

## Feature 2: Click-to-Enlarge Functionality for Group Gifts

### Current Behavior
- Group gifts are very small and difficult to view individually
- No interaction mechanism to enlarge individual gifts
- Pinch-to-zoom is available but affects the entire page

### Desired Behavior
- **Click on a gift** to enlarge it to a viewable size
- **Click outside the enlarged gift** to return it to normal size
- Only one gift can be enlarged at a time
- Enlarged gift should still maintain proper aspect ratio and styling

### User Interaction Flow
1. User sees 3 small gifts in a group
2. User clicks on the 2nd gift → 2nd gift enlarges/zooms
3. User sees enlarged 2nd gift details clearly
4. User clicks outside → 2nd gift shrinks back to normal size
5. Loop can repeat for other gifts

### Implementation Details
- Add click event listeners to `.group-grid-item` elements
- Track currently enlarged item state
- Apply CSS transform/scale or modal-like presentation for enlarged view
- Create overlay or backdrop to detect clicks outside enlarged gift
- Animate transitions smoothly between normal and enlarged states

### Technical Approach
- Store `currentEnlargedGift` state variable
- Add `data-gift-id` or similar identifier to items
- Apply CSS class like `.gift-enlarged` with larger scale/size
- Use backdrop for click-outside detection
- Support both camera mode and fallback mode

### Files Affected
- `public/viewer.js` - Add event listeners and state management
- `public/styles.css` - Add `.gift-enlarged` and transition styles
- `public/viewer.html` - May need backdrop element or use existing overlay

---

## Feature 3: Camera Permission & Zoom Behavior

### Current Behavior
- Pinch-to-zoom is blocked in camera mode (good)
- No distinction between camera-enabled and fallback zoom behavior
- Website remains zoomable in fallback mode

### Desired Behavior

#### When Camera Permission is GRANTED (Camera Mode ON)
- **Lock website zoom entirely** (prevent page pinch zoom)
- **Only allow zooming the 3D hologram itself** (not the page)
- Single gift: Using pinch gesture zooms the hologram
- Multiple gifts: Using pinch gesture zooms individual gifts (combined with click-to-enlarge)
- Camera feed should be visible

#### When Camera Permission is NOT GRANTED (Fallback Mode)
- **No zooming allowed** on the webpage itself
- Multiple gifts shown in order (no enlargement capability)
- Single gifts shown statically
- Display fallback content in fallback panel

### Implementation Details
- Use `touch-action: none` in camera mode to lock zoom
- In fallback mode, disable all zoom/pinch functionality
- The existing `pinchState` handling should only work when `running === true` (camera mode)
- In fallback mode, `running === false`, so pinch is naturally disabled

### Files Affected
- `public/viewer.html` - May need touch-action CSS updates
- `public/viewer.js` - Ensure pinch logic respects camera state
- `public/styles.css` - Add `touch-action` declarations

---

## Feature 4: Fix Fallback Mode Camera Toggle

### Current Behavior
- When user clicks "Switch to fallback mode" button, the camera stream stops
- **Cannot turn the camera back on** after switching to fallback
- No way to recover to camera mode once fallback is activated
- User is stuck in fallback mode for the session

### Desired Behavior
- **Add a button in fallback panel** that allows user to "Turn on camera" or "Switch back to camera mode"
- Clicking button attempts to restart camera
- If camera permission is granted, returns to camera mode
- If camera permission is denied, displays appropriate error message
- User can toggle between camera mode and fallback mode as needed

### Implementation Details
- Add new button `#cameraOnBtn` or similar in fallback panel HTML
- Create `switchToCamera()` async function that:
  - Calls `startCamera()` again
  - Re-initializes detector if needed
  - Starts render loop and scanning
  - Updates UI appropriately
- Handle errors gracefully if user denies permission again

### User Interaction Flow
1. User scans QR without camera permission → Falls back to fallback mode
2. Fallback panel shows with "Turn on Camera" button
3. User clicks "Turn on Camera"
4. Browser asks for camera permission
5. If granted → Returns to camera mode
6. If denied → Shows error message and remains in fallback

### Files Affected
- `public/viewer.html` - Add camera enable button to fallback panel
- `public/viewer.js` - Add `switchToCamera()` function and event listener

---

## Implementation Priority

1. **High Priority**
   - Feature 4: Fix fallback mode camera toggle (critical UX issue)
   - Feature 3: Camera permission & zoom behavior (improves UX significantly)

2. **Medium Priority**  
   - Feature 1: Remove bounding box around group gifts (visual improvement)
   - Feature 2: Click-to-enlarge functionality (usability improvement)

---

## Testing Checklist

- [ ] Group gifts display without bounding box
- [ ] Each group gift can be clicked to enlarge
- [ ] Clicking outside enlarged gift shrinks it
- [ ] Camera mode prevents all page zooming
- [ ] Fallback mode also prevents any zooming  
- [ ] Pinch-to-zoom works for single gifts in camera mode
- [ ] Fallback mode button allows returning to camera mode
- [ ] Can successfully toggle between camera and fallback modes
- [ ] Multiple permission deny/accept cycles work correctly
- [ ] Works on mobile Safari and Chrome
- [ ] No console errors or warnings
