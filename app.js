const video = document.getElementById("camera");
const statusPanel = document.getElementById("statusPanel");

const state = {
  stream: null,
  track: null,
  zoom: 1,
  minZoom: 1,
  maxZoom: 3,
  panX: 0,
  panY: 0,
  nativeZoomSupported: false,
  nativeZoomActive: false,
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
    state.nativeZoomSupported = true;
    state.minZoom = capabilities.zoom.min ?? 1;
    state.maxZoom = capabilities.zoom.max ?? 3;
    state.zoom = clamp(capabilities.zoom.min ?? 1, state.minZoom, state.maxZoom);
  } else {
    state.nativeZoomSupported = false;
    state.nativeZoomActive = false;
    state.minZoom = 1;
    state.maxZoom = 3;
    state.zoom = 1;
  }
}

async function syncNativeZoom() {
  if (!state.nativeZoomSupported || !state.track?.applyConstraints) return false;

  try {
    await state.track.applyConstraints({
      advanced: [{ zoom: state.zoom }],
    });
    state.nativeZoomActive = true;
    return true;
  } catch (error) {
    state.nativeZoomActive = false;
    console.warn("Native zoom was not applied.", error);
    return false;
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
  const scale = state.nativeZoomActive ? 1 : state.zoom;
  video.style.objectPosition = `${50 + state.panX}% ${50 + state.panY}%`;
  video.style.transform = `scale(${scale})`;
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

function getZoomAdjustedDelta(deltaPx, axisSizePx) {
  const percent = (deltaPx / axisSizePx) * 100;
  return percent;
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
  const deltaX = getZoomAdjustedDelta(midpoint.x - gesture.startMidpoint.x, window.innerWidth);
  const deltaY = getZoomAdjustedDelta(midpoint.y - gesture.startMidpoint.y, window.innerHeight);
  state.panX = clamp(gesture.startPanX + deltaX, bounds.minX, bounds.maxX);
  state.panY = clamp(gesture.startPanY + deltaY, bounds.minY, bounds.maxY);
  applyPreviewTransform();
  syncNativeZoom().then(() => applyPreviewTransform());
}

function handleSwipeMove(point) {
  if (!gesture.lastSinglePoint) return;
  const bounds = getPanBounds();
  const deltaX = getZoomAdjustedDelta(
    point.clientX - gesture.lastSinglePoint.clientX,
    window.innerWidth
  );
  const deltaY = getZoomAdjustedDelta(
    point.clientY - gesture.lastSinglePoint.clientY,
    window.innerHeight
  );
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

const isIOS =
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

if (isIOS) {
  video.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });
  window.addEventListener("touchend", onTouchEnd, { passive: true });
  window.addEventListener("touchcancel", onTouchEnd, { passive: true });
} else {
  video.addEventListener("pointerdown", onPointerDown, { passive: true });
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
