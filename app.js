const video = document.getElementById("camera");
const miniWindow = document.querySelector(".mini-window");
const statusPanel = document.getElementById("statusPanel");

const state = {
  stream: null,
  track: null,
  zoom: 1,
  minZoom: 1,
  maxZoom: 3,
  panX: 0,
  panY: 0,
};

const gesture = {
  mode: null,
  startDistance: 0,
  startZoom: 1,
  startMidpoint: null,
  startPanX: 0,
  startPanY: 0,
  startPointerX: 0,
  startPointerY: 0,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function setStatus(message) {
  statusPanel.textContent = message;
}

async function setupCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
    });

    const [track] = stream.getVideoTracks();
    state.stream = stream;
    state.track = track;
    video.srcObject = stream;

    await video.play();
    configureTrackCapabilities(track);
    applyPreviewTransform();
    setStatus("ピンチでズーム / スワイプで撮影範囲を移動");
  } catch (error) {
    console.error(error);
    setStatus("カメラにアクセスできません。Safari で HTTPS または localhost を確認してください。");
  }
}

function configureTrackCapabilities(track) {
  const capabilities = track.getCapabilities?.() ?? {};
  if (capabilities.zoom) {
    state.minZoom = capabilities.zoom.min ?? 1;
    state.maxZoom = capabilities.zoom.max ?? 3;
    state.zoom = clamp(capabilities.zoom.min ?? 1, state.minZoom, state.maxZoom);
  } else {
    state.minZoom = 1;
    state.maxZoom = 3;
    state.zoom = 1;
  }
}

async function syncNativeZoom() {
  if (!state.track?.applyConstraints) return;
  const capabilities = state.track.getCapabilities?.() ?? {};
  if (!capabilities.zoom) return;

  try {
    await state.track.applyConstraints({
      advanced: [{ zoom: state.zoom }],
    });
  } catch (error) {
    console.warn("Native zoom was not applied.", error);
  }
}

function getPanBounds() {
  const range = ((state.zoom - 1) / state.zoom) * 50;
  return {
    minX: -range,
    maxX: range,
    minY: -range,
    maxY: range,
  };
}

function applyPreviewTransform() {
  const scale = capabilitiesSupportZoom() ? 1 : state.zoom;
  video.style.objectPosition = `${50 + state.panX}% ${50 + state.panY}%`;
  video.style.transform = `scale(${scale})`;
  miniWindow.style.transform = "translate(0, 0)";
}

function capabilitiesSupportZoom() {
  const capabilities = state.track?.getCapabilities?.() ?? {};
  return Boolean(capabilities.zoom);
}

function getTouchDistance(touches) {
  const [a, b] = touches;
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

function getMidpoint(touches) {
  const [a, b] = touches;
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

function getZoomAdjustedDelta(deltaPx, axisSizePx) {
  const percent = (deltaPx / axisSizePx) * 100;
  return percent / Math.max(state.zoom, 1);
}

function onTouchStart(event) {
  if (event.touches.length === 2) {
    gesture.mode = "pinch";
    gesture.startDistance = getTouchDistance(event.touches);
    gesture.startZoom = state.zoom;
    gesture.startMidpoint = getMidpoint(event.touches);
    gesture.startPanX = state.panX;
    gesture.startPanY = state.panY;
    return;
  }

  if (event.touches.length === 1) {
    gesture.mode = "swipe";
    gesture.startPointerX = event.touches[0].clientX;
    gesture.startPointerY = event.touches[0].clientY;
    gesture.startPanX = state.panX;
    gesture.startPanY = state.panY;
  }
}

function onTouchMove(event) {
  event.preventDefault();

  if (gesture.mode === "pinch" && event.touches.length === 2) {
    const distance = getTouchDistance(event.touches);
    const ratio = distance / gesture.startDistance;
    state.zoom = clamp(gesture.startZoom * ratio, state.minZoom, state.maxZoom);

    const midpoint = getMidpoint(event.touches);
    const bounds = getPanBounds();
    const deltaX = getZoomAdjustedDelta(midpoint.x - gesture.startMidpoint.x, window.innerWidth);
    const deltaY = getZoomAdjustedDelta(midpoint.y - gesture.startMidpoint.y, window.innerHeight);

    state.panX = clamp(gesture.startPanX + deltaX, bounds.minX, bounds.maxX);
    state.panY = clamp(gesture.startPanY + deltaY, bounds.minY, bounds.maxY);

    applyPreviewTransform();
    syncNativeZoom();
    return;
  }

  if (gesture.mode === "swipe" && event.touches.length === 1) {
    const touch = event.touches[0];
    const bounds = getPanBounds();
    const deltaX = getZoomAdjustedDelta(touch.clientX - gesture.startPointerX, window.innerWidth);
    const deltaY = getZoomAdjustedDelta(touch.clientY - gesture.startPointerY, window.innerHeight);

    state.panX = clamp(gesture.startPanX + deltaX, bounds.minX, bounds.maxX);
    state.panY = clamp(gesture.startPanY + deltaY, bounds.minY, bounds.maxY);
    applyPreviewTransform();
  }
}

function onTouchEnd(event) {
  if (event.touches.length === 0) {
    gesture.mode = null;
    return;
  }

  if (event.touches.length === 1) {
    gesture.mode = "swipe";
    gesture.startPointerX = event.touches[0].clientX;
    gesture.startPointerY = event.touches[0].clientY;
    gesture.startPanX = state.panX;
    gesture.startPanY = state.panY;
  }
}

document.addEventListener("touchstart", onTouchStart, { passive: true });
document.addEventListener("touchmove", onTouchMove, { passive: false });
document.addEventListener("touchend", onTouchEnd, { passive: true });
document.addEventListener("touchcancel", onTouchEnd, { passive: true });
window.addEventListener("resize", applyPreviewTransform);

if (!navigator.mediaDevices?.getUserMedia) {
  setStatus("このブラウザはカメラプレビューに対応していません。");
} else {
  setupCamera();
}
