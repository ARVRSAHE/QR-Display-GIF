const MARKER_TEXT = "HOLO_MARKER_V1";
const cameraFeed = document.getElementById("cameraFeed");
const scanCanvas = document.getElementById("scanCanvas");
const overlay = document.getElementById("overlay");
const gifImage = document.getElementById("gifImage");
const overlayTextEl = document.getElementById("overlayText");
const groupOverlayGrid = document.getElementById("groupOverlayGrid");
const statusBadge = document.getElementById("statusBadge");
const fallbackPanel = document.getElementById("fallbackPanel");
const fallbackCard = fallbackPanel?.querySelector(".holo-card.static");
const fallbackReason = document.getElementById("fallbackReason");
const fallbackText = document.getElementById("fallbackText");
const fallbackGif = document.getElementById("fallbackGif");
const groupFallbackGrid = document.getElementById("groupFallbackGrid");
const fallbackBtn = document.getElementById("fallbackBtn");
const cameraOnBtn = document.getElementById("cameraOnBtn");

let detector = null;
let stream = null;
let running = false;
let cameraOnlyMode = false;
let useJsQr = false;
let lastMarkerSeenAt = 0;
let detectTimer = null;
let smooth = { x: window.innerWidth / 2, y: window.innerHeight / 2, s: 0.8, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
let targetPose = { x: window.innerWidth / 2, y: window.innerHeight / 2, s: 0.8, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
let deviceTilt = { beta: 0, gamma: 0 };
let renderRaf = 0;
let targetItemId = "";
let targetRouteType = "v";
let isGroupView = false;
let targetQrValues = new Set();
let currentTargetKey = "";
let pendingTargetKey = "";
const hologramContainer = document.getElementById("hologram-3d-container");
let orientationEnabled = false;
let userScale = 1;
let currentEnlargedGiftId = null; // Track which gift is enlarged in group view
const pinchState = {
  active: false,
  startDistance: 0,
  startScale: 1
};

fallbackBtn.addEventListener("click", () => {
  switchToFallback("Switched manually.");
});

cameraOnBtn?.addEventListener("click", () => {
  switchToCamera();
});

// Prevent browser pinch zoom and map two-finger pinch to hologram scale (only in camera mode).
document.addEventListener("touchstart", (event) => {
  // Only allow pinch zoom when camera is running
  if (!running || !event.touches || event.touches.length !== 2) {
    return;
  }
  pinchState.active = true;
  pinchState.startDistance = touchDistance(event.touches[0], event.touches[1]);
  pinchState.startScale = userScale;
  event.preventDefault();
}, { passive: false });

document.addEventListener("touchmove", (event) => {
  // Only allow pinch zoom when camera is running
  if (!running || !event.touches || event.touches.length < 2) {
    return;
  }

  event.preventDefault();

  if (!pinchState.active) {
    pinchState.active = true;
    pinchState.startDistance = touchDistance(event.touches[0], event.touches[1]);
    pinchState.startScale = userScale;
    return;
  }

  const currentDistance = touchDistance(event.touches[0], event.touches[1]);
  const ratio = pinchState.startDistance > 0 ? currentDistance / pinchState.startDistance : 1;
  userScale = clamp(pinchState.startScale * ratio, 0.55, 2.4);
}, { passive: false });

document.addEventListener("touchend", () => {
  if (pinchState.active) {
    pinchState.active = false;
    pinchState.startDistance = 0;
  }
});

document.addEventListener("gesturestart", (event) => {
  // Only allow gesture zoom when camera is running
  if (!running) {
    return;
  }
  pinchState.active = true;
  pinchState.startScale = userScale;
  event.preventDefault();
}, { passive: false });

document.addEventListener("gesturechange", (event) => {
  // Only allow gesture zoom when camera is running
  if (!running) {
    return;
  }
  if (typeof event.scale === "number") {
    userScale = clamp(pinchState.startScale * event.scale, 0.55, 2.4);
  }
  event.preventDefault();
}, { passive: false });

document.addEventListener("gestureend", (event) => {
  pinchState.active = false;
  // Only allow gesture zoom when camera is running
  if (!running) {
    return;
  }
  if (typeof event.scale === "number") {
    userScale = clamp(pinchState.startScale * event.scale, 0.55, 2.4);
  }
  event.preventDefault();
}, { passive: false });

// Keep Three.js layer disabled; use animated DOM GIF for reliable playback on mobile.
hologramContainer.classList.add("hidden");

start();


async function start() {
  const targetFromPath = getTargetFromPath();
  const targetFromQuery = getTargetFromQuery();
  const initialTarget = targetFromPath?.id ? targetFromPath : targetFromQuery;

  if (initialTarget?.id && initialTarget?.type) {
    const ok = await switchToTarget(initialTarget.type, initialTarget.id, true);
    if (!ok) {
      return;
    }
  } else {
    status("Scan any supported QR to load GIFs.");
  }

  if (!window.isSecureContext) {
    switchToFallback("Camera requires HTTPS or localhost.");
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    switchToFallback("Camera API not supported in this browser.");
    return;
  }

  const cameraReady = await startCamera();
  if (!cameraReady) {
    return;
  }

  if (!("BarcodeDetector" in window)) {
    useJsQr = typeof window.jsQR === "function";
    cameraOnlyMode = !useJsQr;
    detector = null;
  } else {
    try {
      detector = new BarcodeDetector({ formats: ["qr_code"] });
      useJsQr = false;
      cameraOnlyMode = false;
    } catch (_err) {
      useJsQr = typeof window.jsQR === "function";
      cameraOnlyMode = !useJsQr;
      detector = null;
    }
  }

  setupDeviceOrientation();

  running = true;
  status(cameraOnlyMode
    ? "Camera mode active. QR tracking is limited on this browser."
    : "Point camera at QR. Move closer/farther for 3D depth.");
  fallbackPanel.classList.add("hidden");

  if (cameraOnlyMode) {
    // Keep hologram visible over camera feed even without marker tracking support.
    targetPose.x = window.innerWidth / 2;
    targetPose.y = window.innerHeight * 0.58;
    targetPose.s = clamp((isGroupView ? 1.2 : 0.95) * userScale, 0.4, 2.8);
    targetPose.z = 18;
    targetPose.rotX = 8;
    targetPose.rotY = 0;
    targetPose.rotZ = 0;
    overlay.classList.remove("hidden");
  } else {
    // Set initial pose so overlay is visible when QR is detected
    targetPose.x = window.innerWidth / 2;
    targetPose.y = window.innerHeight * 0.58;
    targetPose.s = 1.0;
    targetPose.z = 0;
    targetPose.rotX = 0;
    targetPose.rotY = 0;
    targetPose.rotZ = 0;
    // Start smooth values at initial position too
    smooth.x = targetPose.x;
    smooth.y = targetPose.y;
    smooth.s = targetPose.s;
    smooth.z = targetPose.z;
    overlay.classList.add("hidden");
  }

  startRenderLoop();
  if (!cameraOnlyMode) {
    detectTimer = setInterval(scanFrame, useJsQr ? 95 : 75);
  }
}

async function fetchPayload(type, id, hardFail) {
  try {
    const endpoint = type === "g"
      ? `/api/group/${encodeURIComponent(id)}`
      : `/api/item/${encodeURIComponent(id)}`;
    const res = await fetch(endpoint);
    const data = await res.json();
    if (!res.ok) {
      if (hardFail) {
        switchToFallback(data.error || "Unable to load item.");
      }
      return null;
    }

    return data;
  } catch (_err) {
    if (hardFail) {
      switchToFallback("Network issue loading GIF data.");
    }
    return null;
  }
}

async function switchToTarget(type, id, force) {
  const nextType = type === "g" ? "g" : "v";
  const nextId = String(id || "").trim();
  if (!nextId) {
    return false;
  }

  const nextKey = `${nextType}:${nextId}`;
  if (!force && (nextKey === currentTargetKey || nextKey === pendingTargetKey)) {
    return true;
  }

  pendingTargetKey = nextKey;
  status("Loading matched GIF...");

  const payload = await fetchPayload(nextType, nextId, Boolean(force));
  if (!payload) {
    if (pendingTargetKey === nextKey) {
      pendingTargetKey = "";
    }
    return false;
  }

  targetRouteType = nextType;
  targetItemId = nextId;
  isGroupView = nextType === "g";
  currentTargetKey = nextKey;
  pendingTargetKey = "";

  targetQrValues = new Set([
    normalizeCodeValue(window.location.href),
    normalizeCodeValue(`${window.location.origin}/${targetRouteType}/${targetItemId}`),
    normalizeCodeValue(`${window.location.origin}/scan?target=${encodeURIComponent(`${targetRouteType}:${targetItemId}`)}`)
  ]);

  applyPayloadToViewer(payload);
  return true;
}

function applyPayloadToViewer(payload) {
  console.log("[GIF Viewer]", "Applying payload:", payload);
  overlay.classList.toggle("group-mode", isGroupView);
  fallbackCard?.classList.toggle("group-mode", isGroupView);

  if (!isGroupView) {
    console.log("[GIF Viewer]", "Single GIF mode:", payload.gifUrl);
    overlayTextEl.textContent = payload.overlayText || "";
    fallbackText.textContent = payload.overlayText || "";
    gifImage.src = payload.gifUrl;
    fallbackGif.src = payload.gifUrl;
    gifImage.style.objectFit = "contain";
    gifImage.classList.remove("hidden");
    fallbackGif.classList.remove("hidden");
    groupOverlayGrid?.classList.add("hidden");
    groupFallbackGrid?.classList.add("hidden");
    return;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  console.log("[GIF Viewer]", `Group GIF mode: ${items.length} items`);
  console.log("[GIF Viewer]", "Items:", items);
  overlayTextEl.textContent = `Group GIFs (${items.length})`;
  fallbackText.textContent = `Group GIFs (${items.length})`;
  gifImage.classList.add("hidden");
  fallbackGif.classList.add("hidden");

  const markup = items.map((item, index) => `
    <article class="group-grid-item" data-gift-index="${index}">
      <p class="holo-text">${escapeHtml(item.overlayText || "GIF")}</p>
      <img class="gif-frame" src="${item.gifUrl}" alt="${escapeHtml(item.overlayText || "Group GIF")}" loading="lazy" />
    </article>
  `).join("");

  console.log("[GIF Viewer]", "Generated markup length:", markup.length);
  
  if (groupOverlayGrid) {
    console.log("[GIF Viewer]", "Setting groupOverlayGrid innerHTML");
    groupOverlayGrid.innerHTML = markup;
    groupOverlayGrid.classList.remove("hidden");
    console.log("[GIF Viewer]", "groupOverlayGrid visible, items count:", groupOverlayGrid.children.length);
    attachGroupGiftEventListeners(groupOverlayGrid);
  }

  if (groupFallbackGrid) {
    groupFallbackGrid.innerHTML = markup;
    groupFallbackGrid.classList.remove("hidden");
    if (running) {
      // Only attach event listeners in camera mode, not in fallback mode
      attachGroupGiftEventListeners(groupFallbackGrid);
    }
  }
}

function attachGroupGiftEventListeners(gridContainer) {
  const items = gridContainer.querySelectorAll(".group-grid-item");
  
  items.forEach((item) => {
    item.addEventListener("click", (event) => {
      // Don't enlarge if clicking a link or interactive element
      if (event.target.tagName === "A" || event.target.closest("button")) {
        return;
      }
      
      const index = item.getAttribute("data-gift-index");
      
      // If this gift is already enlarged, close it
      if (currentEnlargedGiftId === index) {
        item.classList.remove("gift-enlarged");
        currentEnlargedGiftId = null;
        return;
      }
      
      // Close any previously enlarged gift
      if (currentEnlargedGiftId !== null) {
        const previousItem = gridContainer.querySelector(`[data-gift-index="${currentEnlargedGiftId}"]`);
        if (previousItem) {
          previousItem.classList.remove("gift-enlarged");
        }
      }
      
      // Enlarge the clicked gift
      item.classList.add("gift-enlarged");
      currentEnlargedGiftId = index;
    });
  });
  
  // Add click handler to the container to close enlarged gift when clicking outside
  gridContainer.addEventListener("click", (event) => {
    // Only close if clicking directly on the container, not on items
    if (event.target === gridContainer && currentEnlargedGiftId !== null) {
      const enlargedItem = gridContainer.querySelector(`[data-gift-index="${currentEnlargedGiftId}"]`);
      if (enlargedItem) {
        enlargedItem.classList.remove("gift-enlarged");
        currentEnlargedGiftId = null;
      }
    }
  });
}

async function startCamera() {
  try {
    const candidates = [
      {
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      },
      {
        video: {
          facingMode: { exact: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      },
      {
        video: true,
        audio: false
      }
    ];

    let lastError = null;
    for (const constraints of candidates) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (stream) {
          break;
        }
      } catch (err) {
        lastError = err;
      }
    }

    if (!stream) {
      throw lastError || new Error("Unable to access camera.");
    }

    cameraFeed.setAttribute("playsinline", "true");
    cameraFeed.setAttribute("webkit-playsinline", "true");
    cameraFeed.srcObject = stream;
    await cameraFeed.play();

    // Try to lock camera zoom so user motion changes hologram scale instead of lens zoom.
    const track = stream.getVideoTracks?.()[0];
    if (track?.getCapabilities && track?.applyConstraints) {
      const caps = track.getCapabilities();
      if (caps?.zoom) {
        const lockZoom = Number.isFinite(caps.zoom.min) ? caps.zoom.min : 1;
        try {
          await track.applyConstraints({ advanced: [{ zoom: lockZoom }] });
        } catch (_err) {
          // Ignore if browser/device does not allow manual zoom control.
        }
      }
    }

    return true;
  } catch (_err) {
    switchToFallback("Camera permission denied or unavailable.");
    return false;
  }
}

async function scanFrame() {
  if (!running || !cameraFeed.videoWidth || !cameraFeed.videoHeight) {
    return;
  }

  if (detector) {
    await scanFrameWithBarcodeDetector();
    return;
  }

  if (useJsQr) {
    scanFrameWithJsQr();
  }
}

async function scanFrameWithBarcodeDetector() {
  if (!detector) {
    return;
  }

  try {
    const codes = await detector.detect(cameraFeed);
    const marker = pickSupportedCode(codes);

    if (marker?.boundingBox) {
      if (marker.rawValue) {
        const target = extractTargetFromCodeValue(marker.rawValue);
        if (target?.id && target?.type) {
          await switchToTarget(target.type, target.id, false);
        }
      }

      lastMarkerSeenAt = Date.now();
      status("QR detected. Hologram anchored.");
      updateTargetPose(marker, cameraFeed.videoWidth, cameraFeed.videoHeight);
      overlay.classList.remove("hidden");
      return;
    }

    if (Date.now() - lastMarkerSeenAt > 1000) {
      status("Searching for matching QR...");
      overlay.classList.add("hidden");
    }
  } catch (_err) {
    status("Tracking interrupted. Retrying...");
  }
}

function scanFrameWithJsQr() {
  const width = cameraFeed.videoWidth;
  const height = cameraFeed.videoHeight;
  if (!width || !height) {
    return;
  }

  scanCanvas.width = width;
  scanCanvas.height = height;
  const ctx = scanCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    return;
  }

  try {
    ctx.drawImage(cameraFeed, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    const qr = window.jsQR(imageData.data, width, height, {
      inversionAttempts: "attemptBoth"
    });

    if (!qr || !qr.data || !qr.location) {
      if (Date.now() - lastMarkerSeenAt > 1000) {
        status("Searching for matching QR...");
        overlay.classList.add("hidden");
      }
      return;
    }

    const target = extractTargetFromCodeValue(qr.data);
    if (!target?.id || !target?.type) {
      return;
    }

    void switchToTarget(target.type, target.id, false);

    const points = [
      qr.location.topLeftCorner,
      qr.location.topRightCorner,
      qr.location.bottomRightCorner,
      qr.location.bottomLeftCorner
    ];

    const minX = Math.min(...points.map((p) => p.x));
    const maxX = Math.max(...points.map((p) => p.x));
    const minY = Math.min(...points.map((p) => p.y));
    const maxY = Math.max(...points.map((p) => p.y));

    lastMarkerSeenAt = Date.now();
    status("QR detected. Hologram anchored.");
    updateTargetPose({
      boundingBox: {
        x: minX,
        y: minY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY)
      },
      cornerPoints: points
    }, width, height);
    overlay.classList.remove("hidden");
  } catch (_err) {
    status("Tracking interrupted. Retrying...");
  }
}

function pickSupportedCode(codes) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return null;
  }

  for (const code of codes) {
    if (!code?.boundingBox || !code?.rawValue) {
      continue;
    }

    const target = extractTargetFromCodeValue(code.rawValue);
    if (target?.id && target?.type) {
      return code;
    }
  }

  return null;
}

function updateTargetPose(marker, sourceW, sourceH) {
  const box = marker.boundingBox;
  const scaleX = window.innerWidth / sourceW;
  const scaleY = window.innerHeight / sourceH;

  const cx = (box.x + box.width / 2) * scaleX;
  const cy = (box.y + box.height / 2) * scaleY;
  const fallbackWidth = box.width * scaleX;
  const fallbackHeight = box.height * scaleY;

  const quad = normalizeCornerPoints(marker.cornerPoints, scaleX, scaleY);
  const metrics = quad ? getQuadMetrics(quad) : null;
  const qrPixelWidth = metrics ? metrics.avgWidth : fallbackWidth;
  const qrPixelHeight = metrics ? metrics.avgHeight : fallbackHeight;

  // Stronger distance response so zoom-in/out visibly changes hologram size.
  const markerScaleBase = clamp(Math.pow(qrPixelWidth / 170, 1.18), 0.45, 1.85);
  const groupScaleBoost = isGroupView ? 1.1 : 1;
  const minScale = isGroupView ? 0.45 : 0.35;
  const markerScale = clamp(markerScaleBase * userScale * groupScaleBoost, minScale, 3.2);
  const depthZ = clamp((markerScale - 0.9) * 180, -90, 150);

  // Keep centered over QR while still floating in depth.
  const hoverOffsetY = qrPixelHeight * 0.02;

  let poseRotX = 0;
  let poseRotY = 0;
  let poseRotZ = 0;

  if (metrics) {
    poseRotZ = clamp(metrics.rollDeg, -28, 28);
    poseRotY = clamp(metrics.yawLike * 38, -28, 28);
    poseRotX = clamp(metrics.pitchLike * 34, -24, 24);
  }

  targetPose.x = cx;
  targetPose.y = cy - hoverOffsetY;
  targetPose.s = markerScale;
  targetPose.z = depthZ;
  targetPose.rotX = poseRotX;
  targetPose.rotY = poseRotY;
  targetPose.rotZ = poseRotZ;
}

function startRenderLoop() {
  if (renderRaf) {
    cancelAnimationFrame(renderRaf);
  }

  const render = () => {
    if (!running) {
      return;
    }

    // Smoothly follow latest QR target.
    smooth.x = lerp(smooth.x, targetPose.x, 0.2);
    smooth.y = lerp(smooth.y, targetPose.y, 0.2);
    smooth.s = lerp(smooth.s, targetPose.s, 0.18);
    smooth.z = lerp(smooth.z, targetPose.z, 0.16);

    // Add perspective from screen position and phone orientation.
    const centerTiltX = (window.innerHeight / 2 - smooth.y) / 50;
    const centerTiltY = (smooth.x - window.innerWidth / 2) / 50;
    const motionTiltX = orientationEnabled ? clamp(deviceTilt.beta * 0.045, -6, 6) : 0;
    const motionTiltY = orientationEnabled ? clamp(-deviceTilt.gamma * 0.055, -7, 7) : 0;

    smooth.rotX = lerp(smooth.rotX, targetPose.rotX + centerTiltX + motionTiltX, 0.2);
    smooth.rotY = lerp(smooth.rotY, targetPose.rotY + centerTiltY + motionTiltY, 0.2);
    smooth.rotZ = lerp(smooth.rotZ, targetPose.rotZ + motionTiltY * 0.16, 0.14);

    if (cameraOnlyMode) {
      // Gentle floating animation in camera-only mode.
      targetPose.s = clamp((isGroupView ? 1.0 : 0.95) * userScale, 0.4, 2.8);
      targetPose.z = 18 + Math.sin(Date.now() * 0.0022) * 4;
      targetPose.y = window.innerHeight * 0.58;
    }

    const breathingZ = Math.sin(Date.now() * 0.0025) * 4;
    const liveScale = smooth.s;

    overlay.style.left = `${smooth.x}px`;
    overlay.style.top = `${smooth.y}px`;
    if (isGroupView) {
      // Keep group cards flat and readable on mobile instead of aggressive 3D foreshortening.
      const groupScale = clamp(liveScale * 0.85, 0.68, 1.15);
      overlay.style.transform = `translate(-50%, -50%) scale(${groupScale})`;
    } else {
      overlay.style.transform = `translate(-50%, -50%) perspective(1200px) translateZ(${smooth.z + breathingZ}px) rotateX(${smooth.rotX}deg) rotateY(${smooth.rotY}deg) rotateZ(${smooth.rotZ}deg) scale(${liveScale})`;
    }

    renderRaf = requestAnimationFrame(render);
  };

  renderRaf = requestAnimationFrame(render);
}

function setupDeviceOrientation() {
  const onOrientation = (event) => {
    deviceTilt.beta = event.beta || 0;
    deviceTilt.gamma = event.gamma || 0;
  };

  if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
    const requestPermission = async () => {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission === "granted") {
          orientationEnabled = true;
          window.addEventListener("deviceorientation", onOrientation);
        }
      } catch (_err) {
        // Ignore permission failures; hologram still follows QR position.
      }
      document.removeEventListener("click", requestPermission);
      document.removeEventListener("touchstart", requestPermission);
    };

    document.addEventListener("click", requestPermission, { once: true });
    document.addEventListener("touchstart", requestPermission, { once: true });
    return;
  }

  if (typeof DeviceOrientationEvent !== "undefined") {
    orientationEnabled = true;
    window.addEventListener("deviceorientation", onOrientation);
  }
}

function switchToFallback(reason) {
  running = false;
  if (renderRaf) {
    cancelAnimationFrame(renderRaf);
    renderRaf = 0;
  }
  status("Fallback mode active");
  fallbackReason.textContent = reason;
  overlay.classList.add("hidden");
  fallbackPanel.classList.remove("hidden");

  if (detectTimer) {
    clearInterval(detectTimer);
    detectTimer = null;
  }

  if (stream) {
    stream.getTracks().forEach((track) => track.stop());
  }
}

async function switchToCamera() {
  // Hide fallback panel and attempt to restart camera
  status("Requesting camera access...");
  
  const cameraReady = await startCamera();
  if (!cameraReady) {
    status("Failed to access camera. Remaining in fallback mode.");
    return;
  }

  // Re-initialize detector if needed
  if (!("BarcodeDetector" in window)) {
    useJsQr = typeof window.jsQR === "function";
    cameraOnlyMode = !useJsQr;
    detector = null;
  } else {
    try {
      detector = new BarcodeDetector({ formats: ["qr_code"] });
      useJsQr = false;
      cameraOnlyMode = false;
    } catch (_err) {
      useJsQr = typeof window.jsQR === "function";
      cameraOnlyMode = !useJsQr;
      detector = null;
    }
  }

  // Reset state and start rendering
  running = true;
  status(cameraOnlyMode
    ? "Camera mode active. QR tracking is limited on this browser."
    : "Point camera at QR. Move closer/farther for 3D depth.");
  
  fallbackPanel.classList.add("hidden");
  cameraFeed.style.display = "block";

  if (cameraOnlyMode) {
    targetPose.x = window.innerWidth / 2;
    targetPose.y = window.innerHeight * 0.58;
    targetPose.s = clamp((isGroupView ? 1.2 : 0.95) * userScale, 0.4, 2.8);
    targetPose.z = 18;
    targetPose.rotX = 8;
    targetPose.rotY = 0;
    targetPose.rotZ = 0;
    overlay.classList.remove("hidden");
  } else {
    overlay.classList.add("hidden");
  }

  startRenderLoop();
  if (!cameraOnlyMode) {
    detectTimer = setInterval(scanFrame, useJsQr ? 95 : 75);
  }
}

function getTargetFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  if (parts[0] === "v") {
    return { type: "v", id: parts[1] || "" };
  }
  if (parts[0] === "g") {
    return { type: "g", id: parts[1] || "" };
  }
  return { type: "", id: "" };
}

function getTargetFromQuery() {
  const target = new URLSearchParams(window.location.search).get("target") || "";
  return parseTargetToken(target);
}

function extractTargetFromCodeValue(value) {
  if (!value) {
    return { type: "", id: "" };
  }

  const raw = String(value || "").trim();
  const directToken = parseTargetToken(raw);
  if (directToken.id) {
    return directToken;
  }

  try {
    const parsed = new URL(raw, window.location.origin);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts[0] === "v") {
      return { type: "v", id: parts[1] || "" };
    }
    if (parts[0] === "g") {
      return { type: "g", id: parts[1] || "" };
    }
    if (parts[0] === "scan") {
      const scanTarget = parsed.searchParams.get("target") || "";
      return parseTargetToken(scanTarget);
    }
  } catch (_err) {
    // Fall through to empty target.
  }

  return { type: "", id: "" };
}

function parseTargetToken(token) {
  const raw = String(token || "").trim();
  const match = raw.match(/^(v|g):([a-zA-Z0-9_-]+)$/);
  if (!match) {
    return { type: "", id: "" };
  }
  return {
    type: match[1],
    id: match[2]
  };
}

function status(text) {
  statusBadge.textContent = text;
}

function normalizeCodeValue(value) {
  if (!value) {
    return "";
  }

  try {
    const url = new URL(String(value), window.location.origin);
    url.hash = "";
    url.search = "";
    return url.toString().replace(/\/$/, "");
  } catch (_err) {
    return String(value).trim().replace(/\/$/, "");
  }
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeCornerPoints(cornerPoints, scaleX, scaleY) {
  if (!Array.isArray(cornerPoints) || cornerPoints.length < 4) {
    return null;
  }

  const points = cornerPoints.slice(0, 4).map((p) => ({
    x: p.x * scaleX,
    y: p.y * scaleY
  }));

  const cx = points.reduce((sum, p) => sum + p.x, 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p.y, 0) / points.length;

  const ordered = points
    .map((p) => ({ ...p, a: Math.atan2(p.y - cy, p.x - cx) }))
    .sort((a, b) => a.a - b.a);

  // Start at top-left-like point (smallest x+y), then rotate sequence.
  let startIndex = 0;
  let minScore = Infinity;
  for (let i = 0; i < ordered.length; i += 1) {
    const score = ordered[i].x + ordered[i].y;
    if (score < minScore) {
      minScore = score;
      startIndex = i;
    }
  }

  const seq = [
    ordered[startIndex],
    ordered[(startIndex + 1) % 4],
    ordered[(startIndex + 2) % 4],
    ordered[(startIndex + 3) % 4]
  ];

  // Ensure clockwise winding from top-left.
  const cross = (seq[1].x - seq[0].x) * (seq[2].y - seq[0].y) - (seq[1].y - seq[0].y) * (seq[2].x - seq[0].x);
  if (cross < 0) {
    seq.reverse();
    seq.unshift(seq.pop());
  }

  return {
    tl: seq[0],
    tr: seq[1],
    br: seq[2],
    bl: seq[3]
  };
}

function getQuadMetrics(quad) {
  const topVec = vec(quad.tl, quad.tr);
  const bottomVec = vec(quad.bl, quad.br);
  const leftVec = vec(quad.tl, quad.bl);
  const rightVec = vec(quad.tr, quad.br);

  const topW = length(topVec);
  const bottomW = length(bottomVec);
  const leftH = length(leftVec);
  const rightH = length(rightVec);

  const avgWidth = (topW + bottomW) / 2;
  const avgHeight = (leftH + rightH) / 2;
  const rollDeg = radToDeg(Math.atan2(topVec.y, topVec.x));
  const yawLike = safeDiv(rightH - leftH, avgHeight);
  const pitchLike = safeDiv(topW - bottomW, avgWidth);

  return {
    avgWidth,
    avgHeight,
    rollDeg,
    yawLike,
    pitchLike
  };
}

function vec(a, b) {
  return { x: b.x - a.x, y: b.y - a.y };
}

function length(v) {
  return Math.hypot(v.x, v.y);
}

function radToDeg(radians) {
  return radians * (180 / Math.PI);
}

function safeDiv(a, b) {
  if (!b) {
    return 0;
  }
  return a / b;
}

function touchDistance(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
