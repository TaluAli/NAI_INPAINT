const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 8787);
const ROOT = __dirname;
const MAX_BODY_BYTES = 28 * 1024 * 1024;
const OFFICIAL_NOVELAI_ENDPOINT = "https://image.novelai.net/ai/generate-image";
const FREE_MAX_DIMENSION = 1024;
const FREE_MAX_PIXELS = 1024 * 1024;
const FIXED_STEPS = 28;
const FIXED_N_SAMPLES = 1;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, headers);
  res.end(body);
}

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), {
    "Content-Type": "application/json; charset=utf-8",
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;

    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("요청이 너무 큽니다."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function normalizeToken(token) {
  return String(token || "").replace(/^Bearer\s+/i, "").trim();
}

function validateFreeSafeInpaintPayload(payload) {
  if (!payload || typeof payload !== "object") return "API payload is missing.";
  if (payload.action !== "infill") return "Free-safe mode only allows NovelAI infill requests.";
  if (!String(payload.model || "").endsWith("-inpainting")) {
    return "Free-safe mode requires an inpainting model.";
  }

  const params = payload.parameters;
  if (!params || typeof params !== "object") return "NovelAI parameters are missing.";

  const width = Number(params.width);
  const height = Number(params.height);
  const steps = Number(params.steps);
  const nSamples = Number(params.n_samples ?? 1);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "Invalid image resolution.";
  }
  if (width > FREE_MAX_DIMENSION || height > FREE_MAX_DIMENSION || width * height > FREE_MAX_PIXELS) {
    return "Free-safe mode only allows crops up to 1024 x 1024 / 1 megapixel.";
  }
  if (steps !== FIXED_STEPS) return "Steps must be fixed at 28 in free-safe mode.";
  if (nSamples !== FIXED_N_SAMPLES) return "n_samples must be fixed at 1 in free-safe mode.";
  if (!params.image || !params.mask) return "Infill requests must include both image and mask.";
  if (params.add_original_image !== false) return "add_original_image must be false in free-safe mode.";

  return "";
}

function appendBase64Png(form, base64, fieldName) {
  const buffer = Buffer.from(String(base64 || ""), "base64");
  const blob = new Blob([buffer], { type: "image/png" });
  form.append(fieldName, blob);
  return fieldName;
}

function buildNovelAiMultipartPayload(payload) {
  const requestPayload = JSON.parse(JSON.stringify(payload));
  requestPayload.use_new_shared_trial = true;

  const form = new FormData();
  const params = requestPayload.parameters || {};

  if (params.image) {
    params.image = appendBase64Png(form, params.image, "image");
  }
  if (params.mask) {
    params.mask = appendBase64Png(form, params.mask, "mask");
  }

  form.append("request", new Blob([JSON.stringify(requestPayload)], { type: "application/json" }));
  return form;
}

function makeNovelAiCorrelationId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.randomBytes(6);
  let id = "";
  for (const byte of bytes) {
    id += alphabet[byte % alphabet.length];
  }
  return id;
}

function findEndOfCentralDirectory(buffer) {
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}

function inflateZipEntry(buffer, entry) {
  const localOffset = entry.localOffset;
  if (buffer.readUInt32LE(localOffset) !== 0x04034b50) {
    throw new Error("ZIP local header를 읽을 수 없습니다.");
  }

  const fileNameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + fileNameLength + extraLength;
  const compressed = buffer.subarray(dataOffset, dataOffset + entry.compressedSize);

  if (entry.method === 0) return compressed;
  if (entry.method === 8) return zlib.inflateRawSync(compressed);
  throw new Error(`지원하지 않는 ZIP 압축 방식입니다: ${entry.method}`);
}

function extractFirstImageFromZip(buffer) {
  const eocd = findEndOfCentralDirectory(buffer);
  if (eocd < 0) return null;

  const entryCount = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = [];

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.subarray(offset + 46, offset + 46 + fileNameLength).toString("utf8");

    entries.push({ name, method, compressedSize, localOffset });
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  const entry = entries.find((item) => /\.png$/i.test(item.name)) || entries[0];
  if (!entry) return null;
  return inflateZipEntry(buffer, entry);
}

async function proxyNovelAi(req, res) {
  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw.toString("utf8"));
    const token = normalizeToken(body.token);
    const endpoint = String(body.endpoint || OFFICIAL_NOVELAI_ENDPOINT).trim();

    if (!token) {
      sendJson(res, 400, { error: "API 토큰이 비어 있습니다." });
      return;
    }

    if (!body.payload || typeof body.payload !== "object") {
      sendJson(res, 400, { error: "API payload가 없습니다." });
      return;
    }

    if (endpoint !== OFFICIAL_NOVELAI_ENDPOINT) {
      sendJson(res, 400, { error: "Only the official NovelAI image endpoint is allowed in free-safe mode." });
      return;
    }

    const freeSafeError = validateFreeSafeInpaintPayload(body.payload);
    if (freeSafeError) {
      sendJson(res, 400, { error: freeSafeError });
      return;
    }

    const correlationId = makeNovelAiCorrelationId();
    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Accept": "application/zip,image/png,application/json;q=0.9,*/*;q=0.8",
        "x-correlation-id": correlationId,
        "x-initiated-at": new Date().toISOString(),
      },
      body: buildNovelAiMultipartPayload(body.payload),
    });

    const responseBuffer = Buffer.from(await upstream.arrayBuffer());
    const upstreamType = upstream.headers.get("content-type") || "application/octet-stream";

    if (!upstream.ok) {
      const rawMessage = responseBuffer.toString("utf8").slice(0, 4000);
      let message = rawMessage;
      try {
        const parsed = JSON.parse(rawMessage);
        message = parsed.message || parsed.error || rawMessage;
      } catch {}
      sendJson(res, upstream.status, {
        error: `NovelAI API 오류 ${upstream.status}`,
        detail: message,
      });
      return;
    }

    if (responseBuffer.length >= 4 && responseBuffer.readUInt32LE(0) === 0x04034b50) {
      const image = extractFirstImageFromZip(responseBuffer);
      if (!image) {
        sendJson(res, 502, { error: "NovelAI ZIP 응답에서 이미지를 찾지 못했습니다." });
        return;
      }
      send(res, 200, image, {
        "Content-Type": "image/png",
        "Cache-Control": "no-store",
      });
      return;
    }

    send(res, 200, responseBuffer, {
      "Content-Type": upstreamType,
      "Cache-Control": "no-store",
    });
  } catch (error) {
    sendJson(res, 500, { error: error.message || "프록시 처리 중 오류가 났습니다." });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const requested = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.resolve(ROOT, `.${requested}`);

  if (!filePath.startsWith(ROOT)) {
    send(res, 403, "Forbidden", { "Content-Type": "text/plain; charset=utf-8" });
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      send(res, 404, "Not found", { "Content-Type": "text/plain; charset=utf-8" });
      return;
    }

    send(res, 200, data, {
      "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/novelai/inpaint") {
    proxyNovelAi(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  send(res, 405, "Method not allowed", { "Content-Type": "text/plain; charset=utf-8" });
});

server.listen(PORT, HOST, () => {
  console.log(`Patchwright running at http://${HOST}:${PORT}`);
});
