# Patchwright

Patchwright is a local browser tool for NovelAI-style partial inpainting.

## 업데이트 내역 / Update Notes

- 2026-07-05: 이미지 파일 드래그 앤 드롭으로 원본 이미지를 바로 불러오고, 브라우저가 이미지를 새 페이지로 여는 기본 동작을 차단했습니다. / Added drag-and-drop image loading and prevented the browser's default image-open behavior.
- 2026-07-05: NovelAI multipart 요청에서 `request`를 일반 텍스트 필드로 보내고 V4 모델에는 항상 `v4_prompt` 구조를 포함하도록 수정했습니다. / Fixed NovelAI multipart requests to send `request` as a text field and always include the `v4_prompt` structure for V4 models.
- 2026-07-05: NovelAI API가 요구하는 6자리 영문/숫자 `x-correlation-id`를 사용하도록 수정했습니다. / Fixed `x-correlation-id` generation to use the 6-character alphanumeric value required by the NovelAI API.
- 2026-07-05: NovelAI PNG의 텍스트/숨김 메타데이터에서 프롬프트, 네거티브 프롬프트, 캐릭터 프롬프트, 설정을 선택 적용할 수 있게 했습니다. / Added selective import for prompt, negative prompt, character prompts, and settings from text and hidden NovelAI PNG metadata.
- 2026-07-05: API 인페인트 요청은 28 steps, 1 sample, 1024 x 1024 이하 크롭만 허용하도록 무료 안전 잠금을 유지합니다. / Kept free-safe API locks: 28 steps, 1 sample, and crop sizes up to 1024 x 1024.

## Run

Double-click:

```text
Patchwright 실행.cmd
```

Or run manually:

```powershell
cd E:\NAI_INPAINT
node server.js
```

Then open:

```text
http://127.0.0.1:8787
```

The API feature requires this local server. Opening `index.html` directly still works for manual crop, mask, and composite, but direct NovelAI API calls are disabled there.

## Workflow

1. Open a high-resolution source image.
2. Move or resize the crop box. Width and height are clamped to 1024 px.
3. Click `이 크롭에서 마스크 칠하기`, then paint the exact area to regenerate.
4. If the source is a NovelAI PNG, use the metadata buttons to apply prompt, negative prompt, character prompts, settings, or all detected metadata.
5. Enter your NovelAI API token, base prompt, negative prompt, and optional character prompts.
6. Set Prompt Guidance, Guidance Rescale, Seed, Sampler, Noise Schedule, strength, and noise.
7. Click API inpaint. Only the crop PNG and mask PNG are sent through the local proxy.
8. Adjust feather and opacity, then export the full patched PNG.

Manual export/import is still available with the crop PNG, mask PNG, and inpaint result controls.

The original high-resolution image stays in the browser. The local proxy forwards only the selected crop, mask, prompt, and API parameters to NovelAI.

NovelAI metadata import reads PNG text metadata such as `Comment` JSON, compressed `iTXt`/`zTXt` chunks when the browser supports decompression, and hidden `stealth_pnginfo`/`stealth_pngcomp` metadata stored in image pixels. Imported settings never override the free-safe locks below.

## Free-safe locks

- Steps are always forced to `28`.
- `n_samples` is always forced to `1`.
- Crop resolution is blocked above `1024 x 1024` or `1,048,576` pixels.
- The local proxy rejects non-infill requests, non-inpainting models, non-official NovelAI endpoints, and payloads that bypass these locks.

## Files

- `index.html`: app shell
- `styles.css`: responsive editor layout and theme tokens
- `app.js`: canvas editor, mask export, and composite logic
- `server.js`: local static server and NovelAI API proxy

The default API payload uses NovelAI's known `generate-image` and `infill` request shape. If NovelAI changes model names or parameters, edit the model field or the extra parameter JSON in the app.

For inpainting, use an inpainting model such as `nai-diffusion-4-5-full-inpainting`. Plain generation models such as `nai-diffusion-4-5-full` do not support the `infill` action.
