import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

// Exercise the production frame dispatcher without starting a camera or speaker.
const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const start = source.indexOf("function updateAudioFromFrame(");
const end = source.indexOf("async function toggleAudio()", start);
assert.ok(start >= 0 && end > start);

function harness() {
  const triggers = [];
  const state = {
    audioEnabled: true, audioEnvelopeEnabled: true,
    audioContext: { currentTime: 0 }, audioVoices: [], audioMasterGain: { gain: {} },
    audioThresholdAmount: 0, lastAudioAnalysis: null, lastAudioAnalysisAt: 0,
    nextAudioTriggerAt: 0, audioGainAmount: 0, audioCurveAmount: 100,
  };
  const context = vm.createContext({
    state, AUDIO_MAX_GAIN: 0.1, AUDIO_TRIGGER_INTERVAL: 0.08,
    getAudioGainExponent: () => 1.35,
    getAudioGainMultiplier: () => 1,
    clamp: (n, min, max) => Math.max(min, Math.min(max, n)),
    getPerformanceProfile: () => ({ audioAnalysisIntervalMs: 0 }),
    analyzeAudioFrame: () => ({ volume: 1 }),
    delta: 1,
    getAudioAnalysisDelta: () => context.delta,
    limitAudioPolyphony: (frame) => frame,
    drawAudioMonitor() {},
    audioAutomation: { target() {} },
    triggerEnvelopeAudio: (_frame, time) => triggers.push(time),
    applyContinuousAudio() {},
  });
  vm.runInContext(source.slice(start, end), context);
  const frame = (time) => {
    state.audioContext.currentTime = time;
    context.updateAudioFromFrame(time * 1000);
  };
  return { frame, context, state, triggers };
}

test("60fps changes cannot retrigger during the 80ms recovery interval", () => {
  const { frame, triggers } = harness();
  for (let i = 0; i < 60; i++) frame(i / 60);
  assert.ok(triggers.length > 1 && triggers.length <= 13);
  assert.equal(triggers[0], 0);
  for (let i = 1; i < triggers.length; i++) assert.ok(triggers[i] - triggers[i - 1] >= 0.08);
});

test("zero threshold does not retrigger an unchanged frame", () => {
  const { frame, context, triggers } = harness();
  frame(0);
  context.delta = 0;
  frame(0.1);
  frame(0.2);
  assert.deepEqual(triggers, [0]);
});

test("threshold and envelope OFF are respected", () => {
  const { frame, context, state, triggers } = harness();
  state.audioThresholdAmount = 12;
  context.delta = 0.1;
  frame(0);
  context.delta = 0.12;
  frame(0.1);
  state.audioEnvelopeEnabled = false;
  frame(0.2);
  assert.deepEqual(triggers, [0.1]);
});
