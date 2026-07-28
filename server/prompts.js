const fs = require('fs')
const path = require('path')

const readIfExists = (filePath) => {
  try {
    return fs.readFileSync(filePath, 'utf-8')
  } catch {
    return null
  }
}

const stripFrontmatter = (content) => content.replace(/^---[\s\S]*?---\n/, '')

const buildSystemPrompt = (skillName) => {
  const skillDir = path.join(__dirname, 'skills', skillName)

  const skill = readIfExists(path.join(skillDir, 'SKILL.md'))
  if (!skill) throw new Error(`Skill not found: ${skillName}`)

  const parts = [stripFrontmatter(skill)]

  const refsDir = path.join(skillDir, 'references')
  if (fs.existsSync(refsDir)) {
    for (const file of fs.readdirSync(refsDir).sort()) {
      const content = readIfExists(path.join(refsDir, file))
      if (content) parts.push(`---\n\n${content}`)
    }
  }

  parts.push(`---

## Perspective toxicity score

Use the \`call_perspective\` tool to score the post text for toxicity (0–1). Call it when the toxicity signal would help calibrate your decision. If you call it, reference the score explicitly in your reasoning — state the score, explain how much weight you gave it for this type of content, and why. If the violation type is unlikely to correlate with toxicity tone (e.g. calm misinformation), you may skip it.

---

## Image analysis

If the reported post contains an image — check the \`content.image\` field returned by \`get_post\`, or use the URL provided in your initial context — call \`analyze_image\` with that URL. Visual content violations (explicit imagery, graphic violence, hate symbols) can be severe even when the post text appears benign, so always analyze the image if one is present. Pass the post text as \`context\` to help interpret ambiguous images.

Reference the result explicitly in your reasoning:
- **Image is clean + text is clean** → strong signal to dismiss the report. Do not let user history override a clean content assessment.
- **Image flags violations** → treat as primary evidence and weight your decision accordingly.
- **Image analysis errors** → do not assume the image is harmful. Treat the error as missing data, not as evidence of a violation. Base your decision on the text and other available signals instead.`)

  return parts.join('\n\n')
}

module.exports = { buildSystemPrompt }
