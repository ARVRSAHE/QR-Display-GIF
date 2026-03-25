const MARKER_TEXT = "HOLO_MARKER_V1";
const cameraFeed = document.getElementById("cameraFeed");
const scanCanvas = document.getElementById("scanCanvas");
const overlay = document.getElementById("overlay");
const gifImage = document.getElementById("gifImage");
const overlayTextEl = document.getElementById("overlayText");
const statusBadge = document.getElementById("statusBadge");
const fallbackPanel = document.getElementById("fallbackPanel");
const fallbackReason = document.getElementById("fallbackReason");
const fallbackText = document.getElementById("fallbackText");
const fallbackGif = document.getElementById("fallbackGif");
const fallbackBtn = document.getElementById("fallbackBtn");

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
let targetQrValues = new Set();
const hologramContainer = document.getElementById("hologram-3d-container");
let orientationEnabled = false;
let userScale = 1;
const pinchState = {
  active: false,
  startDistance: 0,
  startScale: 1
};

fallbackBtn.addEventListener("click", () => {
  switchToFallback("Switched manually.");
});

// Prevent browser pinch zoom and map two-finger pinch to hologram scale.
document.addEventListener("touchstart", (event) => {
  if (!event.touches || event.touches.length !== 2) {
    return;
  }
  pinchState.active = true;
  pinchState.startDistance = touchDistance(event.touches[0], event.touches[1]);
  pinchState.startScale = userScale;
  event.preventDefault();
}, { passive: false });

document.addEventListener("touchmove", (event) => {
  if (!event.touches || event.touches.length < 2) {
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
  pinchState.active = true;
  pinchState.startScale = userScale;
  event.preventDefault();
}, { passive: false });

document.addEventListener("gesturechange", (event) => {
  if (typeof event.scale === "number") {
    userScale = clamp(pinchState.startScale * event.scale, 0.55, 2.4);
  }
  event.preventDefault();
}, { passive: false });

document.addEventListener("gestureend", (event) => {
  pinchState.active = false;
  if (typeof event.scale === "number") {
    userScale = clamp(pinchState.startScale * event.scale, 0.55, 2.4);
  }
  event.preventDefault();
}, { passive: false });

// Keep Three.js layer disabled; use animated DOM GIF for reliable playback on mobile.
hologramContainer.classList.add("hidden");

start();


async function start() {
  const id = getIdFromPath();
  if (!id) {
    switchToFallback("Invalid URL.");
    return;
  }
  targetItemId = id;

  targetQrValues = new Set([
    normalizeCodeValue(window.location.href),
    normalizeCodeValue(`${window.location.origin}/v/${id}`)
  ]);

  const item = await fetchItem(id);
  if (!item) {
    return;
  }

  overlayTextEl.textContent = item.overlayText || "";
  fallbackText.textContent = item.overlayText || "";
  gifImage.src = item.gifUrl;
  fallbackGif.src = item.gifUrl;

  gifImage.style.objectFit = "contain";

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
    targetPose.s = clamp(0.95 * userScale, 0.4, 2.4);
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

async function fetchItem(id) {
  try {
    const res = await fetch(`/api/item/${encodeURIComponent(id)}`);
    const data = await res.json();
    if (!res.ok) {
      switchToFallback(data.error || "Unable to load item.");
      return null;
    }

    return data;
  } catch (_err) {
    switchToFallback("Network issue loading GIF data.");
    return null;
  }
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
    const marker = pickTrackedCode(codes);

    if (marker?.boundingBox) {
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

    const normalizedRaw = normalizeCodeValue(qr.data);
    const matches = targetQrValues.has(normalizedRaw) || normalizedRaw.endsWith(`/v/${targetItemId}`);
    if (!matches) {
      return;
    }

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

function pickTrackedCode(codes) {
  if (!Array.isArray(codes) || codes.length === 0) {
    return null;
  }

  for (const code of codes) {
    if (!code?.boundingBox || !code?.rawValue) {
      continue;
    }

    const normalizedRaw = normalizeCodeValue(code.rawValue);
    if (targetQrValues.has(normalizedRaw)) {
      return code;
    }

    if (normalizedRaw.endsWith(`/v/${targetItemId}`)) {
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
  const markerScale = clamp(markerScaleBase * userScale, 0.35, 2.7);
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
      targetPose.s = clamp(0.95 * userScale, 0.4, 2.4);
      targetPose.z = 18 + Math.sin(Date.now() * 0.0022) * 4;
      targetPose.y = window.innerHeight * 0.58;
    }

    const breathingZ = Math.sin(Date.now() * 0.0025) * 4;
    const liveScale = smooth.s;

    overlay.style.left = `${smooth.x}px`;
    overlay.style.top = `${smooth.y}px`;
    overlay.style.transform = `translate(-50%, -50%) perspective(1200px) translateZ(${smooth.z + breathingZ}px) rotateX(${smooth.rotX}deg) rotateY(${smooth.rotY}deg) rotateZ(${smooth.rotZ}deg) scale(${liveScale})`;

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

function getIdFromPath() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return parts[0] === "v" ? parts[1] : "";
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
