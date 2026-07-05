# Patchwright

Patchwright is a local browser tool for NovelAI-style partial inpainting.

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

NovelAI metadata import reads PNG text metadata such as `Comment` JSON, including compressed `iTXt`/`zTXt` chunks when the browser supports decompression. Imported settings never override the free-safe locks below.

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
