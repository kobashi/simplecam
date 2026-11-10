import test from "node:test";
import assert from "node:assert/strict";

import { calculateAnchoredPan, calculatePinchZoom } from "../zoom-math.mjs";

test("pinch zoom uses a smooth exponential curve up to 256x", () => {
  assert.equal(calculatePinchZoom({
    startZoom: 1,
    startDistance: 100,
    distance: 200,
    minZoom: 1,
    maxZoom: 256,
    exponent: 2,
  }), 4);

  assert.equal(calculatePinchZoom({
    startZoom: 128,
    startDistance: 100,
    distance: 200,
    minZoom: 1,
    maxZoom: 256,
    exponent: 2,
  }), 256);
});

test("pinch zoom clamps at the minimum without invalid distances", () => {
  assert.equal(calculatePinchZoom({
    startZoom: 4,
    startDistance: 100,
    distance: 25,
    minZoom: 1,
    maxZoom: 256,
    exponent: 2,
  }), 1);

  assert.equal(calculatePinchZoom({
    startZoom: 4,
    startDistance: 0,
    distance: 50,
    minZoom: 1,
    maxZoom: 256,
    exponent: 2,
  }), 4);
});

test("anchored pan keeps the content below an off-center pinch midpoint", () => {
  const startPan = 20;
  const startZoom = 2;
  const zoom = 8;
  const startMidpoint = 300;
  const midpoint = 320;
  const viewportCenter = 200;
  const pan = calculateAnchoredPan({
    startPan,
    startZoom,
    zoom,
    startMidpoint,
    midpoint,
    viewportCenter,
  });
  const sourceOffset = (startMidpoint - viewportCenter - startPan) / startZoom;

  assert.equal(viewportCenter + pan + (zoom * sourceOffset), midpoint);
});
