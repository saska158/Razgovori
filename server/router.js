const fs = require('fs')
const path = require('path')
const Anthropic = require('@anthropic-ai/sdk')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const ROUTER_SYSTEM_PROMPT = `You are a moderation routing agent. Your job is to classify an incoming report and select the most appropriate skill to handle it.

Think through the nature of the violation first — what kind of harm is this? Is it aimed at a person, a group, or based on false information? Then call select_skill with the best matching skill ID.`

const getAvailableSkills = () => {
  const skillsDir = path.join(__dirname, 'skills')
  const skills = []

  for (const skillName of fs.readdirSync(skillsDir).sort()) {
    const skillPath = path.join(skillsDir, skillName, 'SKILL.md')
    if (!fs.existsSync(skillPath)) continue

    const content = fs.readFileSync(skillPath, 'utf-8')
    const match = content.match(/^---\n([\s\S]*?)\n---/)
    if (!match) continue

    const frontmatter = match[1]
    const nameMatch = frontmatter.match(/^name:\s*(.+)$/m)
    const descMatch = frontmatter.match(/^description:\s*(.+)$/m)

    skills.push({
      id: skillName,
      name: nameMatch?.[1]?.trim() || skillName,
      description: descMatch?.[1]?.trim() || ''
    })
  }

  return skills
}

const SELECT_SKILL_TOOL = (skills) => ({
  name: 'select_skill',
  description: 'Select the appropriate moderation skill for this report',
  input_schema: {
    type: 'object',
    properties: {
      skill_id: {
        type: 'string',
        enum: skills.map(s => s.id),
        description: 'The ID of the skill to use'
      },
      reasoning: {
        type: 'string',
        description: 'One sentence explaining why this skill was selected'
      }
    },
    required: ['skill_id', 'reasoning']
  }
})

const runRouter = async ({ postText, postImage, room, emit = () => {} }) => {
  const skills = getAvailableSkills()

  if (!skills.length) {
    console.warn('[router] No skills found, falling back to content-toxicity')
    return 'content-toxicity'
  }

  if (!postText?.trim()) {
    const reasoning = postImage
      ? 'Image-only post — routed to content-toxicity for visual content review'
      : 'No post content — defaulting to content-toxicity'
    console.log(`[router] Skipping LLM: ${reasoning}`)
    emit({ type: 'routing', skill: 'content-toxicity', reasoning })
    return 'content-toxicity'
  }

  const skillList = skills.map(s => `- ${s.id}: ${s.description}`).join('\n')
  const tools = [SELECT_SKILL_TOOL(skills)]

  const messages = [
    {
      role: 'user',
      content: `Incoming report:
Room: ${room}
Post text: "${postText}"${postImage ? '\n(Post also contains an image)' : ''}

Available skills:
${skillList}

Select the most appropriate skill.`
    }
  ]

  const MAX_RETRIES = 2

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: ROUTER_SYSTEM_PROMPT,
      tools,
      messages
    })

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        console.log(`[router] Reasoning (attempt ${attempt}): ${block.text.trim()}`)
        emit({ type: 'router_reasoning', text: block.text.trim() })
      }
    }

    const toolUse = response.content.find(b => b.type === 'tool_use')
    if (toolUse?.input?.skill_id) {
      console.log(`[router] Selected skill: ${toolUse.input.skill_id} — ${toolUse.input.reasoning}`)
      emit({ type: 'routing', skill: toolUse.input.skill_id, reasoning: toolUse.input.reasoning })
      return toolUse.input.skill_id
    }

    console.warn(`[router] Attempt ${attempt} did not call select_skill — retrying`)
    messages.push({ role: 'assistant', content: response.content })
    messages.push({
      role: 'user',
      content: 'You must select a skill using the select_skill tool. Do not respond with text only.'
    })
  }

  console.warn('[router] Failed to select a skill after retries, falling back to content-toxicity')
  emit({ type: 'routing', skill: 'content-toxicity', reasoning: 'Fallback — no skill selected after retries' })
  return 'content-toxicity'
}

module.exports = { runRouter }
