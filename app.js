const MAX_CROP = 1024;
const MIN_CROP = 64;
const FREE_MAX_PIXELS = 1024 * 1024;
const FIXED_STEPS = 28;
const FIXED_N_SAMPLES = 1;
const NAI_MASK_SCALE = 8;
const NAI_MASK_THRESHOLD = 155;

const state = {
  mode: "crop",
  image: null,
  imageName: "",
  crop: { x: 0, y: 0, w: 0, h: 0 },
  brushMode: "paint",
  brushSize: 56,
  squareBrush: false,
  feather: 18,
  opacity: 1,
  compositeScope: "mask",
  maskCanvas: document.createElement("canvas"),
  maskHistory: [],
  maskRedo: [],
  maskDirty: false,
  inpaintImage: null,
  inpaintName: "",
  apiRunning: false,
  drag: null,
  pointer: null,
  renderQueued: false,
  novelAiMetadata: null,
};

const els = {
  canvas: document.getElementById("editorCanvas"),
  canvasFrame: document.querySelector(".canvas-frame"),
  emptyState: document.getElementById("emptyState"),
  originalInput: document.getElementById("originalInput"),
  resultInput: document.getElementById("resultInput"),
  fileName: document.getElementById("fileName"),
  imageSize: document.getElementById("imageSize"),
  cropSize: document.getElementById("cropSize"),
  maskCoverage: document.getElementById("maskCoverage"),
  limitStatus: document.getElementById("limitStatus"),
  resultStatus: document.getElementById("resultStatus"),
  stageTitle: document.getElementById("stageTitle"),
  stageHint: document.getElementById("stageHint"),
  cropXInput: document.getElementById("cropXInput"),
  cropYInput: document.getElementById("cropYInput"),
  cropWInput: document.getElementById("cropWInput"),
  cropHInput: document.getElementById("cropHInput"),
  brushSizeInput: document.getElementById("brushSizeInput"),
  brushSizeOutput: document.getElementById("brushSizeOutput"),
  squareBrushInput: document.getElementById("squareBrushInput"),
  featherInput: document.getElementById("featherInput"),
  featherOutput: document.getElementById("featherOutput"),
  opacityInput: document.getElementById("opacityInput"),
  opacityOutput: document.getElementById("opacityOutput"),
  maskFormatSelect: document.getElementById("maskFormatSelect"),
  cropModeButton: document.getElementById("cropModeButton"),
  maskModeButton: document.getElementById("maskModeButton"),
  blendModeButton: document.getElementById("blendModeButton"),
  paintButton: document.getElementById("paintButton"),
  eraseButton: document.getElementById("eraseButton"),
  maskedCompositeButton: document.getElementById("maskedCompositeButton"),
  cropCompositeButton: document.getElementById("cropCompositeButton"),
  loadSampleButton: document.getElementById("loadSampleButton"),
  resetButton: document.getElementById("resetButton"),
  centerCropButton: document.getElementById("centerCropButton"),
  squareCropButton: document.getElementById("squareCropButton"),
  maxCropButton: document.getElementById("maxCropButton"),
  goMaskButton: document.getElementById("goMaskButton"),
  undoMaskButton: document.getElementById("undoMaskButton"),
  redoMaskButton: document.getElementById("redoMaskButton"),
  clearMaskButton: document.getElementById("clearMaskButton"),
  exportCropButton: document.getElementById("exportCropButton"),
  exportMaskButton: document.getElementById("exportMaskButton"),
  exportBothButton: document.getElementById("exportBothButton"),
  exportCompositeButton: document.getElementById("exportCompositeButton"),
  apiTokenInput: document.getElementById("apiTokenInput"),
  apiEndpointInput: document.getElementById("apiEndpointInput"),
  apiModelInput: document.getElementById("apiModelInput"),
  apiPromptInput: document.getElementById("apiPromptInput"),
  apiNegativeInput: document.getElementById("apiNegativeInput"),
  apiCharacterPositive1: document.getElementById("apiCharacterPositive1"),
  apiCharacterNegative1: document.getElementById("apiCharacterNegative1"),
  apiCharacterPositive2: document.getElementById("apiCharacterPositive2"),
  apiCharacterNegative2: document.getElementById("apiCharacterNegative2"),
  apiStepsInput: document.getElementById("apiStepsInput"),
  apiScaleInput: document.getElementById("apiScaleInput"),
  apiGuidanceRescaleInput: document.getElementById("apiGuidanceRescaleInput"),
  apiStrengthInput: document.getElementById("apiStrengthInput"),
  apiNoiseInput: document.getElementById("apiNoiseInput"),
  apiSamplerSelect: document.getElementById("apiSamplerSelect"),
  apiNoiseScheduleSelect: document.getElementById("apiNoiseScheduleSelect"),
  apiSeedInput: document.getElementById("apiSeedInput"),
  apiExtraInput: document.getElementById("apiExtraInput"),
  apiInpaintButton: document.getElementById("apiInpaintButton"),
  apiStatus: document.getElementById("apiStatus"),
  metadataBox: document.getElementById("metadataBox"),
  metadataSummary: document.getElementById("metadataSummary"),
  metadataStatus: document.getElementById("metadataStatus"),
  applyMetaPromptButton: document.getElementById("applyMetaPromptButton"),
  applyMetaNegativeButton: document.getElementById("applyMetaNegativeButton"),
  applyMetaCharactersButton: document.getElementById("applyMetaCharactersButton"),
  applyMetaSettingsButton: document.getElementById("applyMetaSettingsButton"),
  applyMetaAllButton: document.getElementById("applyMetaAllButton"),
};

const ctx = els.canvas.getContext("2d", { willReadFrequently: true });

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function roundCrop(crop) {
  return {
    x: Math.round(crop.x),
    y: Math.round(crop.y),
    w: Math.round(crop.w),
    h: Math.round(crop.h),
  };
}

function hasImage() {
  return Boolean(state.image);
}

function hasMask() {
  return state.maskDirty && calculateMaskCoverage() > 0;
}

function setCanvasSize() {
  const rect = els.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));

  if (els.canvas.width !== width || els.canvas.height !== height) {
    els.canvas.width = width;
    els.canvas.height = height;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  requestRender();
}

function getCanvasCssSize() {
  const rect = els.canvas.getBoundingClientRect();
  return { w: rect.width, h: rect.height };
}

function getFitRect(width, height, padding = 28) {
  const size = getCanvasCssSize();
  const availableW = Math.max(1, size.w - padding * 2);
  const availableH = Math.max(1, size.h - padding * 2);
  const scale = Math.min(availableW / width, availableH / height);
  const w = width * scale;
  const h = height * scale;
  return {
    x: (size.w - w) / 2,
    y: (size.h - h) / 2,
    w,
    h,
    scale,
  };
}

function imageFitRect() {
  if (!state.image) return null;
  return getFitRect(state.image.naturalWidth, state.image.naturalHeight);
}

function cropFitRect() {
  if (!state.image) return null;
  return getFitRect(state.crop.w, state.crop.h);
}

function imageToCanvas(point, fit = imageFitRect()) {
  return {
    x: fit.x + point.x * fit.scale,
    y: fit.y + point.y * fit.scale,
  };
}

function canvasToImage(point, fit = imageFitRect()) {
  return {
    x: (point.x - fit.x) / fit.scale,
    y: (point.y - fit.y) / fit.scale,
  };
}

function cropToCanvasPoint(point, fit = cropFitRect()) {
  return {
    x: fit.x + point.x * fit.scale,
    y: fit.y + point.y * fit.scale,
  };
}

function canvasToCrop(point, fit = cropFitRect()) {
  return {
    x: (point.x - fit.x) / fit.scale,
    y: (point.y - fit.y) / fit.scale,
  };
}

function getPointer(event) {
  const rect = els.canvas.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function makeDefaultCrop(image) {
  const size = Math.min(MAX_CROP, image.naturalWidth, image.naturalHeight);
  return roundCrop({
    x: (image.naturalWidth - size) / 2,
    y: (image.naturalHeight - size) / 2,
    w: size,
    h: size,
  });
}

function normalizeCrop(crop) {
  if (!state.image) return { x: 0, y: 0, w: 0, h: 0 };
  const imgW = state.image.naturalWidth;
  const imgH = state.image.naturalHeight;
  const maxW = Math.min(MAX_CROP, imgW);
  const maxH = Math.min(MAX_CROP, imgH);
  const minW = Math.min(MIN_CROP, maxW);
  const minH = Math.min(MIN_CROP, maxH);
  const w = clamp(Number(crop.w) || minW, minW, maxW);
  const h = clamp(Number(crop.h) || minH, minH, maxH);
  const x = clamp(Number(crop.x) || 0, 0, imgW - w);
  const y = clamp(Number(crop.y) || 0, 0, imgH - h);
  return roundCrop({ x, y, w, h });
}

function setCrop(crop, keepMask = true) {
  const next = normalizeCrop(crop);
  const changedSize = next.w !== state.crop.w || next.h !== state.crop.h;
  state.crop = next;

  if (changedSize) {
    resizeMaskCanvas(keepMask);
  }

  updateControls();
  requestRender();
}

function resizeMaskCanvas(keepMask) {
  const previous = state.maskCanvas;
  const next = document.createElement("canvas");
  next.width = Math.max(1, state.crop.w);
  next.height = Math.max(1, state.crop.h);

  if (keepMask && previous.width && previous.height) {
    const nextCtx = next.getContext("2d");
    nextCtx.drawImage(previous, 0, 0, next.width, next.height);
  } else {
    state.maskDirty = false;
    state.maskHistory = [];
    state.maskRedo = [];
  }

  state.maskCanvas = next;
}

function setMode(mode) {
  state.mode = mode;
  els.canvasFrame.classList.toggle("mode-crop", mode === "crop");
  els.canvasFrame.classList.toggle("mode-mask", mode === "mask");
  els.canvasFrame.classList.toggle("mode-blend", mode === "blend");
  els.cropModeButton.classList.toggle("active", mode === "crop");
  els.maskModeButton.classList.toggle("active", mode === "mask");
  els.blendModeButton.classList.toggle("active", mode === "blend");
  els.cropModeButton.setAttribute("aria-selected", String(mode === "crop"));
  els.maskModeButton.setAttribute("aria-selected", String(mode === "mask"));
  els.blendModeButton.setAttribute("aria-selected", String(mode === "blend"));

  if (mode === "crop") {
    els.stageTitle.textContent = "크롭 영역 선택";
    els.stageHint.textContent = "테두리와 모서리를 드래그하세요.";
  } else if (mode === "mask") {
    els.stageTitle.textContent = "마스크 편집";
    els.stageHint.textContent = "수정할 영역을 칠하세요.";
  } else {
    els.stageTitle.textContent = "합성 미리보기";
    els.stageHint.textContent = "결과 PNG를 열고 경계를 조정하세요.";
  }

  requestRender();
}

function enterMaskMode() {
  if (!state.image) {
    alert("원본 이미지를 먼저 여세요.");
    return;
  }
  state.pointer = null;
  setMode("mask");
}

function setBrushMode(mode) {
  state.brushMode = mode;
  els.paintButton.classList.toggle("active", mode === "paint");
  els.eraseButton.classList.toggle("active", mode === "erase");
}

function setCompositeScope(scope) {
  state.compositeScope = scope;
  els.maskedCompositeButton.classList.toggle("active", scope === "mask");
  els.cropCompositeButton.classList.toggle("active", scope === "crop");
  requestRender();
}

function requestRender() {
  if (state.renderQueued) return;
  state.renderQueued = true;
  requestAnimationFrame(() => {
    state.renderQueued = false;
    render();
  });
}

function clearCanvas() {
  const size = getCanvasCssSize();
  ctx.clearRect(0, 0, size.w, size.h);
}

function render() {
  clearCanvas();
  els.emptyState.classList.toggle("hidden", hasImage());
  updateStatus();

  if (!state.image) return;

  if (state.mode === "crop") {
    renderCropMode();
  } else if (state.mode === "mask") {
    renderMaskMode();
  } else {
    renderBlendMode();
  }
}

function renderCropMode() {
  const fit = imageFitRect();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(state.image, fit.x, fit.y, fit.w, fit.h);

  const cropRect = getCropScreenRect(fit);
  ctx.save();
  ctx.fillStyle = "rgb(9 15 12 / 0.54)";
  ctx.beginPath();
  ctx.rect(fit.x, fit.y, fit.w, fit.h);
  ctx.rect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
  ctx.fill("evenodd");
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = getAccent();
  ctx.lineWidth = 2;
  ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
  drawHandles(cropRect);
  ctx.restore();
}

function renderMaskMode() {
  const fit = cropFitRect();
  const cropCanvas = buildCropCanvas();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(cropCanvas, fit.x, fit.y, fit.w, fit.h);
  drawMaskOverlay(fit);
  drawFitBorder(fit);
  drawBrushCursor(fit);
}

function renderBlendMode() {
  const fit = imageFitRect();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(state.image, fit.x, fit.y, fit.w, fit.h);

  const cropRect = getCropScreenRect(fit);
  if (state.inpaintImage) {
    drawCompositePreview(cropRect);
  }

  ctx.save();
  ctx.strokeStyle = getAccent();
  ctx.lineWidth = 2;
  ctx.strokeRect(cropRect.x, cropRect.y, cropRect.w, cropRect.h);
  ctx.restore();
}

function getAccent() {
  return getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#287a5d";
}

function drawFitBorder(fit) {
  ctx.save();
  ctx.strokeStyle = getAccent();
  ctx.lineWidth = 2;
  ctx.strokeRect(fit.x, fit.y, fit.w, fit.h);
  ctx.restore();
}

function getCropScreenRect(fit = imageFitRect()) {
  const topLeft = imageToCanvas({ x: state.crop.x, y: state.crop.y }, fit);
  return {
    x: topLeft.x,
    y: topLeft.y,
    w: state.crop.w * fit.scale,
    h: state.crop.h * fit.scale,
  };
}

function drawHandles(rect) {
  const handles = getHandleRects(rect);
  ctx.fillStyle = getAccent();
  for (const handle of handles) {
    ctx.fillRect(handle.x, handle.y, handle.w, handle.h);
  }
}

function getHandleRects(rect) {
  const size = 10;
  const half = size / 2;
  const points = [
    ["nw", rect.x, rect.y],
    ["n", rect.x + rect.w / 2, rect.y],
    ["ne", rect.x + rect.w, rect.y],
    ["e", rect.x + rect.w, rect.y + rect.h / 2],
    ["se", rect.x + rect.w, rect.y + rect.h],
    ["s", rect.x + rect.w / 2, rect.y + rect.h],
    ["sw", rect.x, rect.y + rect.h],
    ["w", rect.x, rect.y + rect.h / 2],
  ];
  return points.map(([name, x, y]) => ({
    name,
    x: x - half,
    y: y - half,
    w: size,
    h: size,
  }));
}

function drawMaskOverlay(fit) {
  if (!state.maskCanvas.width || !state.maskCanvas.height) return;
  const displayMask = buildNovelAiAlphaMaskCanvas();
  const overlay = document.createElement("canvas");
  overlay.width = displayMask.width;
  overlay.height = displayMask.height;
  const overlayCtx = overlay.getContext("2d");
  overlayCtx.fillStyle = "rgb(117 116 210)";
  overlayCtx.fillRect(0, 0, overlay.width, overlay.height);
  overlayCtx.globalCompositeOperation = "destination-in";
  overlayCtx.drawImage(displayMask, 0, 0);
  overlayCtx.globalCompositeOperation = "source-over";

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.58;
  ctx.drawImage(overlay, fit.x, fit.y, fit.w, fit.h);
  ctx.imageSmoothingEnabled = true;
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBrushCursor(fit) {
  if (!state.pointer || state.mode !== "mask") return;
  const cropPoint = canvasToCrop(state.pointer, fit);
  if (cropPoint.x < 0 || cropPoint.y < 0 || cropPoint.x > state.crop.w || cropPoint.y > state.crop.h) {
    return;
  }
  const radius = (state.brushSize * fit.scale) / 2;
  ctx.save();
  ctx.strokeStyle = state.brushMode === "paint" ? getAccent() : "rgb(162 59 59)";
  ctx.lineWidth = 1.5;
  if (state.squareBrush) {
    ctx.strokeRect(state.pointer.x - radius, state.pointer.y - radius, radius * 2, radius * 2);
  } else {
    ctx.beginPath();
    ctx.arc(state.pointer.x, state.pointer.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCompositePreview(cropRect) {
  const temp = document.createElement("canvas");
  temp.width = Math.max(1, Math.round(cropRect.w));
  temp.height = Math.max(1, Math.round(cropRect.h));
  const tempCtx = temp.getContext("2d");
  tempCtx.imageSmoothingQuality = "high";
  tempCtx.drawImage(state.inpaintImage, 0, 0, temp.width, temp.height);

  if (state.compositeScope === "mask" && hasMask()) {
    const mask = makePreviewMask(temp.width, temp.height);
    tempCtx.globalCompositeOperation = "destination-in";
    tempCtx.drawImage(mask, 0, 0);
    tempCtx.globalCompositeOperation = "source-over";
  }

  ctx.save();
  ctx.globalAlpha = state.opacity;
  ctx.drawImage(temp, cropRect.x, cropRect.y);
  ctx.restore();
}

function makePreviewMask(width, height) {
  const mask = document.createElement("canvas");
  mask.width = width;
  mask.height = height;
  const maskCtx = mask.getContext("2d");
  const scale = width / state.crop.w;
  if (state.feather > 0) {
    maskCtx.filter = `blur(${Math.max(0, state.feather * scale)}px)`;
  }
  maskCtx.imageSmoothingEnabled = false;
  maskCtx.drawImage(buildNovelAiAlphaMaskCanvas(), 0, 0, width, height);
  maskCtx.filter = "none";
  return mask;
}

function updateControls() {
  els.cropXInput.value = state.crop.x;
  els.cropYInput.value = state.crop.y;
  els.cropWInput.value = state.crop.w;
  els.cropHInput.value = state.crop.h;
}

function updateStatus() {
  els.fileName.textContent = state.imageName || "없음";
  els.imageSize.textContent = state.image
    ? `${state.image.naturalWidth} x ${state.image.naturalHeight}`
    : "0 x 0";
  els.cropSize.textContent = `${state.crop.w} x ${state.crop.h}`;
  els.maskCoverage.textContent = `${calculateMaskCoverage().toFixed(1)}%`;

  const inLimit = state.crop.w <= MAX_CROP && state.crop.h <= MAX_CROP;
  els.limitStatus.textContent = inLimit ? "1024 이하" : "1024 초과";

  if (!state.inpaintImage) {
    els.resultStatus.textContent = "결과 없음";
  } else if (state.inpaintImage.naturalWidth === state.crop.w && state.inpaintImage.naturalHeight === state.crop.h) {
    els.resultStatus.textContent = "결과 크기 일치";
  } else {
    els.resultStatus.textContent = `${state.inpaintImage.naturalWidth} x ${state.inpaintImage.naturalHeight} 자동 맞춤`;
  }
}

function calculateMaskCoverage() {
  if (!state.maskCanvas.width || !state.maskCanvas.height) return 0;
  const actualMask = buildNovelAiLowResMaskCanvas();
  const maskCtx = actualMask.getContext("2d", { willReadFrequently: true });
  const data = maskCtx.getImageData(0, 0, actualMask.width, actualMask.height).data;
  let painted = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) painted += 1;
  }
  return (painted / (actualMask.width * actualMask.height)) * 100;
}

function pushMaskHistory() {
  if (!state.maskCanvas.width || !state.maskCanvas.height) return;
  const maskCtx = state.maskCanvas.getContext("2d");
  state.maskHistory.push(maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height));
  if (state.maskHistory.length > 24) {
    state.maskHistory.shift();
  }
  state.maskRedo = [];
}

function restoreMask(imageData) {
  const maskCtx = state.maskCanvas.getContext("2d");
  maskCtx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
  maskCtx.putImageData(imageData, 0, 0);
  state.maskDirty = calculateMaskCoverage() > 0;
  updateStatus();
  requestRender();
}

function undoMask() {
  if (!state.maskHistory.length) return;
  const maskCtx = state.maskCanvas.getContext("2d");
  state.maskRedo.push(maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height));
  const previous = state.maskHistory.pop();
  restoreMask(previous);
}

function redoMask() {
  if (!state.maskRedo.length) return;
  const maskCtx = state.maskCanvas.getContext("2d");
  state.maskHistory.push(maskCtx.getImageData(0, 0, state.maskCanvas.width, state.maskCanvas.height));
  const next = state.maskRedo.pop();
  restoreMask(next);
}

function clearMask() {
  pushMaskHistory();
  const maskCtx = state.maskCanvas.getContext("2d");
  maskCtx.clearRect(0, 0, state.maskCanvas.width, state.maskCanvas.height);
  state.maskDirty = false;
  updateStatus();
  requestRender();
}

function stampMaskPixel(imageData, offsetX, offsetY, point, size, square, paint) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const radius = size / 2;
  const radiusSq = radius * radius;
  const localX = point.x - offsetX;
  const localY = point.y - offsetY;
  const minX = clamp(Math.floor(localX - radius), 0, width - 1);
  const maxX = clamp(Math.ceil(localX + radius), 0, width - 1);
  const minY = clamp(Math.floor(localY - radius), 0, height - 1);
  const maxY = clamp(Math.ceil(localY + radius), 0, height - 1);

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!square) {
        const dx = x + 0.5 - localX;
        const dy = y + 0.5 - localY;
        if (dx * dx + dy * dy > radiusSq) continue;
      }

      const index = (y * width + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = paint ? 255 : 0;
    }
  }
}

function drawMaskLine(from, to) {
  const maskCtx = state.maskCanvas.getContext("2d");
  const radius = Math.ceil(state.brushSize / 2);
  const minX = clamp(Math.floor(Math.min(from.x, to.x) - radius - 1), 0, state.maskCanvas.width - 1);
  const maxX = clamp(Math.ceil(Math.max(from.x, to.x) + radius + 1), 0, state.maskCanvas.width - 1);
  const minY = clamp(Math.floor(Math.min(from.y, to.y) - radius - 1), 0, state.maskCanvas.height - 1);
  const maxY = clamp(Math.ceil(Math.max(from.y, to.y) + radius + 1), 0, state.maskCanvas.height - 1);
  const width = Math.max(1, maxX - minX + 1);
  const height = Math.max(1, maxY - minY + 1);
  const imageData = maskCtx.getImageData(minX, minY, width, height);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  const step = Math.max(1, state.brushSize / 3);
  const count = Math.max(1, Math.ceil(distance / step));
  const paint = state.brushMode === "paint";

  for (let i = 0; i <= count; i += 1) {
    const t = i / count;
    stampMaskPixel(
      imageData,
      minX,
      minY,
      { x: from.x + dx * t, y: from.y + dy * t },
      state.brushSize,
      state.squareBrush,
      paint,
    );
  }

  maskCtx.putImageData(imageData, minX, minY);
  state.maskDirty = true;
}

function hitTestCrop(point) {
  const fit = imageFitRect();
  const rect = getCropScreenRect(fit);
  const handles = getHandleRects(rect);

  for (const handle of handles) {
    if (
      point.x >= handle.x &&
      point.x <= handle.x + handle.w &&
      point.y >= handle.y &&
      point.y <= handle.y + handle.h
    ) {
      return handle.name;
    }
  }

  if (
    point.x >= rect.x &&
    point.x <= rect.x + rect.w &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.h
  ) {
    return "move";
  }

  return null;
}

function resizeFromHandle(start, handle, dx, dy) {
  const imgW = state.image.naturalWidth;
  const imgH = state.image.naturalHeight;
  let left = start.x;
  let right = start.x + start.w;
  let top = start.y;
  let bottom = start.y + start.h;

  if (handle.includes("w")) left = clamp(left + dx, 0, right - MIN_CROP);
  if (handle.includes("e")) right = clamp(right + dx, left + MIN_CROP, imgW);
  if (handle.includes("n")) top = clamp(top + dy, 0, bottom - MIN_CROP);
  if (handle.includes("s")) bottom = clamp(bottom + dy, top + MIN_CROP, imgH);

  if (right - left > MAX_CROP) {
    if (handle.includes("w")) left = right - MAX_CROP;
    if (handle.includes("e")) right = left + MAX_CROP;
  }

  if (bottom - top > MAX_CROP) {
    if (handle.includes("n")) top = bottom - MAX_CROP;
    if (handle.includes("s")) bottom = top + MAX_CROP;
  }

  return normalizeCrop({
    x: left,
    y: top,
    w: right - left,
    h: bottom - top,
  });
}

function onPointerDown(event) {
  if (!state.image) return;
  const pointer = getPointer(event);
  state.pointer = pointer;

  if (state.mode === "crop") {
    const handle = hitTestCrop(pointer);
    if (!handle) return;
    els.canvas.setPointerCapture(event.pointerId);
    state.drag = {
      kind: "crop",
      handle,
      startPointer: canvasToImage(pointer),
      startCrop: { ...state.crop },
    };
  }

  if (state.mode === "mask") {
    const fit = cropFitRect();
    const cropPoint = canvasToCrop(pointer, fit);
    if (cropPoint.x < 0 || cropPoint.y < 0 || cropPoint.x > state.crop.w || cropPoint.y > state.crop.h) return;
    els.canvas.setPointerCapture(event.pointerId);
    pushMaskHistory();
    state.drag = {
      kind: "mask",
      last: cropPoint,
    };
    drawMaskLine(cropPoint, cropPoint);
  }

  requestRender();
}

function onPointerMove(event) {
  if (!state.image) return;
  const pointer = getPointer(event);
  state.pointer = pointer;

  if (state.drag?.kind === "crop") {
    const current = canvasToImage(pointer);
    const dx = current.x - state.drag.startPointer.x;
    const dy = current.y - state.drag.startPointer.y;

    if (state.drag.handle === "move") {
      setCrop({
        ...state.drag.startCrop,
        x: state.drag.startCrop.x + dx,
        y: state.drag.startCrop.y + dy,
      });
    } else {
      setCrop(resizeFromHandle(state.drag.startCrop, state.drag.handle, dx, dy));
    }
  }

  if (state.drag?.kind === "mask") {
    const fit = cropFitRect();
    const cropPoint = canvasToCrop(pointer, fit);
    const clamped = {
      x: clamp(cropPoint.x, 0, state.crop.w),
      y: clamp(cropPoint.y, 0, state.crop.h),
    };
    drawMaskLine(state.drag.last, clamped);
    state.drag.last = clamped;
    updateStatus();
  }

  requestRender();
}

function onPointerUp(event) {
  if (state.drag) {
    try {
      els.canvas.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be gone after a window blur.
    }
  }
  state.drag = null;
  updateStatus();
  requestRender();
}

function onPointerLeave() {
  state.pointer = null;
  requestRender();
}

function readPngUint32(view, offset) {
  return view.getUint32(offset, false);
}

function decodeAscii(bytes) {
  return Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
}

function decodeUtf8(bytes) {
  return new TextDecoder("utf-8").decode(bytes);
}

function findNullByte(bytes, start = 0) {
  for (let index = start; index < bytes.length; index += 1) {
    if (bytes[index] === 0) return index;
  }
  return -1;
}

async function inflatePngText(bytes) {
  if (typeof DecompressionStream !== "function") return null;
  for (const format of ["deflate", "deflate-raw", "gzip"]) {
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch {
      // Try the next compression wrapper.
    }
  }
  return null;
}

async function parsePngTextChunk(type, data) {
  if (type === "tEXt") {
    const keywordEnd = findNullByte(data);
    if (keywordEnd <= 0) return null;
    return {
      keyword: decodeUtf8(data.slice(0, keywordEnd)),
      text: decodeUtf8(data.slice(keywordEnd + 1)),
      type,
    };
  }

  if (type === "zTXt") {
    const keywordEnd = findNullByte(data);
    if (keywordEnd <= 0 || keywordEnd + 2 >= data.length || data[keywordEnd + 1] !== 0) return null;
    const inflated = await inflatePngText(data.slice(keywordEnd + 2));
    if (!inflated) return null;
    return {
      keyword: decodeUtf8(data.slice(0, keywordEnd)),
      text: decodeUtf8(inflated),
      type,
    };
  }

  if (type === "iTXt") {
    const keywordEnd = findNullByte(data);
    if (keywordEnd <= 0 || keywordEnd + 2 >= data.length) return null;
    const compressionFlag = data[keywordEnd + 1];
    const compressionMethod = data[keywordEnd + 2];
    if (compressionFlag && compressionMethod !== 0) return null;

    const languageEnd = findNullByte(data, keywordEnd + 3);
    if (languageEnd < 0) return null;
    const translatedEnd = findNullByte(data, languageEnd + 1);
    if (translatedEnd < 0) return null;

    let textBytes = data.slice(translatedEnd + 1);
    if (compressionFlag) {
      const inflated = await inflatePngText(textBytes);
      if (!inflated) return null;
      textBytes = inflated;
    }

    return {
      keyword: decodeUtf8(data.slice(0, keywordEnd)),
      text: decodeUtf8(textBytes),
      type,
    };
  }

  return null;
}

async function extractPngTextEntries(buffer) {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < signature.length || !signature.every((value, index) => bytes[index] === value)) return [];

  const view = new DataView(buffer);
  const entries = [];
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = readPngUint32(view, offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const crcStart = dataStart + length;
    if (crcStart + 4 > bytes.length) break;

    const type = decodeAscii(bytes.slice(typeStart, typeStart + 4));
    if (type === "tEXt" || type === "zTXt" || type === "iTXt") {
      const entry = await parsePngTextChunk(type, bytes.slice(dataStart, crcStart));
      if (entry) entries.push(entry);
    }

    offset = crcStart + 4;
    if (type === "IEND") break;
  }

  return entries;
}

function tryParseJson(text) {
  if (!text || typeof text !== "string") return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

function looksLikeNovelAiMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Boolean(
    value.prompt ||
      value.uc ||
      value.negative_prompt ||
      value.v4_prompt ||
      value.v4_negative_prompt ||
      value.actual_prompts ||
      value.params ||
      value.parameters ||
      value.model,
  );
}

function parseNovelAiMetadataFromEntries(entries) {
  const ordered = [
    ...entries.filter((entry) => entry.keyword.toLowerCase() === "comment"),
    ...entries.filter((entry) => entry.keyword.toLowerCase() !== "comment"),
  ];
  const seen = new Set();

  for (const entry of ordered) {
    if (seen.has(entry)) continue;
    seen.add(entry);

    const parsed = tryParseJson(entry.text);
    if (looksLikeNovelAiMetadata(parsed)) return parsed;
  }

  return null;
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function firstText(...values) {
  for (const value of values) {
    const text = stringValue(value);
    if (text) return text;
  }
  return "";
}

function firstNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function readCaptionText(value) {
  if (!value) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value !== "object") return "";

  if (typeof value.caption === "string") return value.caption.trim();
  const caption = value.caption && typeof value.caption === "object" ? value.caption : value;
  return firstText(
    caption.base_caption,
    caption.baseCaption,
    caption.base,
    caption.prompt,
    caption.text,
    value.prompt,
    value.input,
  );
}

function readCaptionCharacters(value) {
  if (!value || typeof value !== "object") return [];
  const caption = value.caption && typeof value.caption === "object" ? value.caption : value;
  const rawCharacters = caption.char_captions || caption.charCaptions || caption.characters || [];
  if (!Array.isArray(rawCharacters)) return [];

  return rawCharacters
    .map((character) => {
      if (typeof character === "string") return character.trim();
      return firstText(
        character.char_caption,
        character.charCaption,
        character.caption,
        character.prompt,
        character.positive,
        character.text,
      );
    })
    .filter(Boolean);
}

function normalizeCharacterPrompts(positiveSource, negativeSource) {
  const positiveCharacters = readCaptionCharacters(positiveSource);
  const negativeCharacters = readCaptionCharacters(negativeSource);
  const count = Math.min(2, Math.max(positiveCharacters.length, negativeCharacters.length));
  const characters = [];

  for (let index = 0; index < count; index += 1) {
    const character = {
      positive: positiveCharacters[index] || "",
      negative: negativeCharacters[index] || "",
    };
    if (character.positive || character.negative) characters.push(character);
  }

  return characters;
}

function pickSafeExtraParameters(raw, params) {
  const source = { ...params, ...raw };
  const allowedKeys = ["qualityToggle", "ucPreset", "sm", "sm_dyn", "dynamic_thresholding"];
  const picked = {};

  for (const key of allowedKeys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) picked[key] = source[key];
  }

  picked.n_samples = FIXED_N_SAMPLES;
  return picked;
}

function normalizeInpaintModelName(model) {
  const text = stringValue(model);
  if (!text) return "";
  if (/-inpainting$/i.test(text)) return text;
  return `${text}-inpainting`;
}

function normalizeNovelAiMetadata(raw) {
  const params = raw.params && typeof raw.params === "object" ? raw.params : raw.parameters || {};
  const actualPrompts = raw.actual_prompts && typeof raw.actual_prompts === "object" ? raw.actual_prompts : {};
  const positiveSource = actualPrompts.prompt || raw.v4_prompt || params.v4_prompt;
  const negativeSource = actualPrompts.negative_prompt || actualPrompts.uc || raw.v4_negative_prompt || params.v4_negative_prompt;
  const prompt = firstText(
    readCaptionText(positiveSource),
    raw.prompt,
    raw.input,
    params.prompt,
    params.input,
  );
  const negativePrompt = firstText(
    readCaptionText(negativeSource),
    raw.uc,
    raw.negative_prompt,
    params.uc,
    params.negative_prompt,
  );

  return {
    raw,
    prompt,
    negativePrompt,
    characters: normalizeCharacterPrompts(positiveSource, negativeSource),
    model: stringValue(raw.model || params.model),
    inpaintModel: normalizeInpaintModelName(raw.model || params.model),
    seed: firstNumber(params.seed, raw.seed),
    sampler: stringValue(params.sampler || raw.sampler),
    scale: firstNumber(params.scale, raw.scale),
    guidanceRescale: firstNumber(params.cfg_rescale, params.cfgRescale, raw.cfg_rescale, raw.cfgRescale),
    noiseSchedule: stringValue(params.noise_schedule || params.noiseSchedule || raw.noise_schedule || raw.noiseSchedule),
    extraParameters: pickSafeExtraParameters(raw, params),
  };
}

async function readNovelAiMetadataFromFile(file) {
  if (!file || !/\.png$/i.test(file.name || "")) return null;
  const buffer = await file.arrayBuffer();
  const entries = await extractPngTextEntries(buffer);
  const raw = parseNovelAiMetadataFromEntries(entries);
  return raw ? normalizeNovelAiMetadata(raw) : null;
}

function setMetadataStatus(message, kind = "") {
  if (!els.metadataStatus) return;
  els.metadataStatus.textContent = message;
  els.metadataStatus.classList.toggle("error", kind === "error");
  els.metadataStatus.classList.toggle("ok", kind === "ok");
}

function updateMetadataBox() {
  if (!els.metadataBox) return;
  const metadata = state.novelAiMetadata;
  els.metadataBox.hidden = !metadata;

  if (!metadata) {
    els.metadataSummary.textContent = "";
    setMetadataStatus("");
    return;
  }

  const parts = [];
  if (metadata.prompt) parts.push("prompt");
  if (metadata.negativePrompt) parts.push("negative");
  if (metadata.characters.length) parts.push("characters");
  if (
    metadata.model ||
    metadata.seed !== null ||
    metadata.sampler ||
    metadata.scale !== null ||
    metadata.guidanceRescale !== null ||
    metadata.noiseSchedule
  ) {
    parts.push("settings");
  }

  els.metadataSummary.textContent = `${metadata.model || "NovelAI PNG"} / ${parts.join(", ") || "metadata"}`;
  els.applyMetaPromptButton.disabled = !metadata.prompt;
  els.applyMetaNegativeButton.disabled = !metadata.negativePrompt;
  els.applyMetaCharactersButton.disabled = !metadata.characters.length;
  els.applyMetaSettingsButton.disabled = !parts.includes("settings");
  els.applyMetaAllButton.disabled = !parts.length;
  setMetadataStatus("NovelAI metadata found. Apply the parts you want.");
}

function setSelectValue(select, value) {
  if (!value) return false;
  const option = Array.from(select.options).find((item) => item.value === value);
  if (!option) return false;
  select.value = value;
  return true;
}

function readExtraParametersLenient() {
  const text = els.apiExtraInput.value.trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function applyNovelAiMetadata(part) {
  const metadata = state.novelAiMetadata;
  if (!metadata) return;
  const applied = [];
  const applyAll = part === "all";

  if ((applyAll || part === "prompt") && metadata.prompt) {
    els.apiPromptInput.value = metadata.prompt;
    applied.push("prompt");
  }

  if ((applyAll || part === "negative") && metadata.negativePrompt) {
    els.apiNegativeInput.value = metadata.negativePrompt;
    applied.push("negative");
  }

  if ((applyAll || part === "characters") && metadata.characters.length) {
    const [first = {}, second = {}] = metadata.characters;
    els.apiCharacterPositive1.value = first.positive || "";
    els.apiCharacterNegative1.value = first.negative || "";
    els.apiCharacterPositive2.value = second.positive || "";
    els.apiCharacterNegative2.value = second.negative || "";
    applied.push("characters");
  }

  if (applyAll || part === "settings") {
    if (metadata.inpaintModel) els.apiModelInput.value = metadata.inpaintModel;
    if (metadata.seed !== null) els.apiSeedInput.value = String(metadata.seed);
    if (metadata.scale !== null) els.apiScaleInput.value = String(metadata.scale);
    if (metadata.guidanceRescale !== null) els.apiGuidanceRescaleInput.value = String(metadata.guidanceRescale);
    setSelectValue(els.apiSamplerSelect, metadata.sampler);
    setSelectValue(els.apiNoiseScheduleSelect, metadata.noiseSchedule);

    const extra = {
      ...readExtraParametersLenient(),
      ...metadata.extraParameters,
      n_samples: FIXED_N_SAMPLES,
    };
    els.apiExtraInput.value = JSON.stringify(extra, null, 2);
    els.apiStepsInput.value = String(FIXED_STEPS);
    applied.push("settings");
  }

  if (applied.length) {
    setMetadataStatus(`Applied: ${applied.join(", ")}.`, "ok");
  } else {
    setMetadataStatus("This image has no matching metadata for that button.", "error");
  }
}

async function loadImageFromFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageUrl(url);
    const metadata = await readNovelAiMetadataFromFile(file).catch(() => null);
    setOriginalImage(image, file.name, metadata);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImageUrl(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("이미지를 열 수 없습니다."));
    image.src = url;
  });
}

async function loadImageBlob(blob) {
  const url = URL.createObjectURL(blob);
  try {
    return await loadImageUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function setOriginalImage(image, name, metadata = null) {
  state.image = image;
  state.imageName = name || "sample.png";
  state.novelAiMetadata = metadata;
  state.crop = makeDefaultCrop(image);
  state.inpaintImage = null;
  state.inpaintName = "";
  state.maskCanvas = document.createElement("canvas");
  resizeMaskCanvas(false);
  updateControls();
  updateMetadataBox();
  setMode("crop");
  requestRender();
}

function resetApp() {
  state.image = null;
  state.imageName = "";
  state.crop = { x: 0, y: 0, w: 0, h: 0 };
  state.maskCanvas = document.createElement("canvas");
  state.maskHistory = [];
  state.maskRedo = [];
  state.maskDirty = false;
  state.inpaintImage = null;
  state.inpaintName = "";
  state.novelAiMetadata = null;
  state.drag = null;
  updateControls();
  updateMetadataBox();
  setMode("crop");
  requestRender();
}

function buildSampleImage() {
  const sample = document.createElement("canvas");
  sample.width = 1600;
  sample.height = 1200;
  const sampleCtx = sample.getContext("2d");
  const gradient = sampleCtx.createLinearGradient(0, 0, sample.width, sample.height);
  gradient.addColorStop(0, "#ccd8d3");
  gradient.addColorStop(0.5, "#8aa99b");
  gradient.addColorStop(1, "#24372f");
  sampleCtx.fillStyle = gradient;
  sampleCtx.fillRect(0, 0, sample.width, sample.height);

  sampleCtx.fillStyle = "rgb(255 255 255 / 0.35)";
  for (let i = 0; i < 18; i += 1) {
    const x = 120 + i * 86;
    const y = 120 + Math.sin(i * 0.9) * 80;
    sampleCtx.fillRect(x, y, 42, 760);
  }

  sampleCtx.fillStyle = "#f2f6f2";
  sampleCtx.beginPath();
  sampleCtx.ellipse(800, 620, 250, 330, -0.1, 0, Math.PI * 2);
  sampleCtx.fill();

  sampleCtx.fillStyle = "#1d2f28";
  sampleCtx.beginPath();
  sampleCtx.ellipse(740, 560, 36, 22, -0.2, 0, Math.PI * 2);
  sampleCtx.ellipse(875, 560, 36, 22, 0.2, 0, Math.PI * 2);
  sampleCtx.fill();
  sampleCtx.fillRect(760, 740, 92, 18);

  const image = new Image();
  image.onload = () => setOriginalImage(image, "sample-1600x1200.png");
  image.src = sample.toDataURL("image/png");
}

async function loadResultFromFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  try {
    state.inpaintImage = await loadImageUrl(url);
    state.inpaintName = file.name;
    setMode("blend");
    requestRender();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function buildCropCanvas() {
  const cropCanvas = document.createElement("canvas");
  cropCanvas.width = state.crop.w;
  cropCanvas.height = state.crop.h;
  const cropCtx = cropCanvas.getContext("2d");
  cropCtx.imageSmoothingQuality = "high";
  cropCtx.drawImage(
    state.image,
    state.crop.x,
    state.crop.y,
    state.crop.w,
    state.crop.h,
    0,
    0,
    state.crop.w,
    state.crop.h,
  );
  return cropCanvas;
}

function getNovelAiMaskSize(width = state.crop.w, height = state.crop.h) {
  return {
    width: Math.max(1, Math.floor(width / NAI_MASK_SCALE)),
    height: Math.max(1, Math.floor(height / NAI_MASK_SCALE)),
  };
}

function buildNovelAiLowResMaskCanvas() {
  const { width, height } = getNovelAiMaskSize();
  const lowCanvas = document.createElement("canvas");
  lowCanvas.width = width;
  lowCanvas.height = height;
  const lowCtx = lowCanvas.getContext("2d", { willReadFrequently: true });
  lowCtx.imageSmoothingEnabled = false;
  lowCtx.drawImage(state.maskCanvas, 0, 0, width, height);

  const imageData = lowCtx.getImageData(0, 0, width, height);
  for (let i = 0; i < imageData.data.length; i += 4) {
    const masked = imageData.data[i + 3] > NAI_MASK_THRESHOLD ? 255 : 0;
    imageData.data[i] = masked;
    imageData.data[i + 1] = masked;
    imageData.data[i + 2] = masked;
    imageData.data[i + 3] = masked;
  }
  lowCtx.putImageData(imageData, 0, 0);
  return lowCanvas;
}

function buildNovelAiAlphaMaskCanvas() {
  const alphaCanvas = document.createElement("canvas");
  alphaCanvas.width = state.crop.w;
  alphaCanvas.height = state.crop.h;
  const alphaCtx = alphaCanvas.getContext("2d");
  alphaCtx.imageSmoothingEnabled = false;
  alphaCtx.drawImage(buildNovelAiLowResMaskCanvas(), 0, 0, state.crop.w, state.crop.h);
  return alphaCanvas;
}

function buildNovelAiServerMaskCanvas() {
  const maskCanvas = document.createElement("canvas");
  maskCanvas.width = state.crop.w;
  maskCanvas.height = state.crop.h;
  const maskCtx = maskCanvas.getContext("2d");
  maskCtx.fillStyle = "black";
  maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
  maskCtx.imageSmoothingEnabled = false;
  maskCtx.drawImage(buildNovelAiLowResMaskCanvas(), 0, 0, maskCanvas.width, maskCanvas.height);
  return maskCanvas;
}

function buildMaskExportCanvas(format) {
  if (format === "bw") {
    return buildNovelAiServerMaskCanvas();
  }

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = state.crop.w;
  exportCanvas.height = state.crop.h;
  const exportCtx = exportCanvas.getContext("2d");
  const sourceCtx = buildNovelAiAlphaMaskCanvas().getContext("2d", { willReadFrequently: true });
  const source = sourceCtx.getImageData(0, 0, state.crop.w, state.crop.h);
  const output = exportCtx.createImageData(state.crop.w, state.crop.h);

  for (let i = 0; i < source.data.length; i += 4) {
    const alpha = source.data[i + 3];
    output.data[i] = 255;
    output.data[i + 1] = 255;
    output.data[i + 2] = 255;
    output.data[i + 3] = alpha;
  }

  exportCtx.putImageData(output, 0, 0);
  return exportCanvas;
}

function canvasToBase64(canvas) {
  return canvas.toDataURL("image/png").split(",", 2)[1];
}

function makeRandomSeed() {
  return Math.floor(Math.random() * 4294967295);
}

function getNumberValue(input, fallback) {
  const value = Number(input.value);
  return Number.isFinite(value) ? value : fallback;
}

function readExtraParameters() {
  const text = els.apiExtraInput.value.trim();
  if (!text) return {};

  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("추가 파라미터 JSON은 객체여야 합니다.");
  }
  return parsed;
}

function readCharacterPrompts() {
  return [
    {
      positive: els.apiCharacterPositive1.value.trim(),
      negative: els.apiCharacterNegative1.value.trim(),
    },
    {
      positive: els.apiCharacterPositive2.value.trim(),
      negative: els.apiCharacterNegative2.value.trim(),
    },
  ].filter((character) => character.positive || character.negative);
}

function makeV4Caption(baseCaption, characters, key) {
  return {
    caption: {
      base_caption: baseCaption,
      char_captions: characters
        .filter((character) => character[key])
        .map((character) => ({
          char_caption: character[key],
        })),
    },
    use_coords: false,
    use_order: true,
  };
}

function buildNovelAiPayload() {
  const prompt = els.apiPromptInput.value.trim();
  const negativePrompt = els.apiNegativeInput.value.trim();
  const model = els.apiModelInput.value.trim();
  const endpoint = els.apiEndpointInput.value.trim();
  const seed = els.apiSeedInput.value.trim() ? getNumberValue(els.apiSeedInput, makeRandomSeed()) : makeRandomSeed();
  const extraParameters = readExtraParameters();
  const characterPrompts = readCharacterPrompts();

  if (!state.image) throw new Error("원본 이미지를 먼저 여세요.");
  if (!hasMask()) throw new Error("인페인트할 마스크를 칠하세요.");
  if (!prompt) throw new Error("프롬프트를 입력하세요.");
  if (!model) throw new Error("모델명을 입력하세요.");
  if (!endpoint) throw new Error("API 엔드포인트를 입력하세요.");

  if (state.crop.w * state.crop.h > FREE_MAX_PIXELS || state.crop.w > MAX_CROP || state.crop.h > MAX_CROP) {
    throw new Error("Free-safe mode only allows crops up to 1024 x 1024 / 1 megapixel.");
  }

  const parameters = {
    ...extraParameters,
    width: state.crop.w,
    height: state.crop.h,
    scale: getNumberValue(els.apiScaleInput, 5),
    cfg_rescale: getNumberValue(els.apiGuidanceRescaleInput, 0),
    sampler: els.apiSamplerSelect.value,
    noise_schedule: els.apiNoiseScheduleSelect.value,
    steps: FIXED_STEPS,
    seed,
    strength: getNumberValue(els.apiStrengthInput, 0.7),
    noise: getNumberValue(els.apiNoiseInput, 0.1),
    negative_prompt: negativePrompt,
    image: canvasToBase64(buildCropCanvas()),
    mask: canvasToBase64(buildNovelAiServerMaskCanvas()),
    n_samples: FIXED_N_SAMPLES,
    add_original_image: false,
  };

  if (characterPrompts.length) {
    parameters.v4_prompt = makeV4Caption(prompt, characterPrompts, "positive");
    parameters.v4_negative_prompt = makeV4Caption(negativePrompt, characterPrompts, "negative");
  }

  return {
    endpoint,
    payload: {
      input: prompt,
      model,
      action: "infill",
      parameters,
    },
  };
}

function setApiStatus(message, kind = "") {
  els.apiStatus.textContent = message;
  els.apiStatus.classList.toggle("error", kind === "error");
  els.apiStatus.classList.toggle("ok", kind === "ok");
}

function explainApiError(message) {
  if (/doesn'?t support action infill/i.test(message)) {
    return `${message}\n인페인트에는 모델명이 -inpainting으로 끝나는 모델을 써야 합니다. 예: nai-diffusion-4-5-full-inpainting`;
  }
  return message;
}

function setApiRunning(running) {
  state.apiRunning = running;
  els.apiInpaintButton.disabled = running;
  els.apiInpaintButton.textContent = running ? "API 호출 중" : "API 인페인트";
}

async function runNovelAiInpaint() {
  if (state.apiRunning) return;

  try {
    if (location.protocol === "file:") {
      throw new Error("API 기능은 localhost 서버에서만 동작합니다. PowerShell에서 node server.js로 실행하세요.");
    }

    const token = els.apiTokenInput.value.trim();
    if (!token) throw new Error("API 토큰을 입력하세요.");

    const request = buildNovelAiPayload();
    setApiRunning(true);
    setApiStatus("크롭과 마스크를 NovelAI API로 보내는 중입니다.");

    const response = await fetch("/api/novelai/inpaint", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        endpoint: request.endpoint,
        payload: request.payload,
      }),
    });

    if (!response.ok) {
      let detail = "";
      try {
        const errorPayload = await response.json();
        detail = errorPayload.detail || errorPayload.error || "";
      } catch {
        detail = await response.text();
      }
      throw new Error(explainApiError(detail || `API 호출 실패: ${response.status}`));
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      const payload = await response.json();
      throw new Error(payload.error || "이미지 응답이 아닙니다.");
    }

    const blob = await response.blob();
    const image = await loadImageBlob(blob);
    state.inpaintImage = image;
    state.inpaintName = "novelai-inpaint.png";
    updateStatus();
    setMode("blend");
    setApiStatus("API 인페인트 결과를 불러왔습니다. 전체 PNG 저장으로 합성본을 저장하세요.", "ok");
    requestRender();
  } catch (error) {
    setApiStatus(error.message || "API 호출 중 오류가 났습니다.", "error");
  } finally {
    setApiRunning(false);
  }
}

function buildScaledResultCanvas() {
  const resultCanvas = document.createElement("canvas");
  resultCanvas.width = state.crop.w;
  resultCanvas.height = state.crop.h;
  const resultCtx = resultCanvas.getContext("2d");
  resultCtx.imageSmoothingQuality = "high";
  resultCtx.drawImage(state.inpaintImage, 0, 0, state.crop.w, state.crop.h);
  return resultCanvas;
}

function buildFeatheredMaskCanvas() {
  const mask = document.createElement("canvas");
  mask.width = state.crop.w;
  mask.height = state.crop.h;
  const maskCtx = mask.getContext("2d");

  if (state.feather > 0) {
    maskCtx.filter = `blur(${state.feather}px)`;
  }

  maskCtx.imageSmoothingEnabled = false;
  maskCtx.drawImage(buildNovelAiAlphaMaskCanvas(), 0, 0);
  maskCtx.filter = "none";
  return mask;
}

function buildCompositeCanvas() {
  const output = document.createElement("canvas");
  output.width = state.image.naturalWidth;
  output.height = state.image.naturalHeight;
  const outputCtx = output.getContext("2d");
  outputCtx.imageSmoothingQuality = "high";
  outputCtx.drawImage(state.image, 0, 0);

  const resultCanvas = buildScaledResultCanvas();

  if (state.compositeScope === "mask" && hasMask()) {
    const masked = document.createElement("canvas");
    masked.width = state.crop.w;
    masked.height = state.crop.h;
    const maskedCtx = masked.getContext("2d");
    maskedCtx.drawImage(resultCanvas, 0, 0);
    maskedCtx.globalCompositeOperation = "destination-in";
    maskedCtx.drawImage(buildFeatheredMaskCanvas(), 0, 0);
    maskedCtx.globalCompositeOperation = "source-over";
    outputCtx.globalAlpha = state.opacity;
    outputCtx.drawImage(masked, state.crop.x, state.crop.y);
    outputCtx.globalAlpha = 1;
  } else {
    outputCtx.globalAlpha = state.opacity;
    outputCtx.drawImage(resultCanvas, state.crop.x, state.crop.y);
    outputCtx.globalAlpha = 1;
  }

  return output;
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) {
      alert("PNG를 만들 수 없습니다. 이미지 크기를 줄여 다시 시도하세요.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }, "image/png");
}

function safeBaseName() {
  return (state.imageName || "image").replace(/\.[^.]+$/, "").replace(/[^\w가-힣-]+/g, "_");
}

function exportCrop() {
  if (!state.image) return;
  downloadCanvas(buildCropCanvas(), `${safeBaseName()}_crop_${state.crop.w}x${state.crop.h}.png`);
}

function exportMask() {
  if (!state.image) return;
  downloadCanvas(
    buildMaskExportCanvas(els.maskFormatSelect.value),
    `${safeBaseName()}_mask_${state.crop.w}x${state.crop.h}.png`,
  );
}

function exportComposite() {
  if (!state.image || !state.inpaintImage) return;
  if (state.compositeScope === "mask" && !hasMask()) {
    alert("마스크가 비어 있습니다. 전체 크롭 합성을 선택하거나 마스크를 칠하세요.");
    return;
  }
  downloadCanvas(buildCompositeCanvas(), `${safeBaseName()}_patched.png`);
}

function handleCropInput() {
  setCrop({
    x: Number(els.cropXInput.value),
    y: Number(els.cropYInput.value),
    w: Number(els.cropWInput.value),
    h: Number(els.cropHInput.value),
  });
}

function centerCrop() {
  if (!state.image) return;
  setCrop({
    ...state.crop,
    x: (state.image.naturalWidth - state.crop.w) / 2,
    y: (state.image.naturalHeight - state.crop.h) / 2,
  });
}

function squareCrop() {
  if (!state.image) return;
  const size = Math.min(MAX_CROP, state.image.naturalWidth, state.image.naturalHeight, state.crop.w, state.crop.h);
  setCrop({
    x: state.crop.x + (state.crop.w - size) / 2,
    y: state.crop.y + (state.crop.h - size) / 2,
    w: size,
    h: size,
  });
}

function maxCrop() {
  if (!state.image) return;
  const w = Math.min(MAX_CROP, state.image.naturalWidth);
  const h = Math.min(MAX_CROP, state.image.naturalHeight);
  setCrop({
    x: state.crop.x,
    y: state.crop.y,
    w,
    h,
  });
}

function bindEvents() {
  els.originalInput.addEventListener("change", (event) => loadImageFromFile(event.target.files?.[0]));
  els.resultInput.addEventListener("change", (event) => loadResultFromFile(event.target.files?.[0]));
  els.loadSampleButton.addEventListener("click", buildSampleImage);
  els.resetButton.addEventListener("click", resetApp);
  els.cropModeButton.addEventListener("click", () => setMode("crop"));
  els.maskModeButton.addEventListener("click", () => setMode("mask"));
  els.blendModeButton.addEventListener("click", () => setMode("blend"));
  els.paintButton.addEventListener("click", () => setBrushMode("paint"));
  els.eraseButton.addEventListener("click", () => setBrushMode("erase"));
  els.maskedCompositeButton.addEventListener("click", () => setCompositeScope("mask"));
  els.cropCompositeButton.addEventListener("click", () => setCompositeScope("crop"));
  els.centerCropButton.addEventListener("click", centerCrop);
  els.squareCropButton.addEventListener("click", squareCrop);
  els.maxCropButton.addEventListener("click", maxCrop);
  els.goMaskButton.addEventListener("click", enterMaskMode);
  els.undoMaskButton.addEventListener("click", undoMask);
  els.redoMaskButton.addEventListener("click", redoMask);
  els.clearMaskButton.addEventListener("click", clearMask);
  els.exportCropButton.addEventListener("click", exportCrop);
  els.exportMaskButton.addEventListener("click", exportMask);
  els.exportBothButton.addEventListener("click", () => {
    exportCrop();
    window.setTimeout(exportMask, 220);
  });
  els.exportCompositeButton.addEventListener("click", exportComposite);
  els.apiInpaintButton.addEventListener("click", runNovelAiInpaint);
  els.applyMetaPromptButton.addEventListener("click", () => applyNovelAiMetadata("prompt"));
  els.applyMetaNegativeButton.addEventListener("click", () => applyNovelAiMetadata("negative"));
  els.applyMetaCharactersButton.addEventListener("click", () => applyNovelAiMetadata("characters"));
  els.applyMetaSettingsButton.addEventListener("click", () => applyNovelAiMetadata("settings"));
  els.applyMetaAllButton.addEventListener("click", () => applyNovelAiMetadata("all"));

  for (const input of [els.cropXInput, els.cropYInput, els.cropWInput, els.cropHInput]) {
    input.addEventListener("change", handleCropInput);
  }

  els.brushSizeInput.addEventListener("input", () => {
    state.brushSize = Number(els.brushSizeInput.value);
    els.brushSizeOutput.textContent = `${state.brushSize} px`;
    requestRender();
  });

  els.squareBrushInput.addEventListener("change", () => {
    state.squareBrush = els.squareBrushInput.checked;
    requestRender();
  });

  els.featherInput.addEventListener("input", () => {
    state.feather = Number(els.featherInput.value);
    els.featherOutput.textContent = `${state.feather} px`;
    requestRender();
  });

  els.opacityInput.addEventListener("input", () => {
    state.opacity = Number(els.opacityInput.value) / 100;
    els.opacityOutput.textContent = `${Math.round(state.opacity * 100)}%`;
    requestRender();
  });

  els.canvas.addEventListener("pointerdown", onPointerDown);
  els.canvas.addEventListener("pointermove", onPointerMove);
  els.canvas.addEventListener("pointerup", onPointerUp);
  els.canvas.addEventListener("pointercancel", onPointerUp);
  els.canvas.addEventListener("pointerleave", onPointerLeave);

  window.addEventListener("keydown", (event) => {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === "1") setMode("crop");
    if (event.key === "2") setMode("mask");
    if (event.key === "3") setMode("blend");
    if (event.key.toLowerCase() === "b") setBrushMode("paint");
    if (event.key.toLowerCase() === "e") setBrushMode("erase");
    if (event.key === "[") {
      state.brushSize = clamp(state.brushSize - 4, 4, 180);
      els.brushSizeInput.value = state.brushSize;
      els.brushSizeOutput.textContent = `${state.brushSize} px`;
      requestRender();
    }
    if (event.key === "]") {
      state.brushSize = clamp(state.brushSize + 4, 4, 180);
      els.brushSizeInput.value = state.brushSize;
      els.brushSizeOutput.textContent = `${state.brushSize} px`;
      requestRender();
    }
  });
}

function init() {
  bindEvents();
  updateControls();
  updateStatus();
  updateMetadataBox();
  setMode("crop");

  const resizeObserver = new ResizeObserver(setCanvasSize);
  resizeObserver.observe(els.canvas);
  window.addEventListener("resize", setCanvasSize);
  setCanvasSize();
}

init();
