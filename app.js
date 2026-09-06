import {
  AudioAutomation,
  getAudioFmDepth,
  getAudioGainMultiplier,
  getAudioShiftedSaturation,
  limitAudioFmDepth,
  limitAudioPolyphony,
} from "./audio-automation.mjs?v=1.5.0";

const audioAutomation = new AudioAutomation();
const video = document.getElementById("camera");
const filteredPreview = document.getElementById("filteredPreview");
const previewShell = document.querySelector(".preview-shell");
const gestureSurface = document.getElementById("gestureSurface");
const audioToggle = document.getElementById("audioToggle");
const audioEnvelopeToggle = document.getElementById("audioEnvelopeToggle");
const audioRgbToggle = document.getElementById("audioRgbToggle");
const audioTimbreToggle = document.getElementById("audioTimbreToggle");
const economyToggle = document.getElementById("economyToggle");
const mirrorToggle = document.getElementById("mirrorToggle");
const controlsToggle = document.getElementById("controlsToggle");
const cameraToggle = document.getElementById("cameraToggle");
const fullscreenToggle = document.getElementById("fullscreenToggle");
const contrastThresholdSlider = document.getElementById("contrastThresholdSlider");
const trailDelaySlider = document.getElementById("trailDelaySlider");
const trailAmountSlider = document.getElementById("trailAmountSlider");
const audioThresholdSlider = document.getElementById("audioThresholdSlider");
const audioReleaseSlider = document.getElementById("audioReleaseSlider");
const audioOctaveSlider = document.getElementById("audioOctaveSlider");
const audioPolyphonySlider = document.getElementById("audioPolyphonySlider");
const audioGainSlider = document.getElementById("audioGainSlider");
const audioSaturationSlider = document.getElementById("audioSaturationSlider");
const contrastThresholdValue = document.getElementById("contrastThresholdValue");
const trailDelayValue = document.getElementById("trailDelayValue");
const trailAmountValue = document.getElementById("trailAmountValue");
const audioThresholdValue = document.getElementById("audioThresholdValue");
const audioReleaseValue = document.getElementById("audioReleaseValue");
const audioOctaveValue = document.getElementById("audioOctaveValue");
const audioPolyphonyValue = document.getElementById("audioPolyphonyValue");
const audioGainValue = document.getElementById("audioGainValue");
const audioSaturationValue = document.getElementById("audioSaturationValue");
const audioMonitor = document.getElementById("audioMonitor");
const audioMonitorValue = document.getElementById("audioMonitorValue");
const statusPanel = document.getElementById("statusPanel");
const audioRegion = document.getElementById("audioRegion");
const audioRegionHandles = [...audioRegion.querySelectorAll(".audio-region-handle")];

const gl = filteredPreview.getContext("webgl", {
  alpha: false,
  antialias: false,
  depth: false,
  powerPreference: "low-power",
  premultipliedAlpha: false,
  preserveDrawingBuffer: false,
});

const state = {
  stream: null,
  track: null,
  zoom: 1,
  minZoom: 1,
  maxZoom: 3,
  panX: 0,
  panY: 0,
  renderFrameId: null,
  renderScheduler: null,
  lastFrameAt: 0,
  nextFrameAt: 0,
  contrastThresholdAmount: Number(contrastThresholdSlider.value),
  trailDelayAmount: Number(trailDelaySlider.value),
  trailAmount: Number(trailAmountSlider.value),
  preferredFacingMode: "environment",
  activeFacingMode: "environment",
  canSwitchCamera: true,
  isSwitchingCamera: false,
  audioEnabled: false,
  audioEnvelopeEnabled: false,
  audioRgbRotationIndex: 0,
  audioTimbreIndex: 2,
  audioTimbreChangeToken: 0,
  economyMode: "normal",
  mirrorEnabled: false,
  performanceChangeToken: 0,
  pageVisible: !document.hidden,
  visibilityChangeToken: 0,
  controlsVisible: true,
  audioThresholdAmount: Number(audioThresholdSlider.value),
  audioReleaseAmount: Number(audioReleaseSlider.value),
  audioOctaveAmount: Number(audioOctaveSlider.value),
  audioPolyphonyAmount: Number(audioPolyphonySlider.value),
  audioGainAmount: Number(audioGainSlider.value),
  audioSaturationAmount: Number(audioSaturationSlider.value),
  audioContext: null,
  audioMasterGain: null,
  audioDcFilter: null,
  audioSoftClipper: null,
  audioLimiter: null,
  audioOutputGain: null,
  audioVoices: null,
  lastAudioAnalysis: null,
  lastAudioAnalysisAt: 0,
  nextAudioTriggerAt: 0,
  lastAudioMonitorAt: 0,
  lastVoicedFrame: null,
  audioRegion: {
    left: 0.2,
    top: 0.2,
    right: 0.8,
    bottom: 0.8,
    activeCorner: null,
    activePointerId: null,
  },
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
const CONTRAST_MAX_GAIN = 1.85;
const CONTRAST_MAX_OFFSET = 18 / 255;
const CONTRAST_THRESHOLD_MAX = 0.58;
const TRAIL_MAX_BLEND = 0.9925;
const TRAIL_DELAY_BUFFER_SIZE = 30;
const TRAIL_DELAY_BASE_INTERVAL_MS = 1000 / TRAIL_DELAY_BUFFER_SIZE;
const TRAIL_REFERENCE_FRAME_MS = 1000 / 60;
const PERFORMANCE_MODE_ORDER = ["normal", "economy", "super"];
const PERFORMANCE_PROFILES = {
  normal: {
    label: "ECO OFF",
    canvasScale: 1,
    renderFps: 60,
    audioAnalysisIntervalMs: 1000 / 30,
    camera: { width: 1920, height: 1080, frameRate: 60 },
    delayPixelBudget: 1280 * 720,
  },
  economy: {
    label: "ECO ON",
    canvasScale: 0.6,
    renderFps: 24,
    audioAnalysisIntervalMs: 100,
    camera: { width: 1280, height: 720, frameRate: 24 },
    delayPixelBudget: 960 * 540,
  },
  super: {
    label: "ECO MAX",
    canvasScale: 0.3,
    renderFps: 12,
    audioAnalysisIntervalMs: 200,
    camera: { width: 960, height: 540, frameRate: 12 },
    delayPixelBudget: 640 * 360,
  },
};
const AUDIO_ANALYSIS_WIDTH = 64;
const AUDIO_ANALYSIS_HEIGHT = 36;
const AUDIO_MAX_GAIN = 0.1;
const AUDIO_GAIN_EXPONENT = 1.35;
const AUDIO_ATTACK_TIME = 0.028;
const AUDIO_TRIGGER_INTERVAL = 0.08;
const AUDIO_SCHEDULE_AHEAD_MIN = 0.008;
const AUDIO_SCHEDULE_AHEAD_MAX = 0.02;
const AUDIO_VOICE_MIX_GAIN = 1 / 3;
const AUDIO_OUTPUT_GAIN = 0.78;
const AUDIO_SOFT_CLIP_DRIVE = 1.45;
const AUDIO_MONITOR_INTERVAL_MS = 1000 / 15;
const AUDIO_PITCH_SATURATION_THRESHOLD = 0.12;
const AUDIO_REGION_MIN_SIZE = 0.12;
const AUDIO_REGION_HANDLE_INSET_PX = 22;
const AUDIO_NOTE_RATIOS = [1, 5 / 4, 3 / 2, 15 / 8];
const AUDIO_BASE_C = 261.63;
const AUDIO_PLANES = [
  { key: "b", channel: 2 },
  { key: "g", channel: 1 },
  { key: "r", channel: 0 },
];
const AUDIO_RGB_ROTATIONS = [
  { label: "BGR", octaveOffsets: { b: -1, g: 0, r: 1 } },
  { label: "GRB", octaveOffsets: { g: -1, r: 0, b: 1 } },
  { label: "RBG", octaveOffsets: { r: -1, b: 0, g: 1 } },
];
const AUDIO_TIMBRES = [
  { label: "SIN", carrierType: "sine", modulatorType: "sine", fmIndex: 0, modulatorRatio: 1, dominancePower: 1 },
  { label: "TRI", carrierType: "triangle", modulatorType: "sine", fmIndex: 0.7, modulatorRatio: 1, dominancePower: 1 },
  { label: "FM 1:1", carrierType: "sine", modulatorType: "sine", fmIndex: 3, modulatorRatio: 1, dominancePower: 0.5 },
  { label: "FM 3:1", carrierType: "sine", modulatorType: "sine", fmIndex: 3.5, modulatorRatio: 3, dominancePower: 0.5 },
  { label: "FM 3:2", carrierType: "sine", modulatorType: "sine", fmIndex: 2.5, modulatorRatio: 1.5, dominancePower: 0.5 },
  { label: "FM SQRT2", carrierType: "sine", modulatorType: "sine", fmIndex: 2, modulatorRatio: Math.SQRT2, dominancePower: 0.5 },
];

const audioMonitorContext = audioMonitor.getContext("2d", { alpha: true });

const audioAnalysisCanvas = document.createElement("canvas");
audioAnalysisCanvas.width = AUDIO_ANALYSIS_WIDTH;
audioAnalysisCanvas.height = AUDIO_ANALYSIS_HEIGHT;
const audioAnalysisContext = audioAnalysisCanvas.getContext("2d", {
  alpha: false,
  willReadFrequently: true,
});

const VERTEX_SHADER_SOURCE = `
  attribute vec2 a_position;
  attribute vec2 a_texCoord;

  varying vec2 v_texCoord;

  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
    v_texCoord = a_texCoord;
  }
`;

const ACCUMULATE_FRAGMENT_SHADER_SOURCE = `
  precision mediump float;

  uniform sampler2D u_videoTexture;
  uniform sampler2D u_trailTexture;
  uniform vec2 u_uvScale;
  uniform vec2 u_uvOffset;
  uniform float u_contrastEnabled;
  uniform float u_threshold;
  uniform float u_contrastStrength;
  uniform float u_gain;
  uniform float u_lift;
  uniform float u_trailEnabled;
  uniform float u_trailAmount;

  varying vec2 v_texCoord;

  vec3 applyContrast(vec3 color) {
    float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));

    if (luma < u_threshold) {
      return vec3(0.0);
    }

    vec3 normalizedColor = (color - vec3(u_threshold)) / max(1.0 - u_threshold, 0.0001);
    vec3 boostedColor = clamp(((normalizedColor - vec3(0.5)) * u_gain) + vec3(0.5 + u_lift), 0.0, 1.0);
    return mix(color, boostedColor, u_contrastStrength);
  }

  void main() {
    vec2 sampleUv = u_uvOffset + (v_texCoord * u_uvScale);
    vec3 currentColor = texture2D(u_videoTexture, sampleUv).rgb;

    if (u_contrastEnabled > 0.5) {
      currentColor = applyContrast(currentColor);
    }

    vec3 color = currentColor;

    if (u_trailEnabled > 0.5) {
      vec4 trail = texture2D(u_trailTexture, v_texCoord);
      float trailAmount = u_trailAmount * trail.a;

      color = mix(currentColor, trail.rgb, trailAmount);

      gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
      return;
    }

    gl_FragColor = vec4(color, 1.0);
  }
`;

const DISPLAY_FRAGMENT_SHADER_SOURCE = `
  precision mediump float;

  uniform sampler2D u_displayTexture;

  varying vec2 v_texCoord;

  void main() {
    gl_FragColor = texture2D(u_displayTexture, v_texCoord);
  }
`;

function setStatus(message) {
  statusPanel.textContent = message;
  statusPanel.classList.toggle("is-hidden", !message);
}

function updateCameraToggle() {
  const isVisible = state.canSwitchCamera;
  cameraToggle.classList.toggle("is-hidden", !isVisible);
  cameraToggle.disabled = !isVisible || state.isSwitchingCamera;
  cameraToggle.textContent = state.activeFacingMode === "user" ? "FRONT" : "REAR";
}

function updateAudioToggle() {
  audioToggle.setAttribute("aria-pressed", state.audioEnabled ? "true" : "false");
  audioToggle.textContent = state.audioEnabled ? "SND ON" : "SND OFF";
}

function updateAudioEnvelopeToggle() {
  audioEnvelopeToggle.setAttribute("aria-pressed", state.audioEnvelopeEnabled ? "true" : "false");
  audioEnvelopeToggle.textContent = state.audioEnvelopeEnabled ? "ENV ON" : "ENV OFF";
}

function updateAudioOptionButtons() {
  audioRgbToggle.textContent = `RGB ${getAudioRgbRotation().label}`;
  audioTimbreToggle.textContent = `TONE ${getAudioTimbre().label}`;
  audioTimbreToggle.setAttribute("aria-label", `Change synthesized timbre. Current: ${getAudioTimbre().label}`);
}

function updateEconomyToggle() {
  const profile = getPerformanceProfile();
  economyToggle.dataset.mode = state.economyMode;
  economyToggle.setAttribute("aria-pressed", state.economyMode === "normal" ? "false" : "true");
  economyToggle.setAttribute("aria-label", `Economy mode: ${state.economyMode}`);
  economyToggle.textContent = profile.label;
}

function updateMirrorToggle() {
  mirrorToggle.setAttribute("aria-pressed", state.mirrorEnabled ? "true" : "false");
  mirrorToggle.textContent = state.mirrorEnabled ? "MIR ON" : "MIR OFF";
}

function updateAudioRegion() {
  const { left, top, right, bottom } = state.audioRegion;
  audioRegion.style.left = `${left * 100}%`;
  audioRegion.style.top = `${top * 100}%`;
  audioRegion.style.width = `${(right - left) * 100}%`;
  audioRegion.style.height = `${(bottom - top) * 100}%`;
}

function updateControlsToggle() {
  document.body.classList.toggle("controls-hidden", !state.controlsVisible);
  controlsToggle.setAttribute("aria-pressed", state.controlsVisible ? "true" : "false");
  controlsToggle.textContent = state.controlsVisible ? "UI ON" : "UI OFF";
}

function getAudioRgbRotation() {
  return AUDIO_RGB_ROTATIONS[state.audioRgbRotationIndex];
}

function getAudioTimbre() {
  return AUDIO_TIMBRES[state.audioTimbreIndex];
}

function createSoftClipCurve() {
  const sampleCount = 1024;
  const curve = new Float32Array(sampleCount);
  const normalization = Math.tanh(AUDIO_SOFT_CLIP_DRIVE);

  for (let index = 0; index < sampleCount; index += 1) {
    const input = ((index / (sampleCount - 1)) * 2) - 1;
    curve[index] = Math.tanh(input * AUDIO_SOFT_CLIP_DRIVE) / normalization;
  }

  return curve;
}

function createAudioVoice(audioContext) {
  const carrier = audioContext.createOscillator();
  const modulator = audioContext.createOscillator();
  const modulatorGain = audioContext.createGain();
  const voiceGain = audioContext.createGain();

  const timbre = getAudioTimbre();
  carrier.type = timbre.carrierType;
  modulator.type = timbre.modulatorType;
  voiceGain.gain.value = 0;
  modulatorGain.gain.value = 0;

  modulator.connect(modulatorGain);
  modulatorGain.connect(carrier.frequency);
  carrier.connect(voiceGain);
  carrier.start();
  modulator.start();

  return { carrier, modulator, modulatorGain, voiceGain };
}

function ensureAudioGraph() {
  if (state.audioContext) {
    return;
  }

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextConstructor) {
    throw new Error("WebAudio is not supported.");
  }

  const audioContext = new AudioContextConstructor({ latencyHint: "balanced" });
  const audioMasterGain = audioContext.createGain();
  const audioDcFilter = audioContext.createBiquadFilter();
  const audioLimiter = audioContext.createDynamicsCompressor();
  const audioSoftClipper = audioContext.createWaveShaper();
  const audioOutputGain = audioContext.createGain();
  const audioVoices = AUDIO_PLANES.flatMap((plane) => (
    AUDIO_NOTE_RATIOS.map((noteRatio, noteIndex) => ({
      plane,
      noteIndex,
      noteRatio,
      ...createAudioVoice(audioContext),
    }))
  ));

  audioMasterGain.gain.value = 0;
  audioDcFilter.type = "highpass";
  audioDcFilter.frequency.value = 24;
  audioDcFilter.Q.value = 0.7;
  audioLimiter.threshold.value = -14;
  audioLimiter.knee.value = 18;
  audioLimiter.ratio.value = 10;
  audioLimiter.attack.value = 0.004;
  audioLimiter.release.value = 0.16;
  audioSoftClipper.curve = createSoftClipCurve();
  audioSoftClipper.oversample = "2x";
  audioOutputGain.gain.value = AUDIO_OUTPUT_GAIN;

  audioVoices.forEach((voice) => {
    voice.voiceGain.connect(audioMasterGain);
  });
  audioMasterGain.connect(audioDcFilter);
  audioDcFilter.connect(audioLimiter);
  audioLimiter.connect(audioSoftClipper);
  audioSoftClipper.connect(audioOutputGain);
  audioOutputGain.connect(audioContext.destination);

  state.audioContext = audioContext;
  state.audioMasterGain = audioMasterGain;
  state.audioDcFilter = audioDcFilter;
  state.audioSoftClipper = audioSoftClipper;
  state.audioLimiter = audioLimiter;
  state.audioOutputGain = audioOutputGain;
  state.audioVoices = audioVoices;
}

function getAudioNoteIndex(value) {
  return Math.min(3, Math.floor(clamp(value / 255, 0, 1) * 4));
}

function getAudioAnalysisSourceRect() {
  const shellWidth = previewShell.clientWidth || window.innerWidth;
  const shellHeight = previewShell.clientHeight || window.innerHeight;
  const mirrorDirection = state.mirrorEnabled ? -1 : 1;
  const mapScreenXToCanvas = (screenX) => (
    0.5 + (mirrorDirection * (((screenX - 0.5) - (state.panX / shellWidth)) / state.zoom))
  );
  const mapScreenYToCanvas = (screenY) => (
    0.5 + (((screenY - 0.5) - (state.panY / shellHeight)) / state.zoom)
  );
  const mappedLeft = mapScreenXToCanvas(state.audioRegion.left);
  const mappedRight = mapScreenXToCanvas(state.audioRegion.right);
  const sourceLeft = clamp(Math.min(mappedLeft, mappedRight), 0, 1);
  const sourceRight = clamp(Math.max(mappedLeft, mappedRight), 0, 1);
  const sourceTop = clamp(mapScreenYToCanvas(state.audioRegion.top), 0, 1);
  const sourceBottom = clamp(mapScreenYToCanvas(state.audioRegion.bottom), 0, 1);
  const sourceX = clamp(sourceLeft * filteredPreview.width, 0, filteredPreview.width - 1);
  const sourceY = clamp(sourceTop * filteredPreview.height, 0, filteredPreview.height - 1);
  const sourceRightPx = clamp(sourceRight * filteredPreview.width, sourceX + 1, filteredPreview.width);
  const sourceBottomPx = clamp(sourceBottom * filteredPreview.height, sourceY + 1, filteredPreview.height);

  return {
    x: sourceX,
    y: sourceY,
    width: sourceRightPx - sourceX,
    height: sourceBottomPx - sourceY,
  };
}

function analyzeAudioFrame() {
  if (!audioAnalysisContext || filteredPreview.width <= 0 || filteredPreview.height <= 0) {
    return null;
  }

  const source = getAudioAnalysisSourceRect();
  audioAnalysisContext.drawImage(
    filteredPreview,
    source.x,
    source.y,
    source.width,
    source.height,
    0,
    0,
    AUDIO_ANALYSIS_WIDTH,
    AUDIO_ANALYSIS_HEIGHT,
  );
  const { data } = audioAnalysisContext.getImageData(0, 0, AUDIO_ANALYSIS_WIDTH, AUDIO_ANALYSIS_HEIGHT);
  let maxBrightness = 0;
  let saturationSum = 0;
  let saturatedPixels = 0;
  const noteBins = AUDIO_PLANES.flatMap((plane) => (
    AUDIO_NOTE_RATIOS.map((noteRatio, noteIndex) => ({
      key: `${plane.key}${noteIndex}`,
      maxValue: 0,
      pixels: 0,
    }))
  ));
  const pixelCount = AUDIO_ANALYSIS_WIDTH * AUDIO_ANALYSIS_HEIGHT;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const pixelMax = Math.max(r, g, b);
    const pixelMin = Math.min(r, g, b);
    const saturation = pixelMax > 0 ? (pixelMax - pixelMin) / pixelMax : 0;
    const shiftedSaturation = getAudioShiftedSaturation(saturation, state.audioSaturationAmount);

    maxBrightness = Math.max(maxBrightness, pixelMax);

    if (pixelMax > 0) {
      saturationSum += shiftedSaturation;
      saturatedPixels += 1;
    }

    if (pixelMax <= 0 || shiftedSaturation < AUDIO_PITCH_SATURATION_THRESHOLD) {
      continue;
    }

    AUDIO_PLANES.forEach((plane, planeIndex) => {
      const value = data[index + plane.channel];
      const noteIndex = getAudioNoteIndex(value);
      const noteBin = noteBins[(planeIndex * AUDIO_NOTE_RATIOS.length) + noteIndex];

      noteBin.maxValue = Math.max(noteBin.maxValue, value);
      noteBin.pixels += 1;
    });
  }

  return {
    notes: noteBins.map((noteBin) => ({
      key: noteBin.key,
      intensity: noteBin.maxValue / 255,
      dominance: noteBin.pixels / pixelCount,
      active: noteBin.pixels > 0,
    })),
    volume: clamp(maxBrightness / 255, 0, 1),
    saturation: saturatedPixels > 0 ? clamp(saturationSum / saturatedPixels, 0, 1) : 0,
  };
}

function getAudioAnalysisDelta(currentFrame, previousFrame) {
  if (!previousFrame) {
    return 1;
  }

  const volumeDelta = Math.abs(currentFrame.volume - previousFrame.volume);
  const saturationDelta = Math.abs(currentFrame.saturation - previousFrame.saturation);
  const noteDelta = currentFrame.notes.reduce((largestDelta, note, index) => {
    const previousNote = previousFrame.notes[index];
    const intensityDelta = Math.abs(note.intensity - previousNote.intensity);
    const dominanceDelta = Math.abs(note.dominance - previousNote.dominance);
    return Math.max(largestDelta, intensityDelta, dominanceDelta);
  }, 0);

  return Math.max(volumeDelta, saturationDelta, noteDelta);
}

function getAudioVoiceFrequency(voice) {
  const octaveOffset = getAudioRgbRotation().octaveOffsets[voice.plane.key];
  return AUDIO_BASE_C * voice.noteRatio * (2 ** (octaveOffset + state.audioOctaveAmount));
}

function getAudioScheduleTime() {
  const baseLatency = Number.isFinite(state.audioContext?.baseLatency)
    ? state.audioContext.baseLatency
    : AUDIO_SCHEDULE_AHEAD_MIN;
  const lookAhead = clamp(baseLatency * 0.5, AUDIO_SCHEDULE_AHEAD_MIN, AUDIO_SCHEDULE_AHEAD_MAX);
  return state.audioContext.currentTime + lookAhead;
}

function drawAudioMonitor(frame = null, renderedAt = performance.now(), force = false) {
  if (!audioMonitorContext || (!force && renderedAt - state.lastAudioMonitorAt < AUDIO_MONITOR_INTERVAL_MS)) {
    return;
  }

  state.lastAudioMonitorAt = renderedAt;
  const notes = frame?.notes ?? [];
  const activeCount = notes.reduce((count, note) => count + (note.active ? 1 : 0), 0);
  const width = audioMonitor.width;
  const height = audioMonitor.height;
  const padding = 5;
  const gap = 3;
  const barWidth = (width - (padding * 2) - (gap * 11)) / 12;

  audioMonitorValue.textContent = `${activeCount} / ${state.audioPolyphonyAmount}`;
  audioMonitor.setAttribute(
    "aria-label",
    `${activeCount} selected voices with a polyphony limit of ${state.audioPolyphonyAmount}`,
  );
  audioMonitorContext.clearRect(0, 0, width, height);

  for (let index = 0; index < 12; index += 1) {
    const note = notes[index];
    const x = padding + (index * (barWidth + gap));
    const level = note?.active
      ? clamp((note.intensity * 0.55) + (Math.sqrt(note.dominance) * 0.45), 0.12, 1)
      : 0;
    const barHeight = Math.max(2, (height - (padding * 2)) * level);

    audioMonitorContext.fillStyle = "rgba(210, 210, 210, 0.12)";
    audioMonitorContext.fillRect(x, padding, barWidth, height - (padding * 2));
    if (level > 0) {
      audioMonitorContext.fillStyle = "rgba(226, 226, 226, 0.68)";
      audioMonitorContext.fillRect(x, height - padding - barHeight, barWidth, barHeight);
    }
  }
}

function applyContinuousAudio(frame, now, masterGain) {
  const timbre = getAudioTimbre();
  audioAutomation.target(state.audioMasterGain.gain, masterGain, now, 0.035);

  state.audioVoices.forEach((voice, index) => {
    const note = frame.notes[index];
    const intensity = note.active ? note.intensity : 0;
    const dominance = note.active ? note.dominance : 0;
    const rawFmDepth = getAudioFmDepth(
      frame.saturation,
      dominance,
      timbre.fmIndex,
      timbre.dominancePower,
    );
    const voiceGain = note.active ? ((0.12 + (intensity * 0.88)) * dominance * AUDIO_VOICE_MIX_GAIN) : 0;
    const frequency = getAudioVoiceFrequency(voice);
    const fmDepth = limitAudioFmDepth(
      rawFmDepth,
      frequency,
      timbre.modulatorRatio,
      state.audioContext.sampleRate,
    );

    audioAutomation.target(voice.carrier.frequency, frequency, now, 0.045);
    audioAutomation.target(voice.modulator.frequency, frequency * timbre.modulatorRatio, now, 0.045);
    audioAutomation.target(voice.modulatorGain.gain, frequency * fmDepth, now, 0.045);
    audioAutomation.target(voice.voiceGain.gain, voiceGain, now, 0.045);
  });
}

function triggerEnvelopeAudio(frame, now, volumeScale) {
  const releaseTime = clamp(state.audioReleaseAmount / 1000, 0.02, 2);
  const timbre = getAudioTimbre();

  state.audioVoices.forEach((voice, index) => {
    const note = frame.notes[index];
    const intensity = note.active ? note.intensity : 0;
    const dominance = note.active ? note.dominance : 0;
    if (!note.active) {
      return;
    }

    const rawFmDepth = getAudioFmDepth(
      frame.saturation,
      dominance,
      timbre.fmIndex,
      timbre.dominancePower,
    );
    const peakGain = (0.12 + (intensity * 0.88))
      * dominance * AUDIO_VOICE_MIX_GAIN * volumeScale;
    const attackEnd = now + AUDIO_ATTACK_TIME;
    const releaseEnd = attackEnd + releaseTime;
    const frequency = getAudioVoiceFrequency(voice);
    const fmDepth = limitAudioFmDepth(
      rawFmDepth,
      frequency,
      timbre.modulatorRatio,
      state.audioContext.sampleRate,
    );

    audioAutomation.target(voice.carrier.frequency, frequency, now, 0.045);
    audioAutomation.target(voice.modulator.frequency, frequency * timbre.modulatorRatio, now, 0.045);
    audioAutomation.target(voice.modulatorGain.gain, frequency * fmDepth, now, 0.045);
    audioAutomation.ramp(voice.voiceGain.gain, now, [
      { value: peakGain, time: attackEnd },
      { value: 0, time: releaseEnd },
    ]);
  });
}

function updateAudioFromFrame(renderedAt = performance.now()) {
  if (!state.audioEnabled || !state.audioContext || !state.audioVoices) {
    return;
  }

  const { audioAnalysisIntervalMs } = getPerformanceProfile();
  if (audioAnalysisIntervalMs > 0 && renderedAt < state.lastAudioAnalysisAt) {
    return;
  }

  const frame = analyzeAudioFrame();
  if (!frame) {
    return;
  }

  const currentTime = state.audioContext.currentTime;
  const now = getAudioScheduleTime();
  const gainMultiplier = getAudioGainMultiplier(state.audioGainAmount);
  const volumeScale = frame.volume ** AUDIO_GAIN_EXPONENT;
  const masterGain = volumeScale * AUDIO_MAX_GAIN * gainMultiplier;
  const analysisDelta = getAudioAnalysisDelta(frame, state.lastAudioAnalysis);
  const triggerThreshold = clamp(state.audioThresholdAmount / 100, 0, 1);
  const voicedFrame = limitAudioPolyphony(frame, state.audioPolyphonyAmount);
  const hasActiveVoice = voicedFrame.notes.some((note) => note.active);
  const shouldTriggerEnvelope = state.audioEnvelopeEnabled
    && hasActiveVoice
    && analysisDelta > 0 && analysisDelta >= triggerThreshold
    && currentTime >= state.nextAudioTriggerAt;
  state.lastVoicedFrame = voicedFrame;
  drawAudioMonitor(voicedFrame, renderedAt);

  if (state.audioEnvelopeEnabled) {
    audioAutomation.target(
      state.audioMasterGain.gain,
      AUDIO_MAX_GAIN * gainMultiplier,
      now,
      0.05,
    );
    if (shouldTriggerEnvelope) {
      triggerEnvelopeAudio(voicedFrame, now, volumeScale);
      state.nextAudioTriggerAt = currentTime + AUDIO_TRIGGER_INTERVAL;
    }
  } else {
    applyContinuousAudio(voicedFrame, now, masterGain);
  }

  state.lastAudioAnalysis = frame;
  if (audioAnalysisIntervalMs <= 0) {
    state.lastAudioAnalysisAt = renderedAt;
  } else if (state.lastAudioAnalysisAt <= 0) {
    state.lastAudioAnalysisAt = renderedAt + audioAnalysisIntervalMs;
  } else {
    state.lastAudioAnalysisAt += audioAnalysisIntervalMs;
    if (state.lastAudioAnalysisAt <= renderedAt) {
      state.lastAudioAnalysisAt = renderedAt + audioAnalysisIntervalMs;
    }
  }
}

async function toggleAudio() {
  audioToggle.disabled = true;

  try {
    if (state.audioEnabled) {
      state.audioEnabled = false;
      state.lastAudioAnalysis = null;
      state.lastAudioAnalysisAt = 0;
      state.lastVoicedFrame = null;
      drawAudioMonitor(null, performance.now(), true);
      state.audioTimbreChangeToken += 1;
      updateAudioToggle();

      const now = state.audioContext.currentTime;
      audioAutomation.ramp(state.audioMasterGain.gain, now, [{ value: 0, time: now + 0.025 }]);
      await new Promise((resolve) => window.setTimeout(resolve, 30));

      const silentAt = state.audioContext.currentTime;
      audioAutomation.reset(state.audioMasterGain.gain, 0, silentAt);
      state.audioVoices.forEach((voice) => {
        audioAutomation.reset(voice.voiceGain.gain, 0, silentAt);
        audioAutomation.reset(voice.modulatorGain.gain, 0, silentAt);
      });
      try {
        await state.audioContext.suspend();
      } catch (error) {
        console.warn("Audio processing could not be suspended.", error);
      }
      return;
    }

    ensureAudioGraph();
    state.audioTimbreChangeToken += 1;
    applyAudioTimbreToVoices();
    const now = state.audioContext.currentTime;
    audioAutomation.reset(state.audioOutputGain.gain, AUDIO_OUTPUT_GAIN, now);
    await state.audioContext.resume();
    state.audioEnabled = true;
    state.nextAudioTriggerAt = 0;
    state.lastAudioAnalysis = null;
    state.lastAudioAnalysisAt = 0;
    state.lastVoicedFrame = null;
    drawAudioMonitor(null, performance.now(), true);
    updateAudioToggle();
  } catch (error) {
    console.error(error);
    state.audioEnabled = false;
    updateAudioToggle();
    setStatus("音響処理を開始できませんでした。");
  } finally {
    audioToggle.disabled = false;
  }
}

function toggleAudioEnvelope() {
  state.audioEnvelopeEnabled = !state.audioEnvelopeEnabled;
  state.nextAudioTriggerAt = 0;
  state.lastAudioAnalysis = null;
  if (
    state.audioEnvelopeEnabled
    && state.audioContext?.state === "running"
    && state.audioVoices
  ) {
    const now = getAudioScheduleTime();
    state.audioVoices.forEach((voice) => {
      audioAutomation.ramp(voice.voiceGain.gain, now, [
        { value: 0, time: now + 0.05 },
      ]);
    });
  }
  updateAudioEnvelopeToggle();
}

function rotateAudioRgbMapping() {
  state.audioRgbRotationIndex = (state.audioRgbRotationIndex + 1) % AUDIO_RGB_ROTATIONS.length;
  state.lastAudioAnalysis = null;
  updateAudioOptionButtons();
}

function applyAudioTimbreToVoices() {
  if (!state.audioVoices) {
    return;
  }

  const timbre = getAudioTimbre();
  const frame = state.lastVoicedFrame;
  const now = state.audioContext?.currentTime;
  state.audioVoices.forEach((voice, index) => {
    voice.carrier.type = timbre.carrierType;
    voice.modulator.type = timbre.modulatorType;
    if (frame && now !== undefined) {
      const note = frame.notes[index];
      const dominance = note.active ? note.dominance : 0;
      const frequency = getAudioVoiceFrequency(voice);
      const rawFmDepth = getAudioFmDepth(
        frame.saturation,
        dominance,
        timbre.fmIndex,
        timbre.dominancePower,
      );
      const fmDepth = limitAudioFmDepth(
        rawFmDepth,
        frequency,
        timbre.modulatorRatio,
        state.audioContext.sampleRate,
      );
      audioAutomation.target(voice.modulator.frequency, frequency * timbre.modulatorRatio, now, 0.025);
      audioAutomation.target(voice.modulatorGain.gain, frequency * fmDepth, now, 0.025);
    }
  });
}

function cycleAudioTimbre() {
  state.audioTimbreIndex = (state.audioTimbreIndex + 1) % AUDIO_TIMBRES.length;
  state.audioTimbreChangeToken += 1;
  const changeToken = state.audioTimbreChangeToken;
  state.lastAudioAnalysis = null;
  updateAudioOptionButtons();

  if (!state.audioContext || state.audioContext.state !== "running" || !state.audioOutputGain) {
    applyAudioTimbreToVoices();
    return;
  }

  const now = state.audioContext.currentTime;
  audioAutomation.ramp(state.audioOutputGain.gain, now, [{ value: 0, time: now + 0.025 }]);

  window.setTimeout(() => {
    if (changeToken !== state.audioTimbreChangeToken || !state.audioOutputGain) {
      return;
    }

    applyAudioTimbreToVoices();
    const resumeAt = state.audioContext.currentTime;
    audioAutomation.ramp(state.audioOutputGain.gain, resumeAt, [
      { value: AUDIO_OUTPUT_GAIN, time: resumeAt + 0.035 },
    ]);
  }, 30);
}

function getPerformanceProfile() {
  return PERFORMANCE_PROFILES[state.economyMode];
}

async function applyCameraPerformanceConstraints() {
  if (!state.track?.applyConstraints) {
    return;
  }

  const { width, height, frameRate } = getPerformanceProfile().camera;

  try {
    await state.track.applyConstraints({
      width: { ideal: width },
      height: { ideal: height },
      frameRate: { ideal: frameRate },
    });
  } catch (error) {
    console.warn("Camera performance constraints were not applied.", error);
  }
}

async function toggleEconomy() {
  const currentIndex = PERFORMANCE_MODE_ORDER.indexOf(state.economyMode);
  const changeToken = state.performanceChangeToken + 1;
  state.performanceChangeToken = changeToken;
  state.economyMode = PERFORMANCE_MODE_ORDER[(currentIndex + 1) % PERFORMANCE_MODE_ORDER.length];
  state.lastFrameAt = 0;
  state.nextFrameAt = 0;
  state.lastAudioAnalysisAt = 0;
  stopFilteredRender();
  updateEconomyToggle();
  resizeFilteredPreview(true);
  refreshFilterRendering();
  await applyCameraPerformanceConstraints();
  if (changeToken !== state.performanceChangeToken) {
    await applyCameraPerformanceConstraints();
  }
}

function toggleMirror() {
  state.mirrorEnabled = !state.mirrorEnabled;
  state.lastAudioAnalysis = null;
  updateMirrorToggle();
  applyPreviewTransform();
}

function toggleControlsVisibility() {
  state.controlsVisible = !state.controlsVisible;
  updateControlsToggle();
}

function updateFullscreenButton() {
  const isFullscreen = Boolean(document.fullscreenElement);
  fullscreenToggle.textContent = isFullscreen ? "EXIT" : "FULL";
}

function updateViewportMetrics() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  document.documentElement.style.setProperty("--app-height", `${viewportHeight}px`);
}

function refreshViewportLayout() {
  updateViewportMetrics();
  applyPreviewTransform();
  resizeFilteredPreview();
  syncFilterVisibility();
}

function onFullscreenChange() {
  updateFullscreenButton();
  refreshViewportLayout();
  window.requestAnimationFrame(refreshViewportLayout);
  window.setTimeout(refreshViewportLayout, 250);
}

async function onVisibilityChange() {
  const changeToken = state.visibilityChangeToken + 1;
  state.visibilityChangeToken = changeToken;
  state.pageVisible = !document.hidden;
  state.lastFrameAt = 0;
  state.nextFrameAt = 0;

  if (!state.pageVisible) {
    stopFilteredRender();
    video.pause();
    if (state.track) {
      state.track.enabled = false;
    }
    try {
      if (state.audioContext?.state === "running") {
        const now = state.audioContext.currentTime;
        audioAutomation.ramp(state.audioMasterGain.gain, now, [
          { value: 0, time: now + 0.02 },
        ]);
        await new Promise((resolve) => window.setTimeout(resolve, 25));
        if (changeToken === state.visibilityChangeToken && !state.pageVisible) {
          await state.audioContext.suspend();
        }
      }
    } catch (error) {
      console.warn("Audio processing could not be suspended.", error);
    }
    if (
      changeToken !== state.visibilityChangeToken
      && state.pageVisible
      && state.audioEnabled
      && state.audioContext?.state === "suspended"
    ) {
      await state.audioContext.resume().catch((error) => {
        console.warn("Audio processing could not resume automatically.", error);
      });
    }
    return;
  }

  if (state.track) {
    state.track.enabled = true;
  }

  try {
    if (state.stream) {
      await video.play();
    }
    if (changeToken !== state.visibilityChangeToken || !state.pageVisible) {
      video.pause();
      return;
    }
    if (state.audioEnabled && state.audioContext?.state === "suspended") {
      await state.audioContext.resume();
    }
  } catch (error) {
    console.warn("Media processing could not resume automatically.", error);
  }

  resetTrailTexture();
  refreshFilterRendering();
}

function createShader(shaderType, source) {
  if (!gl) return null;

  const shader = gl.createShader(shaderType);
  if (!shader) return null;

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    return shader;
  }

  console.error(gl.getShaderInfoLog(shader));
  gl.deleteShader(shader);
  return null;
}

function createProgram(vertexShader, fragmentShader) {
  if (!gl || !vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (gl.getProgramParameter(program, gl.LINK_STATUS)) {
    return program;
  }

  console.error(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return null;
}

function createTexture() {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

function createFramebuffer(texture) {
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  return framebuffer;
}

function setEmptyTexture(texture, width, height) {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
}

function bindQuadAttributes(program, quadBuffer) {
  const positionLocation = gl.getAttribLocation(program, "a_position");
  const texCoordLocation = gl.getAttribLocation(program, "a_texCoord");

  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(texCoordLocation);
  gl.vertexAttribPointer(texCoordLocation, 2, gl.FLOAT, false, 16, 8);
}

function createGlResources() {
  if (!gl) return null;

  const vertexShader = createShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const accumulateFragmentShader = createShader(gl.FRAGMENT_SHADER, ACCUMULATE_FRAGMENT_SHADER_SOURCE);
  const displayFragmentShader = createShader(gl.FRAGMENT_SHADER, DISPLAY_FRAGMENT_SHADER_SOURCE);
  const accumulateProgram = createProgram(vertexShader, accumulateFragmentShader);
  const displayProgram = createProgram(vertexShader, displayFragmentShader);

  if (!accumulateProgram || !displayProgram || !vertexShader || !accumulateFragmentShader || !displayFragmentShader) {
    return null;
  }

  gl.deleteShader(vertexShader);
  gl.deleteShader(accumulateFragmentShader);
  gl.deleteShader(displayFragmentShader);

  const videoTextureLocation = gl.getUniformLocation(accumulateProgram, "u_videoTexture");
  const trailTextureLocation = gl.getUniformLocation(accumulateProgram, "u_trailTexture");
  const uvScaleLocation = gl.getUniformLocation(accumulateProgram, "u_uvScale");
  const uvOffsetLocation = gl.getUniformLocation(accumulateProgram, "u_uvOffset");
  const contrastEnabledLocation = gl.getUniformLocation(accumulateProgram, "u_contrastEnabled");
  const thresholdLocation = gl.getUniformLocation(accumulateProgram, "u_threshold");
  const contrastStrengthLocation = gl.getUniformLocation(accumulateProgram, "u_contrastStrength");
  const gainLocation = gl.getUniformLocation(accumulateProgram, "u_gain");
  const liftLocation = gl.getUniformLocation(accumulateProgram, "u_lift");
  const trailEnabledLocation = gl.getUniformLocation(accumulateProgram, "u_trailEnabled");
  const trailAmountLocation = gl.getUniformLocation(accumulateProgram, "u_trailAmount");
  const displayTextureLocation = gl.getUniformLocation(displayProgram, "u_displayTexture");

  const quadBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1, -1, 0, 0,
       1, -1, 1, 0,
      -1,  1, 0, 1,
      -1,  1, 0, 1,
       1, -1, 1, 0,
       1,  1, 1, 1,
    ]),
    gl.STATIC_DRAW,
  );

  const videoTexture = createTexture();
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.bindTexture(gl.TEXTURE_2D, videoTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 255]),
  );

  const trailTextures = [createTexture(), createTexture()];
  const trailFramebuffers = trailTextures.map(createFramebuffer);
  const delayTextures = Array.from({ length: TRAIL_DELAY_BUFFER_SIZE }, createTexture);
  const delayFramebuffers = delayTextures.map(createFramebuffer);

  gl.useProgram(accumulateProgram);
  bindQuadAttributes(accumulateProgram, quadBuffer);

  gl.uniform1i(videoTextureLocation, 0);
  gl.uniform1i(trailTextureLocation, 1);
  gl.uniform1f(gainLocation, CONTRAST_MAX_GAIN);
  gl.uniform1f(liftLocation, CONTRAST_MAX_OFFSET);

  gl.useProgram(displayProgram);
  bindQuadAttributes(displayProgram, quadBuffer);
  gl.uniform1i(displayTextureLocation, 0);

  gl.clearColor(0, 0, 0, 1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  return {
    accumulateProgram,
    displayProgram,
    quadBuffer,
    videoTexture,
    trailTextures,
    trailFramebuffers,
    delayTextures,
    delayFramebuffers,
    delayFrameTimestamps: Array(TRAIL_DELAY_BUFFER_SIZE).fill(0),
    trailReadIndex: 0,
    delayWriteIndex: 0,
    delayFrameCount: 0,
    lastDelayCaptureAt: 0,
    trailSize: { width: 1, height: 1 },
    delaySize: { width: 1, height: 1 },
    uvScaleLocation,
    uvOffsetLocation,
    contrastEnabledLocation,
    thresholdLocation,
    contrastStrengthLocation,
    trailEnabledLocation,
    trailAmountLocation,
    displayTextureLocation,
  };
}

const glResources = createGlResources();
const filtersAvailable = Boolean(gl && glResources);

function updateFilterAvailability() {
  contrastThresholdSlider.disabled = !filtersAvailable;
  trailDelaySlider.disabled = !filtersAvailable;
  trailAmountSlider.disabled = !filtersAvailable;
  audioThresholdSlider.disabled = !filtersAvailable;
  audioReleaseSlider.disabled = !filtersAvailable;
  audioOctaveSlider.disabled = !filtersAvailable;
  audioPolyphonySlider.disabled = !filtersAvailable;
  audioGainSlider.disabled = !filtersAvailable;
  audioSaturationSlider.disabled = !filtersAvailable;
}

function formatStrength(value) {
  return String(Math.round(value));
}

function updateTrailControls() {
  contrastThresholdSlider.value = String(state.contrastThresholdAmount);
  trailDelaySlider.value = String(state.trailDelayAmount);
  trailAmountSlider.value = String(state.trailAmount);
  audioThresholdSlider.value = String(state.audioThresholdAmount);
  audioReleaseSlider.value = String(state.audioReleaseAmount);
  audioOctaveSlider.value = String(state.audioOctaveAmount);
  audioPolyphonySlider.value = String(state.audioPolyphonyAmount);
  audioGainSlider.value = String(state.audioGainAmount);
  audioSaturationSlider.value = String(state.audioSaturationAmount);
  contrastThresholdValue.textContent = formatStrength(state.contrastThresholdAmount);
  trailDelayValue.textContent = formatStrength(state.trailDelayAmount);
  trailAmountValue.textContent = formatStrength(state.trailAmount);
  audioThresholdValue.textContent = formatStrength(state.audioThresholdAmount);
  audioReleaseValue.textContent = formatStrength(state.audioReleaseAmount);
  audioOctaveValue.textContent = state.audioOctaveAmount > 0
    ? `+${state.audioOctaveAmount}`
    : formatStrength(state.audioOctaveAmount);
  audioPolyphonyValue.textContent = formatStrength(state.audioPolyphonyAmount);
  audioGainValue.textContent = formatStrength(state.audioGainAmount);
  audioSaturationValue.textContent = formatStrength(state.audioSaturationAmount);
}

function shouldRenderFilteredPreview() {
  return filtersAvailable;
}

function syncFilterVisibility() {
  const filteredActive = shouldRenderFilteredPreview();
  video.classList.toggle("is-hidden", filteredActive);
  filteredPreview.classList.toggle("is-hidden", !filteredActive);
  filteredPreview.style.opacity = filteredActive ? "1" : "0";
}

function getDelayTextureSize() {
  const canvasWidth = filteredPreview.width || 1;
  const canvasHeight = filteredPreview.height || 1;
  const pixelBudget = getPerformanceProfile().delayPixelBudget;
  const reduction = Math.min(1, Math.sqrt(pixelBudget / (canvasWidth * canvasHeight)));

  return {
    width: Math.max(1, Math.round(canvasWidth * reduction)),
    height: Math.max(1, Math.round(canvasHeight * reduction)),
  };
}

function resetDelayBuffer(forceResize = false) {
  const targetSize = state.trailDelayAmount > 0
    ? getDelayTextureSize()
    : { width: 1, height: 1 };
  const sizeChanged = targetSize.width !== glResources.delaySize.width
    || targetSize.height !== glResources.delaySize.height;

  if (forceResize || sizeChanged) {
    glResources.delayTextures.forEach((texture, index) => {
      setEmptyTexture(texture, targetSize.width, targetSize.height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, glResources.delayFramebuffers[index]);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    glResources.delaySize = targetSize;
  }

  glResources.delayWriteIndex = 0;
  glResources.delayFrameCount = 0;
  glResources.delayFrameTimestamps.fill(0);
  glResources.lastDelayCaptureAt = 0;
}

function resetTrailTexture() {
  if (!filtersAvailable) return;

  const width = filteredPreview.width || 1;
  const height = filteredPreview.height || 1;

  glResources.trailTextures.forEach((texture, index) => {
    setEmptyTexture(texture, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, glResources.trailFramebuffers[index]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  });

  resetDelayBuffer(true);

  gl.clearColor(0, 0, 0, 1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  glResources.trailReadIndex = 0;
  glResources.trailSize = { width, height };
  state.lastFrameAt = 0;
  state.nextFrameAt = 0;
}

async function toggleFullscreen() {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }

    await previewShell.requestFullscreen?.();
  } catch (error) {
    console.error(error);
    setStatus("全画面表示に切り替えできませんでした。");
  }
}

function stopCurrentStream() {
  state.stream?.getTracks().forEach((track) => track.stop());
  state.stream = null;
  state.track = null;
}

function getVideoConstraints(facingMode, exact = false) {
  const { width, height, frameRate } = getPerformanceProfile().camera;

  return {
    facingMode: exact ? { exact: facingMode } : { ideal: facingMode },
    width: { ideal: width },
    height: { ideal: height },
    frameRate: { ideal: frameRate },
  };
}

async function openCameraStream(facingMode) {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: getVideoConstraints(facingMode, true),
    });
  } catch (error) {
    return navigator.mediaDevices.getUserMedia({
      audio: false,
      video: getVideoConstraints(facingMode, false),
    });
  }
}

async function refreshAvailableCameras() {
  try {
    await navigator.mediaDevices.enumerateDevices();
    state.canSwitchCamera = true;
  } catch (error) {
    state.canSwitchCamera = true;
  }

  updateCameraToggle();
}

async function startCameraStream(facingMode = state.preferredFacingMode) {
  const previousStream = state.stream;
  let stream;

  try {
    stream = await openCameraStream(facingMode);
  } catch (error) {
    if (!previousStream) {
      throw error;
    }

    previousStream.getTracks().forEach((activeTrack) => activeTrack.stop());
    state.stream = null;
    state.track = null;
    video.srcObject = null;
    stream = await openCameraStream(facingMode);
  }

  const [track] = stream.getVideoTracks();
  const settings = track.getSettings();
  const detectedFacingMode = settings.facingMode === "user" || facingMode === "user"
    ? "user"
    : "environment";

  previousStream?.getTracks().forEach((activeTrack) => activeTrack.stop());
  state.stream = stream;
  state.track = track;
  state.preferredFacingMode = facingMode;
  state.activeFacingMode = detectedFacingMode;
  video.srcObject = stream;
  track.enabled = state.pageVisible;

  if (state.pageVisible) {
    await video.play();
  }
  configureTrackCapabilities(track);
  resizeFilteredPreview();
  applyPreviewTransform();
  resetTrailTexture();
  refreshFilterRendering();
  await refreshAvailableCameras();
}

async function setupCamera() {
  try {
    await startCameraStream();
    setStatus("");
  } catch (error) {
    console.error(error);
    setStatus("カメラにアクセスできません。Safari で HTTPS または localhost を確認してください。");
  }
}

function configureTrackCapabilities(track) {
  void track;
  state.minZoom = 1;
  state.maxZoom = 9;
  state.zoom = 1;
}

async function syncNativeZoom() {
  return false;
}

async function toggleCamera() {
  if (!state.canSwitchCamera || state.isSwitchingCamera) {
    return;
  }

  state.isSwitchingCamera = true;
  updateCameraToggle();

  const nextFacingMode = state.activeFacingMode === "user" ? "environment" : "user";

  try {
    await startCameraStream(nextFacingMode);
    setStatus("");
  } catch (error) {
    console.error(error);
    state.canSwitchCamera = false;
    setStatus("カメラを切り替えできませんでした。");
  } finally {
    state.isSwitchingCamera = false;
    updateCameraToggle();
  }
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
  const mirrorScale = state.mirrorEnabled ? -1 : 1;
  const transform = `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.zoom}) scaleX(${mirrorScale})`;
  video.style.objectPosition = "center center";
  video.style.transform = transform;
  filteredPreview.style.transform = transform;
}

function resizeFilteredPreview(force = false) {
  const scale = getPerformanceProfile().canvasScale;
  const width = Math.max(1, Math.round((previewShell.clientWidth || window.innerWidth) * scale));
  const height = Math.max(1, Math.round((previewShell.clientHeight || window.innerHeight) * scale));

  if (!force && filteredPreview.width === width && filteredPreview.height === height) {
    return;
  }

  filteredPreview.width = width;
  filteredPreview.height = height;

  if (filtersAvailable) {
    gl.viewport(0, 0, width, height);
    resetTrailTexture();
  }
}

function getCoverUvTransform() {
  const sourceWidth = video.videoWidth;
  const sourceHeight = video.videoHeight;
  const destinationWidth = filteredPreview.width;
  const destinationHeight = filteredPreview.height;

  if (!sourceWidth || !sourceHeight || !destinationWidth || !destinationHeight) {
    return null;
  }

  const scale = Math.max(destinationWidth / sourceWidth, destinationHeight / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  return {
    scaleX: destinationWidth / drawWidth,
    scaleY: destinationHeight / drawHeight,
    offsetX: (1 - (destinationWidth / drawWidth)) / 2,
    offsetY: (1 - (destinationHeight / drawHeight)) / 2,
  };
}

function getTrailAmount(value, frameDeltaMs = TRAIL_REFERENCE_FRAME_MS) {
  const normalizedValue = clamp(value / 2000, 0, 1);
  const referenceBlend = Math.pow(normalizedValue, 0.52) * TRAIL_MAX_BLEND;
  const elapsedFrames = clamp(frameDeltaMs / TRAIL_REFERENCE_FRAME_MS, 0.25, 8);
  return Math.pow(referenceBlend, elapsedFrames);
}

function getContrastStrength(value) {
  const normalizedValue = clamp(value / 255, 0, 1);
  return normalizedValue * normalizedValue;
}

function getContrastThreshold(value) {
  return getContrastStrength(value) * CONTRAST_THRESHOLD_MAX;
}

function getDelaySettings() {
  const delayMs = clamp(state.trailDelayAmount, 0, 2000);
  const captureIntervalMs = Math.max(
    TRAIL_DELAY_BASE_INTERVAL_MS,
    delayMs / (TRAIL_DELAY_BUFFER_SIZE - 1),
  );

  return { captureIntervalMs, delayMs };
}

function getWrappedDelayIndex(index) {
  return (index + TRAIL_DELAY_BUFFER_SIZE) % TRAIL_DELAY_BUFFER_SIZE;
}

function captureDelayFrame(now, uvTransform) {
  const { captureIntervalMs, delayMs } = getDelaySettings();

  if (delayMs <= 0) {
    return;
  }

  if (
    glResources.delayFrameCount > 0 &&
    now - glResources.lastDelayCaptureAt < captureIntervalMs
  ) {
    return;
  }

  const writeIndex = glResources.delayWriteIndex;
  gl.bindFramebuffer(gl.FRAMEBUFFER, glResources.delayFramebuffers[writeIndex]);
  gl.viewport(0, 0, glResources.delaySize.width, glResources.delaySize.height);
  gl.useProgram(glResources.accumulateProgram);
  bindQuadAttributes(glResources.accumulateProgram, glResources.quadBuffer);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glResources.videoTexture);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, glResources.trailTextures[glResources.trailReadIndex]);

  gl.uniform2f(glResources.uvScaleLocation, uvTransform.scaleX, uvTransform.scaleY);
  gl.uniform2f(glResources.uvOffsetLocation, uvTransform.offsetX, uvTransform.offsetY);
  gl.uniform1f(glResources.contrastEnabledLocation, 0);
  gl.uniform1f(glResources.trailEnabledLocation, 0);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  glResources.delayFrameTimestamps[writeIndex] = now;
  glResources.delayWriteIndex = getWrappedDelayIndex(writeIndex + 1);
  glResources.delayFrameCount = Math.min(glResources.delayFrameCount + 1, TRAIL_DELAY_BUFFER_SIZE);
  glResources.lastDelayCaptureAt = now;
}

function getDelayedVideoSource(now) {
  const { delayMs } = getDelaySettings();

  if (delayMs <= 0 || glResources.delayFrameCount === 0) {
    return { texture: glResources.videoTexture, preCropped: false };
  }

  const targetTime = now - delayMs;
  const latestIndex = getWrappedDelayIndex(glResources.delayWriteIndex - 1);
  let selectedIndex = latestIndex;

  for (let offset = 0; offset < glResources.delayFrameCount; offset += 1) {
    const index = getWrappedDelayIndex(latestIndex - offset);
    selectedIndex = index;
    if (glResources.delayFrameTimestamps[index] <= targetTime) {
      break;
    }
  }

  return { texture: glResources.delayTextures[selectedIndex], preCropped: true };
}

function shouldSkipRenderFrame(now) {
  const frameIntervalMs = 1000 / getPerformanceProfile().renderFps;

  if (state.nextFrameAt > 0 && now + 0.5 < state.nextFrameAt) {
    return true;
  }

  if (state.nextFrameAt <= 0) {
    state.nextFrameAt = now + frameIntervalMs;
  } else {
    state.nextFrameAt += frameIntervalMs;
    if (state.nextFrameAt <= now) {
      state.nextFrameAt = now + frameIntervalMs;
    }
  }

  return false;
}

function scheduleFilteredRender() {
  if (state.renderFrameId !== null || !state.pageVisible || !shouldRenderFilteredPreview()) {
    return;
  }

  if (typeof video.requestVideoFrameCallback === "function") {
    state.renderScheduler = "video";
    state.renderFrameId = video.requestVideoFrameCallback(renderFilteredFrame);
    return;
  }

  state.renderScheduler = "animation";
  state.renderFrameId = window.requestAnimationFrame(renderFilteredFrame);
}

function stopFilteredRender() {
  if (state.renderFrameId === null) {
    return;
  }

  if (state.renderScheduler === "video" && typeof video.cancelVideoFrameCallback === "function") {
    video.cancelVideoFrameCallback(state.renderFrameId);
  } else {
    window.cancelAnimationFrame(state.renderFrameId);
  }
  state.renderFrameId = null;
  state.renderScheduler = null;
}

function renderFilteredFrame(now = performance.now()) {
  state.renderFrameId = null;
  state.renderScheduler = null;

  if (!state.pageVisible || !shouldRenderFilteredPreview()) {
    return;
  }

  if (shouldSkipRenderFrame(now)) {
    scheduleFilteredRender();
    return;
  }

  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    scheduleFilteredRender();
    return;
  }

  resizeFilteredPreview();

  const uvTransform = getCoverUvTransform();
  if (!uvTransform) {
    scheduleFilteredRender();
    return;
  }

  const contrastEnabled = state.contrastThresholdAmount > 0;
  const trailEnabled = state.trailAmount > 0;
  const contrastStrength = getContrastStrength(state.contrastThresholdAmount);
  const contrastThreshold = getContrastThreshold(state.contrastThresholdAmount);
  const frameDeltaMs = state.lastFrameAt > 0
    ? now - state.lastFrameAt
    : 1000 / getPerformanceProfile().renderFps;
  const trailAmount = trailEnabled ? getTrailAmount(state.trailAmount, frameDeltaMs) : 0;

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glResources.videoTexture);

  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  } catch (error) {
    console.error(error);
    setStatus("フィルタ描画の更新に失敗しました。");
    return;
  }

  captureDelayFrame(now, uvTransform);
  const videoSource = getDelayedVideoSource(now);
  const sourceUvTransform = videoSource.preCropped
    ? { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 }
    : uvTransform;

  const readIndex = glResources.trailReadIndex;
  const writeIndex = 1 - readIndex;
  const targetFramebuffer = trailEnabled
    ? glResources.trailFramebuffers[writeIndex]
    : null;
  const outputTexture = trailEnabled
    ? glResources.trailTextures[writeIndex]
    : null;

  gl.bindFramebuffer(gl.FRAMEBUFFER, targetFramebuffer);
  gl.viewport(0, 0, filteredPreview.width, filteredPreview.height);
  gl.useProgram(glResources.accumulateProgram);
  bindQuadAttributes(glResources.accumulateProgram, glResources.quadBuffer);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, videoSource.texture);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, glResources.trailTextures[readIndex]);

  gl.uniform2f(glResources.uvScaleLocation, sourceUvTransform.scaleX, sourceUvTransform.scaleY);
  gl.uniform2f(glResources.uvOffsetLocation, sourceUvTransform.offsetX, sourceUvTransform.offsetY);
  gl.uniform1f(glResources.contrastEnabledLocation, contrastEnabled ? 1 : 0);
  gl.uniform1f(glResources.thresholdLocation, contrastThreshold);
  gl.uniform1f(glResources.contrastStrengthLocation, contrastStrength);
  gl.uniform1f(glResources.trailEnabledLocation, trailEnabled ? 1 : 0);
  gl.uniform1f(glResources.trailAmountLocation, trailAmount);
  gl.drawArrays(gl.TRIANGLES, 0, 6);

  if (trailEnabled) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, filteredPreview.width, filteredPreview.height);
    gl.useProgram(glResources.displayProgram);
    bindQuadAttributes(glResources.displayProgram, glResources.quadBuffer);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, outputTexture);
    gl.uniform1i(glResources.displayTextureLocation, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    glResources.trailReadIndex = writeIndex;
  }

  updateAudioFromFrame(now);
  state.lastFrameAt = now;
  scheduleFilteredRender();
}

function refreshFilterRendering() {
  syncFilterVisibility();

  if (shouldRenderFilteredPreview()) {
    scheduleFilteredRender();
    return;
  }

  stopFilteredRender();
  state.lastFrameAt = 0;
  state.nextFrameAt = 0;
}

function onContrastThresholdSliderInput(event) {
  state.contrastThresholdAmount = Number(event.currentTarget.value);
  updateTrailControls();
  refreshFilterRendering();
}

function onTrailDelaySliderInput(event) {
  state.trailDelayAmount = Number(event.currentTarget.value);
  resetDelayBuffer();
  updateTrailControls();
  refreshFilterRendering();
}

function onTrailAmountSliderInput(event) {
  const wasTrailOff = state.trailAmount <= 0;
  state.trailAmount = Number(event.currentTarget.value);
  if (wasTrailOff && state.trailAmount > 0) {
    resetTrailTexture();
  }
  updateTrailControls();
  refreshFilterRendering();
}

function onAudioThresholdSliderInput(event) {
  state.audioThresholdAmount = Number(event.currentTarget.value);
  updateTrailControls();
}

function onAudioReleaseSliderInput(event) {
  state.audioReleaseAmount = Number(event.currentTarget.value);
  updateTrailControls();
}

function onAudioOctaveSliderInput(event) {
  state.audioOctaveAmount = Number(event.currentTarget.value);
  updateTrailControls();
}

function onAudioPolyphonySliderInput(event) {
  state.audioPolyphonyAmount = Number(event.currentTarget.value);
  if (state.lastAudioAnalysis) {
    state.lastVoicedFrame = limitAudioPolyphony(
      state.lastAudioAnalysis,
      state.audioPolyphonyAmount,
    );
  }
  drawAudioMonitor(state.lastVoicedFrame, performance.now(), true);
  updateTrailControls();
}

function onAudioGainSliderInput(event) {
  state.audioGainAmount = Number(event.currentTarget.value);
  updateTrailControls();
}

function onAudioSaturationSliderInput(event) {
  state.audioSaturationAmount = Number(event.currentTarget.value);
  state.lastAudioAnalysis = null;
  updateTrailControls();
}

function updateAudioRegionCorner(event) {
  const bounds = previewShell.getBoundingClientRect();
  if (!bounds.width || !bounds.height) {
    return;
  }

  const insetX = Math.min(0.1, AUDIO_REGION_HANDLE_INSET_PX / bounds.width);
  const insetY = Math.min(0.1, AUDIO_REGION_HANDLE_INSET_PX / bounds.height);
  const normalizedX = clamp((event.clientX - bounds.left) / bounds.width, insetX, 1 - insetX);
  const normalizedY = clamp((event.clientY - bounds.top) / bounds.height, insetY, 1 - insetY);

  if (state.audioRegion.activeCorner === "top-left") {
    state.audioRegion.left = Math.min(normalizedX, state.audioRegion.right - AUDIO_REGION_MIN_SIZE);
    state.audioRegion.top = Math.min(normalizedY, state.audioRegion.bottom - AUDIO_REGION_MIN_SIZE);
  } else if (state.audioRegion.activeCorner === "bottom-right") {
    state.audioRegion.right = Math.max(normalizedX, state.audioRegion.left + AUDIO_REGION_MIN_SIZE);
    state.audioRegion.bottom = Math.max(normalizedY, state.audioRegion.top + AUDIO_REGION_MIN_SIZE);
  }

  updateAudioRegion();
}

function onAudioRegionPointerDown(event) {
  event.preventDefault();
  event.stopPropagation();
  state.audioRegion.activeCorner = event.currentTarget.dataset.corner;
  state.audioRegion.activePointerId = event.pointerId;
  event.currentTarget.classList.add("is-active");
  event.currentTarget.setPointerCapture?.(event.pointerId);
  updateAudioRegionCorner(event);
}

function onAudioRegionPointerMove(event) {
  if (event.pointerId !== state.audioRegion.activePointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  updateAudioRegionCorner(event);
}

function onAudioRegionPointerEnd(event) {
  if (event.pointerId !== state.audioRegion.activePointerId) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  event.currentTarget.classList.remove("is-active");
  event.currentTarget.releasePointerCapture?.(event.pointerId);
  state.audioRegion.activeCorner = null;
  state.audioRegion.activePointerId = null;
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
  gestureSurface.setPointerCapture?.(event.pointerId);

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
  gestureSurface.releasePointerCapture?.(event.pointerId);

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

audioRegionHandles.forEach((handle) => {
  handle.addEventListener("pointerdown", onAudioRegionPointerDown);
  handle.addEventListener("pointermove", onAudioRegionPointerMove);
  handle.addEventListener("pointerup", onAudioRegionPointerEnd);
  handle.addEventListener("pointercancel", onAudioRegionPointerEnd);
});

window.addEventListener("resize", refreshViewportLayout);
window.visualViewport?.addEventListener("resize", refreshViewportLayout);
window.visualViewport?.addEventListener("scroll", refreshViewportLayout);
document.addEventListener("fullscreenchange", onFullscreenChange);
document.addEventListener("visibilitychange", onVisibilityChange);
audioToggle.addEventListener("click", toggleAudio);
audioEnvelopeToggle.addEventListener("click", toggleAudioEnvelope);
audioRgbToggle.addEventListener("click", rotateAudioRgbMapping);
audioTimbreToggle.addEventListener("click", cycleAudioTimbre);
economyToggle.addEventListener("click", toggleEconomy);
mirrorToggle.addEventListener("click", toggleMirror);
controlsToggle.addEventListener("click", toggleControlsVisibility);
cameraToggle.addEventListener("click", toggleCamera);
fullscreenToggle.addEventListener("click", toggleFullscreen);
contrastThresholdSlider.addEventListener("input", onContrastThresholdSliderInput);
trailDelaySlider.addEventListener("input", onTrailDelaySliderInput);
trailAmountSlider.addEventListener("input", onTrailAmountSliderInput);
audioThresholdSlider.addEventListener("input", onAudioThresholdSliderInput);
audioReleaseSlider.addEventListener("input", onAudioReleaseSliderInput);
audioOctaveSlider.addEventListener("input", onAudioOctaveSliderInput);
audioPolyphonySlider.addEventListener("input", onAudioPolyphonySliderInput);
audioGainSlider.addEventListener("input", onAudioGainSliderInput);
audioSaturationSlider.addEventListener("input", onAudioSaturationSliderInput);

updateFullscreenButton();
updateViewportMetrics();
updateAudioToggle();
updateAudioEnvelopeToggle();
updateAudioOptionButtons();
updateEconomyToggle();
updateMirrorToggle();
updateAudioRegion();
updateControlsToggle();
updateCameraToggle();
updateFilterAvailability();
updateTrailControls();
drawAudioMonitor(null, performance.now(), true);
syncFilterVisibility();

if (!navigator.mediaDevices?.getUserMedia) {
  setStatus("このブラウザはカメラプレビューに対応していません。");
} else if (!filtersAvailable) {
  setStatus("WebGL フィルタを初期化できなかったため、通常プレビューのみ表示します。");
  setupCamera();
} else {
  setupCamera();
}
