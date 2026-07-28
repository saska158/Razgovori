# Image Analysis in the Moderation Pipeline

## Overview

When a reported post contains an image, the moderation agent calls `analyze_image` before making a decision. The analysis is performed by Claude Sonnet (vision-capable) and returns structured severity ratings the agent uses as primary evidence.

---

## How it works

### 1. Download and format detection

The image is downloaded server-side using axios (`responseType: 'arraybuffer'`). The format is detected from the first 12 bytes of the file (magic bytes), not from the `Content-Type` header or URL extension, which can be unreliable:

| Format | Magic bytes |
|--------|-------------|
| JPEG | `FF D8 FF` |
| PNG | `89 50 4E 47` |
| GIF | `47 49 46` |
| WebP | `52 49 46 46 ... 57 45 42 50` |

Claude's vision API supports JPEG, PNG, GIF, and WebP only.

### 2. AVIF fallback

Cloudinary serves images in AVIF format by default when the client supports it. AVIF is not supported by the vision API. If the detected format is not in the supported set, `vision.js` strips the `.avif` (or `.heic`/`.heif`) extension from the URL and re-fetches as `.jpg` — Cloudinary converts on the fly:

```
https://.../rfzfo3pxvyg9ug42b1se.avif
                         ↓
https://.../rfzfo3pxvyg9ug42b1se.jpg
```

If the fallback also fails, the function returns a graceful error object. The agent treats this as **missing data**, not as evidence of a violation.

### 3. Base64 encoding and API call

The downloaded buffer is base64-encoded and sent directly to Claude — no URL is passed to the model. This avoids network fetch timeouts inside the Claude API and ensures the image is always available regardless of Cloudinary access controls.

### 4. Structured output

The vision model returns a JSON object:

```json
{
  "safe": true,
  "explicit": "none | mild | moderate | severe",
  "violence": "none | mild | moderate | severe",
  "hate_symbols": false,
  "dangerous_content": false,
  "summary": "one sentence describing what the image shows and any concerns"
}
```

---

## Context: how post text shapes image interpretation

The most important design decision in image analysis is the `context` parameter. When the agent calls `analyze_image`, it passes the post text alongside the image URL:

```js
analyze_image({
  image_url: "https://...",
  context: "I know where you live"
})
```

The vision prompt becomes:

> You are a content moderation tool. Analyze this image for policy violations. Post context: "I know where you live"

Claude sees **both** at the same time. This matters because:

| Image alone | Text alone | Combined |
|-------------|------------|----------|
| House photo → clean | "I know where you live" → borderline | **Threat — flags dangerous content** |
| Person photo → clean | No text | Clean |
| Protest sign → clean | Slur in caption → flagged by text | Image analysis confirms or contradicts |

Without context, a house photo is always benign. With a threatening caption, the same photo is evidence of a stalking threat. The vision model makes this judgment — the moderation agent doesn't need to correlate them manually.

---

## How the agent uses the result

The agent skill prompt (`prompts.js`) gives explicit instructions for each outcome:

- **Image is clean + text is clean** → strong signal to dismiss. Do not let user history override a clean content assessment.
- **Image flags violations** → treat as primary evidence and weight the decision accordingly.
- **Image analysis errors** → treat as missing data. Base the decision on text and other signals instead. Do not assume the image is harmful.

The result summary shown in the moderation trace UI:
- Safe image: `Safe — <one sentence description>`
- Flagged image: `Flagged — explicit:severe` (or whichever flags were raised)
- Error: `Format error — skipped`

---

## Files

| File | Role |
|------|------|
| `server/vision.js` | Downloads image, detects format, AVIF fallback, calls Claude vision |
| `server/tools.js` | Defines `analyze_image` tool schema and wires it to `vision.js` |
| `server/agent.js` | Adds `analyze_image` to context tools; summarizes result for SSE stream |
| `server/prompts.js` | Appends image analysis decision rules to every skill's system prompt |
