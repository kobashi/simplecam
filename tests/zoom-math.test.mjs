import test from "node:test";
import assert from "node:assert/strict";

import { calculateAnchoredPan, calculatePinchZoom, formatZoom } from "../zoom-math.mjs";

test("pinch zoom uses a smooth exponential curve up to 512x", () => {
  assert.equal(calculatePinchZoom({
    startZoom: 1,
    startDistance: 100,
    distance: 200,
    minZoom: 1,
    maxZoom: 512,
    exponent: 2,
  }), 4);

  assert.equal(calculatePinchZoom({
    startZoom: 256,
    startDistance: 100,
    distance: 200,
    minZoom: 1,
    maxZoom: 512,
    exponent: 2,
  }), 512);
});

test("pinch zoom clamps at the minimum without invalid distances", () => {
  assert.equal(calculatePinchZoom({
    startZoom: 4,
    startDistance: 100,
    distance: 25,
    minZoom: 1,
    maxZoom: 512,
    exponent: 2,
  }), 1);

  assert.equal(calculatePinchZoom({
    startZoom: 4,
    startDistance: 0,
    distance: 50,
    minZoom: 1,
    maxZoom: 512,
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

test("zoom indicator formatting stays readable across the full range", () => {
  assert.equal(formatZoom(1), "1.0x");
  assert.equal(formatZoom(12.34), "12.3x");
  assert.equal(formatZoom(255.6), "256x");
  assert.equal(formatZoom(511.6), "512x");
  assert.equal(formatZoom(Number.NaN), "1.0x");
});
