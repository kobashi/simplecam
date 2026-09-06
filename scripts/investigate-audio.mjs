// Numerical investigation of production analysis and automation, without camera/audio I/O.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { AudioAutomation, getAudioFmDepth, getAudioGainMultiplier,
  getAudioShiftedSaturation, limitAudioFmDepth, limitAudioPolyphony } from "../audio-automation.mjs";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
function block(from, to) {
  const start = source.indexOf(from);
  const end = source.indexOf(to, start);
  assert.ok(start >= 0 && end > start, `Missing production block: ${from}`);
  return source.slice(start, end);
}
let calls = 0;
class Param {
  value = 0;
  cancelAndHoldAtTime() { calls++; }
  cancelScheduledValues() { calls++; }
  setValueAtTime() { calls++; }
  setTargetAtTime() { calls++; }
  linearRampToValueAtTime() { calls++; }
}
const automation = new AudioAutomation();
const state = {
  audioSaturationAmount: 0, audioEnabled: true, audioEnvelopeEnabled: true,
  audioGainAmount: 100, audioPolyphonyAmount: 12, audioThresholdAmount: 12,
  audioReleaseAmount: 2000, audioOctaveAmount: 0, audioTimbreIndex: 2,
  nextAudioTriggerAt: 0, lastAudioAnalysisAt: 0, lastAudioAnalysis: null,
  audioContext: { currentTime: 0, sampleRate: 48000, baseLatency: 0.01 },
  audioMasterGain: { gain: new Param() },
};
const pixels = new Uint8ClampedArray(64 * 36 * 4);
const context = vm.createContext({
  state, Float32Array, getAudioFmDepth, getAudioGainMultiplier,
  getAudioShiftedSaturation, limitAudioFmDepth, limitAudioPolyphony, audioAutomation: automation,
  clamp: (n, lo, hi) => Math.min(hi, Math.max(lo, n)),
  filteredPreview: { width: 64, height: 36 },
  audioAnalysisContext: { drawImage() {}, getImageData: () => ({ data: pixels }) },
  getAudioAnalysisSourceRect: () => ({ x: 0, y: 0, width: 64, height: 36 }),
  getAudioRgbRotation: () => ({ octaveOffsets: { b: -1, g: 0, r: 1 } }),
  getPerformanceProfile: () => ({ audioAnalysisIntervalMs: 1000 / 30 }),
  drawAudioMonitor() {},
});
vm.runInContext(block("const AUDIO_ANALYSIS_WIDTH", "const audioMonitorContext"), context);
vm.runInContext(block("function createSoftClipCurve", "function createAudioVoice"), context);
vm.runInContext(block("function getAudioNoteIndex", "function getAudioAnalysisSourceRect"), context);
vm.runInContext(block("function analyzeAudioFrame", "function drawAudioMonitor"), context);
vm.runInContext(block("function applyContinuousAudio", "async function toggleAudio"), context);
vm.runInContext(`
  function getAudioTimbre() { return AUDIO_TIMBRES[state.audioTimbreIndex]; }
  state.audioVoices = AUDIO_PLANES.flatMap(plane => AUDIO_NOTE_RATIOS.map(noteRatio => ({
    plane, noteRatio,
  })));
`, context);
state.audioVoices.forEach(voice => {
  voice.carrier = { frequency: new Param() };
  voice.modulator = { frequency: new Param() };
  voice.modulatorGain = { gain: new Param() };
  voice.voiceGain = { gain: new Param() };
});

function paint(rgb, count = pixels.length / 4) {
  pixels.fill(0);
  for (let i = 0; i < count; i++) pixels.set([...rgb, 255], i * 4);
}
function frame(time, rgb, count) {
  paint(rgb, count);
  state.audioContext.currentTime = time;
  context.updateAudioFromFrame(time * 1000);
  return state.lastAudioAnalysis;
}
function analyze(rgb, count) {
  paint(rgb, count);
  const result = context.analyzeAudioFrame();
  return {
    volume: result.volume, saturation: result.saturation,
    selectedNotes: result.notes.filter(note => note.active).length,
    totalDominance: result.notes.reduce((sum, note) => sum + note.dominance, 0),
  };
}
const analysis = {
  black: analyze([0, 0, 0]),
  oneBrightPixel: analyze([255, 128, 0], 1),
  fullBrightFrame: analyze([255, 128, 0]),
  whiteSat0: analyze([255, 255, 255]),
};
state.audioSaturationAmount = 100;
analysis.whiteSat100 = analyze([255, 255, 255]);
state.audioSaturationAmount = 0;

// Black arrives within the trigger cooldown: the envelope master remains independent of it.
frame(0, [255, 128, 0]);
frame(1 / 60, [0, 0, 0]);
const afterDark = [0, 0.05, 0.15, 0.3].map(elapsed => ({
  elapsedAfterDark: elapsed,
  master: automation.valueAt(state.audioMasterGain.gain, 1 / 60 + elapsed),
  voice: automation.valueAt(state.audioVoices[0].voiceGain.gain, 1 / 60 + elapsed),
}));
assert.ok(afterDark[3].voice > 0);
assert.ok(afterDark[3].master > afterDark[0].master);

// Black arrives after the cooldown: inactive voices keep their existing release.
frame(1, [255, 128, 0]);
frame(1.1, [0, 0, 0]);
const inactiveVoice = [1.1, 1.128, 1.2].map(time => ({
  time, gain: automation.valueAt(state.audioVoices[0].voiceGain.gain, time),
}));
assert.ok(inactiveVoice[1].gain > 0);

state.audioEnvelopeEnabled = false;
frame(2, [255, 128, 0]);
calls = 0;
for (let i = 1; i <= 60; i++) frame(2 + i / 60, [255, 128, 0]);
const stableCalls = calls;
calls = 0;
for (let i = 1; i <= 60; i++) frame(3 + i / 60, i % 2 ? [0, 0, 0] : [255, 128, 0]);
const alternatingCalls = calls;

const curve = context.createSoftClipCurve();
const outputGain = vm.runInContext("AUDIO_OUTPUT_GAIN", context);
const outputBound = Math.max(...curve.map(Math.abs)) * outputGain;
assert.ok(outputBound < 1);
const presets = vm.runInContext("AUDIO_TIMBRES", context);
const highest = vm.runInContext("AUDIO_BASE_C * (15 / 8) * 2 ** 3", context);

console.log(JSON.stringify({
  note: "Numerical model, not a browser render or hardware underrun measurement.",
  analysis, afterDark, inactiveVoice,
  automationApiCallsPer60Frames: { stable: stableCalls, alternating: alternatingCalls },
  waveShaperOutputBound: outputBound,
  fm: presets.filter(t => t.label.startsWith("FM")).map(t => ({
    label: t.label, configuredDepth: t.fmIndex,
    effectiveIndexAtFullSaturationAndDominance: t.fmIndex / t.modulatorRatio,
    highestCarrierAtOct2: highest,
    limitedDepthAtOct2: limitAudioFmDepth(t.fmIndex, highest, t.modulatorRatio, 48000),
  })),
}, null, 2));
