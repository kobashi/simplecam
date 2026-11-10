export function calculatePinchZoom({
  startZoom,
  startDistance,
  distance,
  minZoom,
  maxZoom,
  exponent,
}) {
  if (startDistance <= 0 || distance <= 0) {
    return startZoom;
  }

  const ratio = distance / startDistance;
  return Math.min(maxZoom, Math.max(minZoom, startZoom * (ratio ** exponent)));
}

export function calculateAnchoredPan({
  startPan,
  startZoom,
  zoom,
  startMidpoint,
  midpoint,
  viewportCenter,
}) {
  if (startZoom <= 0) {
    return startPan;
  }

  const zoomRatio = zoom / startZoom;
  return midpoint - viewportCenter
    - (zoomRatio * (startMidpoint - viewportCenter - startPan));
}

export function formatZoom(zoom) {
  const safeZoom = Number.isFinite(zoom) ? Math.max(1, zoom) : 1;
  const digits = safeZoom >= 100 ? 0 : 1;
  return `${safeZoom.toFixed(digits)}x`;
}
