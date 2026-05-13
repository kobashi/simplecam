const video = document.getElementById("camera");
const previewShell = document.querySelector(".preview-shell");
const gestureSurface = document.getElementById("gestureSurface");
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
  pointers: new Map(),
  pointerGestureActive: false,
  touchGestureActive: false,
  startDistance: null,
  startZoom: 1,
  startMidpoint: null,
  startPanX: 0,
  startPanY: 0,
  lastSinglePoint: null,
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const PAN_SENSITIVITY = 1.2;

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
  void track;
  state.minZoom = 1;
  state.maxZoom = 3;
  state.zoom = 1;
}

async function syncNativeZoom() {
  return false;
}

function getPanBounds() {
  const width = previewShell.clientWidth || window.innerWidth;
  const height = previewShell.clientHeight || window.innerHeight;
  const rangeX = Math.max(0, ((width * state.zoom) - width) / 2);
  const rangeY = Math.max(0, ((height * state.zoom) - height) / 2);
  return {
    minX: -rangeX,
    maxX: rangeX,
    minY: -rangeY,
    maxY: rangeY,
  };
}

function applyPreviewTransform() {
  video.style.objectPosition = "center center";
  video.style.transform = `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.zoom})`;
}

function getPointDistance(points) {
  const [a, b] = points;
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY);
}

function getMidpoint(points) {
  const [a, b] = points;
  return {
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  };
}

function getPanDelta(deltaPx) {
  return deltaPx * PAN_SENSITIVITY;
}

function resetSinglePointerAnchor(point) {
  gesture.lastSinglePoint = point
    ? { clientX: point.clientX, clientY: point.clientY }
    : null;
}

function beginPinch(points) {
  gesture.startDistance = getPointDistance(points);
  gesture.startZoom = state.zoom;
  gesture.startMidpoint = getMidpoint(points);
  gesture.startPanX = state.panX;
  gesture.startPanY = state.panY;
}

function beginSwipe(point) {
  resetSinglePointerAnchor(point);
}

function handlePinchMove(points) {
  if (!gesture.startDistance || !gesture.startMidpoint) return;
  const distance = getPointDistance(points);
  const ratio = distance / gesture.startDistance;
  state.zoom = clamp(gesture.startZoom * ratio, state.minZoom, state.maxZoom);

  const midpoint = getMidpoint(points);
  const bounds = getPanBounds();
  const deltaX = getPanDelta(midpoint.x - gesture.startMidpoint.x);
  const deltaY = getPanDelta(midpoint.y - gesture.startMidpoint.y);
  state.panX = clamp(gesture.startPanX + deltaX, bounds.minX, bounds.maxX);
  state.panY = clamp(gesture.startPanY + deltaY, bounds.minY, bounds.maxY);
  applyPreviewTransform();
  syncNativeZoom();
}

function handleSwipeMove(point) {
  if (!gesture.lastSinglePoint) return;
  const bounds = getPanBounds();
  const deltaX = getPanDelta(point.clientX - gesture.lastSinglePoint.clientX);
  const deltaY = getPanDelta(point.clientY - gesture.lastSinglePoint.clientY);
  state.panX = clamp(state.panX + deltaX, bounds.minX, bounds.maxX);
  state.panY = clamp(state.panY + deltaY, bounds.minY, bounds.maxY);
  resetSinglePointerAnchor(point);
  applyPreviewTransform();
}

function onPointerDown(event) {
  if (event.pointerType === "mouse") return;
  gesture.pointerGestureActive = true;
  gesture.pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  video.setPointerCapture?.(event.pointerId);

  const points = [...gesture.pointers.values()];
  if (points.length === 1) {
    beginSwipe(points[0]);
    return;
  }

  if (points.length === 2) {
    beginPinch(points);
  }
}

function onPointerMove(event) {
  if (!gesture.pointerGestureActive) return;
  if (!gesture.pointers.has(event.pointerId)) return;
  event.preventDefault();

  gesture.pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  const points = [...gesture.pointers.values()];

  if (points.length >= 2 && gesture.startDistance && gesture.startMidpoint) {
    handlePinchMove(points.slice(0, 2));
    return;
  }

  if (points.length === 1 && gesture.lastSinglePoint) {
    handleSwipeMove(points[0]);
  }
}

function onPointerUpOrCancel(event) {
  if (!gesture.pointerGestureActive) return;
  gesture.pointers.delete(event.pointerId);
  video.releasePointerCapture?.(event.pointerId);

  const points = [...gesture.pointers.values()];
  if (points.length === 0) {
    gesture.pointerGestureActive = false;
    gesture.startDistance = null;
    gesture.startMidpoint = null;
    resetSinglePointerAnchor(null);
    return;
  }

  if (points.length === 1) {
    gesture.startDistance = null;
    gesture.startMidpoint = null;
    beginSwipe(points[0]);
  }
}

function onTouchStart(event) {
  gesture.touchGestureActive = true;
  if (event.touches.length === 1) {
    beginSwipe(event.touches[0]);
    return;
  }
  if (event.touches.length >= 2) {
    beginPinch([event.touches[0], event.touches[1]]);
  }
}

function onTouchMove(event) {
  if (!gesture.touchGestureActive) return;
  event.preventDefault();
  if (event.touches.length >= 2) {
    handlePinchMove([event.touches[0], event.touches[1]]);
    return;
  }
  if (event.touches.length === 1) {
    handleSwipeMove(event.touches[0]);
  }
}

function onTouchEnd(event) {
  if (!gesture.touchGestureActive) return;
  if (event.touches.length === 1) {
    gesture.startDistance = null;
    gesture.startMidpoint = null;
    beginSwipe(event.touches[0]);
    return;
  }
  if (event.touches.length === 0) {
    gesture.touchGestureActive = false;
    gesture.startDistance = null;
    gesture.startMidpoint = null;
    resetSinglePointerAnchor(null);
  }
}

const prefersTouchInput = navigator.maxTouchPoints > 0;

if (prefersTouchInput) {
  gestureSurface.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });
} else {
  gestureSurface.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointermove", onPointerMove, { passive: false });
  window.addEventListener("pointerup", onPointerUpOrCancel, { passive: true });
  window.addEventListener("pointercancel", onPointerUpOrCancel, { passive: true });
}
window.addEventListener("resize", applyPreviewTransform);

if (!navigator.mediaDevices?.getUserMedia) {
  setStatus("このブラウザはカメラプレビューに対応していません。");
} else {
  setupCamera();
}
