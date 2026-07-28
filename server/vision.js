const Anthropic = require('@anthropic-ai/sdk')
const axios = require('axios')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SUPPORTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp'])

const detectMediaType = (buffer) => {
  const b = new Uint8Array(buffer.slice(0, 12))
  if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png'
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif'
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp'
  return null
}

const fetchBuffer = async (url) => {
  const res = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 10_000,
    validateStatus: (status) => status === 200
  })
  return Buffer.from(res.data)
}

const analyzeImage = async (imageUrl, context = '') => {
  try {
    let buf = await fetchBuffer(imageUrl)
    let mediaType = detectMediaType(buf)

    if (!mediaType || !SUPPORTED_TYPES.has(mediaType)) {
      // Try fetching as JPEG — Cloudinary converts on the fly via extension swap
      const jpegUrl = imageUrl.replace(/\.(avif|heic|heif)(\?.*)?$/, '.jpg')
      if (jpegUrl !== imageUrl) {
        try {
          buf = await fetchBuffer(jpegUrl)
          mediaType = detectMediaType(buf)
        } catch {
          // fallback fetch failed
        }
      }
    }

    if (!mediaType || !SUPPORTED_TYPES.has(mediaType)) {
      console.warn('[vision] Unsupported image format — skipping analysis')
      return { error: 'Unsupported image format', summary: 'Image format not supported by vision API — treated as missing data' }
    }

    const base64 = buf.toString('base64')

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 512,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 }
          },
          {
            type: 'text',
            text: `You are a content moderation tool. Analyze this image for policy violations.${context ? ` Post context: "${context}"` : ''}

Respond with a JSON object only, no other text:
{
  "safe": true or false,
  "explicit": "none" or "mild" or "moderate" or "severe",
  "violence": "none" or "mild" or "moderate" or "severe",
  "hate_symbols": true or false,
  "dangerous_content": true or false,
  "summary": "one sentence describing what the image shows and any concerns"
}`
          }
        ]
      }]
    })

    const text = response.content[0].text.trim()
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) return JSON.parse(jsonMatch[0])
    return { safe: true, summary: text, parseError: true }
  } catch (error) {
    console.error('[vision] Image analysis failed:', error.message)
    return { error: error.message }
  }
}

module.exports = { analyzeImage }
