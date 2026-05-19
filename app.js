const video = document.getElementById("camera");
const filteredPreview = document.getElementById("filteredPreview");
const previewShell = document.querySelector(".preview-shell");
const gestureSurface = document.getElementById("gestureSurface");
const fullscreenToggle = document.getElementById("fullscreenToggle");
const contrastThresholdSlider = document.getElementById("contrastThresholdSlider");
const trailDelaySlider = document.getElementById("trailDelaySlider");
const trailAmountSlider = document.getElementById("trailAmountSlider");
const contrastThresholdValue = document.getElementById("contrastThresholdValue");
const trailDelayValue = document.getElementById("trailDelayValue");
const trailAmountValue = document.getElementById("trailAmountValue");
const statusPanel = document.getElementById("statusPanel");

const gl = filteredPreview.getContext("webgl", {
  alpha: false,
  antialias: false,
  depth: false,
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
  lastFrameAt: 0,
  contrastThresholdAmount: Number(contrastThresholdSlider.value),
  trailDelayAmount: Number(trailDelaySlider.value),
  trailAmount: Number(trailAmountSlider.value),
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

function updateFullscreenButton() {
  const isFullscreen = Boolean(document.fullscreenElement);
  fullscreenToggle.textContent = isFullscreen ? "EXIT" : "FULL";
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
    trailReadIndex: 0,
    delayWriteIndex: 0,
    delayFrameCount: 0,
    lastDelayCaptureAt: 0,
    trailSize: { width: 1, height: 1 },
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
}

function formatStrength(value) {
  return String(Math.round(value));
}

function updateTrailControls() {
  contrastThresholdSlider.value = String(state.contrastThresholdAmount);
  trailDelaySlider.value = String(state.trailDelayAmount);
  trailAmountSlider.value = String(state.trailAmount);
  contrastThresholdValue.textContent = formatStrength(state.contrastThresholdAmount);
  trailDelayValue.textContent = formatStrength(state.trailDelayAmount);
  trailAmountValue.textContent = formatStrength(state.trailAmount);
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

  gl.clearColor(0, 0, 0, 1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  glResources.trailReadIndex = 0;
  glResources.delayWriteIndex = 0;
  glResources.delayFrameCount = 0;
  glResources.lastDelayCaptureAt = 0;
  glResources.trailSize = { width, height };
  state.lastFrameAt = 0;
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
    resizeFilteredPreview();
    applyPreviewTransform();
    refreshFilterRendering();
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
  const transform = `translate3d(${state.panX}px, ${state.panY}px, 0) scale(${state.zoom})`;
  video.style.objectPosition = "center center";
  video.style.transform = transform;
  filteredPreview.style.transform = transform;
}

function resizeFilteredPreview() {
  const width = Math.max(1, Math.round(previewShell.clientWidth || window.innerWidth));
  const height = Math.max(1, Math.round(previewShell.clientHeight || window.innerHeight));

  if (filteredPreview.width === width && filteredPreview.height === height) {
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

function getTrailAmount(value) {
  const normalizedValue = clamp(value / 2000, 0, 1);
  return Math.pow(normalizedValue, 0.52) * TRAIL_MAX_BLEND;
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
  const captureIntervalMs = Math.max(TRAIL_DELAY_BASE_INTERVAL_MS, delayMs / TRAIL_DELAY_BUFFER_SIZE);
  const frameDelay = Math.min(
    TRAIL_DELAY_BUFFER_SIZE - 1,
    Math.round(delayMs / captureIntervalMs),
  );

  return { captureIntervalMs, delayMs, frameDelay };
}

function getWrappedDelayIndex(index) {
  return (index + TRAIL_DELAY_BUFFER_SIZE) % TRAIL_DELAY_BUFFER_SIZE;
}

function captureDelayFrame(now) {
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

  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, glResources.delayTextures[glResources.delayWriteIndex]);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

  glResources.delayWriteIndex = getWrappedDelayIndex(glResources.delayWriteIndex + 1);
  glResources.delayFrameCount = Math.min(glResources.delayFrameCount + 1, TRAIL_DELAY_BUFFER_SIZE);
  glResources.lastDelayCaptureAt = now;
}

function getDelayedVideoTexture() {
  const { delayMs, frameDelay } = getDelaySettings();

  if (delayMs <= 0 || glResources.delayFrameCount === 0) {
    return glResources.videoTexture;
  }

  const availableDelay = Math.min(frameDelay, glResources.delayFrameCount - 1);
  const latestIndex = getWrappedDelayIndex(glResources.delayWriteIndex - 1);
  return glResources.delayTextures[getWrappedDelayIndex(latestIndex - availableDelay)];
}

function scheduleFilteredRender() {
  if (state.renderFrameId !== null || !shouldRenderFilteredPreview()) {
    return;
  }

  state.renderFrameId = window.requestAnimationFrame(renderFilteredFrame);
}

function stopFilteredRender() {
  if (state.renderFrameId === null) {
    return;
  }

  window.cancelAnimationFrame(state.renderFrameId);
  state.renderFrameId = null;
}

function renderFilteredFrame(now = performance.now()) {
  state.renderFrameId = null;

  if (!shouldRenderFilteredPreview()) {
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
  const trailAmount = trailEnabled ? getTrailAmount(state.trailAmount) : 0;

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glResources.videoTexture);

  try {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
  } catch (error) {
    console.error(error);
    setStatus("フィルタ描画の更新に失敗しました。");
    return;
  }

  captureDelayFrame(now);

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
  gl.bindTexture(gl.TEXTURE_2D, getDelayedVideoTexture());

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, glResources.trailTextures[readIndex]);

  gl.uniform2f(glResources.uvScaleLocation, uvTransform.scaleX, uvTransform.scaleY);
  gl.uniform2f(glResources.uvOffsetLocation, uvTransform.offsetX, uvTransform.offsetY);
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
}

function onContrastThresholdSliderInput(event) {
  state.contrastThresholdAmount = Number(event.currentTarget.value);
  updateTrailControls();
  refreshFilterRendering();
}

function onTrailDelaySliderInput(event) {
  state.trailDelayAmount = Number(event.currentTarget.value);
  glResources.delayWriteIndex = 0;
  glResources.delayFrameCount = 0;
  glResources.lastDelayCaptureAt = 0;
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

window.addEventListener("resize", applyPreviewTransform);
window.addEventListener("resize", resizeFilteredPreview);
document.addEventListener("fullscreenchange", updateFullscreenButton);
fullscreenToggle.addEventListener("click", toggleFullscreen);
contrastThresholdSlider.addEventListener("input", onContrastThresholdSliderInput);
trailDelaySlider.addEventListener("input", onTrailDelaySliderInput);
trailAmountSlider.addEventListener("input", onTrailAmountSliderInput);

updateFullscreenButton();
updateFilterAvailability();
updateTrailControls();
syncFilterVisibility();

if (!navigator.mediaDevices?.getUserMedia) {
  setStatus("このブラウザはカメラプレビューに対応していません。");
} else if (!filtersAvailable) {
  setStatus("WebGL フィルタを初期化できなかったため、通常プレビューのみ表示します。");
  setupCamera();
} else {
  setupCamera();
}
