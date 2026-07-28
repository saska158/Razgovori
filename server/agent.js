const Anthropic = require('@anthropic-ai/sdk')
const { buildSystemPrompt } = require('./prompts')
const { TOOL_DEFINITIONS, executeTool } = require('./tools')
const { db } = require('./firebase')

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DECISION_TOOLS = new Set(['dismiss_report', 'warn_user', 'remove_post', 'ban_user'])
const ACCUMULATING_TOOLS = new Set(['remove_additional_post'])
const CONTEXT_TOOLS = new Set(['analyze_image', 'call_perspective', 'get_post', 'get_comments', 'get_user_history', 'get_user_violations', 'get_reporter_history', 'get_cross_reports', 'get_posts_by_user_in_room', 'get_posts_targeting_victim'])

const TOOL_LABELS = {
  analyze_image: 'Analyzing image content',
  call_perspective: 'Scoring toxicity',
  get_post: 'Fetching post content',
  get_comments: 'Reading community reaction',
  get_user_history: 'Checking post history',
  get_user_violations: 'Checking violation history',
  get_reporter_history: 'Checking reporter credibility',
  get_cross_reports: 'Checking cross-reports',
  get_posts_by_user_in_room: 'Scanning user posts in room',
  get_posts_targeting_victim: 'Scanning for coordinated targeting',
  remove_additional_post: 'Removing additional post',
  dismiss_report: 'Dismissing report',
  warn_user: 'Issuing warning',
  remove_post: 'Removing post',
  ban_user: 'Banning user',
}

const summarizeResult = (toolName, result) => {
  if (result?.error) return toolName === 'analyze_image' ? 'Format error — skipped' : `Error: ${result.error}`
  switch (toolName) {
    case 'analyze_image': {
      const flags = []
      if (result.explicit && result.explicit !== 'none') flags.push(`explicit:${result.explicit}`)
      if (result.violence && result.violence !== 'none') flags.push(`violence:${result.violence}`)
      if (result.hate_symbols) flags.push('hate symbols')
      if (result.dangerous_content) flags.push('dangerous content')
      return flags.length > 0 ? `Flagged — ${flags.join(', ')}` : `Safe — ${result.summary}`
    }
    case 'call_perspective': return `Score: ${result.score.toFixed(3)}`
    case 'get_post': return 'Post fetched'
    case 'get_comments': return `${result.length} comment${result.length !== 1 ? 's' : ''}`
    case 'get_user_history': return `${result.length} post${result.length !== 1 ? 's' : ''} found`
    case 'get_user_violations': return `${result.total} violation${result.total !== 1 ? 's' : ''}: ${result.totalWarnings}W / ${result.totalRemovals}R / ${result.totalBans}B`
    case 'get_reporter_history': return `${result.totalReports} report${result.totalReports !== 1 ? 's' : ''} filed`
    case 'get_cross_reports': return `${result.total} report${result.total !== 1 ? 's' : ''} from ${result.uniqueReporterCount} unique reporter${result.uniqueReporterCount !== 1 ? 's' : ''}`
    case 'get_posts_by_user_in_room': return `${result.length} post${result.length !== 1 ? 's' : ''} found`
    case 'get_posts_targeting_victim': return `${result.total} post${result.total !== 1 ? 's' : ''} found, ${result.uniquePerpetratorCount} perpetrator${result.uniquePerpetratorCount !== 1 ? 's' : ''}, coordination: ${result.coordinationSignal}`
    case 'remove_additional_post': return result?.success ? 'Removed' : 'Failed'
    default: return result?.success ? 'Done' : 'Unknown'
  }
}

const runModerationAgent = async ({ reportId, postId, room, reportedBy, creatorUid, postText, postImage, skillName, emit = () => {} }) => {
  const systemPrompt = buildSystemPrompt(skillName)

  const initialContent = `New moderation report.

Report ID: ${reportId}
Post ID: ${postId}
Room: ${room}
Post author (UID): ${creatorUid}
Reported by (UID): ${reportedBy}
Post text: "${postText || '(no text — image only post)'}"${postImage ? `\nPost image: ${postImage}` : ''}

Gather the context you need and make a decision.${postImage ? ' The post contains an image — analyze it with analyze_image.' : ''}`

  const messages = [{ role: 'user', content: initialContent }]

  let decision = null
  let pendingDecision = null
  let awaitingVerification = false
  const additionalRemovals = []
  const toolsCalled = new Set()
  let iterations = 0
  const MAX_ITERATIONS = 10

  while (!decision && iterations < MAX_ITERATIONS) {
    iterations++
    emit({ type: 'iteration', number: iterations })

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: systemPrompt,
      tools: TOOL_DEFINITIONS,
      messages
    })

    messages.push({ role: 'assistant', content: response.content })

    for (const block of response.content) {
      if (block.type === 'text' && block.text.trim()) {
        console.log(`[agent] Reasoning: ${block.text.trim()}`)
        emit({ type: 'reasoning', text: block.text.trim(), reactive: toolsCalled.size > 0 })
      }
    }

    if (response.stop_reason === 'end_turn') {
      if (pendingDecision) {
        console.log('[agent] Verification confirmed — decision stands')
        emit({ type: 'verification_confirmed' })
        decision = pendingDecision
      } else {
        console.warn('[agent] Ended without calling a decision tool')
        decision = { action: null, reasoning: 'Agent ended without reaching a decision.' }
      }
      break
    }

    if (response.stop_reason === 'max_tokens') {
      messages.pop()
      console.warn('[agent] Hit max_tokens, stopping')
      decision = { action: null, reasoning: 'Agent hit token limit without reaching a decision.' }
      break
    }

    if (response.stop_reason === 'tool_use') {
      const toolResults = []
      let newDecision = null

      for (const block of response.content) {
        if (block.type !== 'tool_use') continue

        console.log(`[agent] Calling tool: ${block.name}`, block.input)
        toolsCalled.add(block.name)

        let label = TOOL_LABELS[block.name] || block.name
        if (block.input.uid && (block.name === 'ban_user' || block.name === 'warn_user' || block.name === 'remove_additional_post')) {
          try {
            const profileDoc = await db.collection('profiles').doc(block.input.uid).get()
            const displayName = profileDoc.exists ? profileDoc.data().displayName : block.input.uid
            if (block.name === 'ban_user') label = `Banning ${displayName}`
            else if (block.name === 'warn_user') label = `Warning ${displayName}`
            else label = `Removing additional post by ${displayName}`
          } catch {}
        }
        emit({ type: 'tool_call', tool: block.name, label })

        const result = await executeTool(block.name, block.input)

        toolResults.push({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(result)
        })

        if (block.name === 'call_perspective' && result.score !== undefined) {
          emit({ type: 'perspective', score: result.score })
        } else {
          emit({ type: 'tool_result', tool: block.name, summary: summarizeResult(block.name, result) })
        }

        if (ACCUMULATING_TOOLS.has(block.name) && result?.success) {
          additionalRemovals.push({ room: block.input.room, post_id: block.input.post_id, uid: block.input.uid })
        }

        if (DECISION_TOOLS.has(block.name) && !newDecision) {
          newDecision = { action: block.name, reasoning: block.input.reasoning }
        }
      }

      if (newDecision) {
        if (awaitingVerification) {
          console.log(`[agent] Decision revised during verification: ${pendingDecision.action} → ${newDecision.action}`)
          emit({ type: 'verification_revised', from: pendingDecision.action, to: newDecision.action })
          decision = newDecision
          messages.push({ role: 'user', content: toolResults })
        } else {
          pendingDecision = newDecision
          awaitingVerification = true
          emit({ type: 'verification' })
          const additionalSummary = additionalRemovals.length > 0
            ? ` You also removed ${additionalRemovals.length} additional post${additionalRemovals.length !== 1 ? 's' : ''} during your investigation.`
            : ''
          messages.push({
            role: 'user',
            content: [
              ...toolResults,
              {
                type: 'text',
                text: `You've reached a decision: ${pendingDecision.action}.${additionalSummary} Before this is finalized, reflect: are you confident? What was the key signal that drove it? If anything still feels uncertain or you think you need more context, gather it and revise. Otherwise, briefly confirm.`
              }
            ]
          })
        }
      } else {
        messages.push({ role: 'user', content: toolResults })
      }
    }
  }

  if (!decision) {
    decision = pendingDecision || {
      action: null,
      reasoning: `Agent reached max iterations (${MAX_ITERATIONS}) without a decision.`
    }
    if (!pendingDecision) console.warn(`[agent] Reached max iterations (${MAX_ITERATIONS}) without a decision`)
  }

  if (decision.action) {
    emit({ type: 'decision', action: decision.action, reasoning: decision.reasoning, additionalRemovals })
  }

  const skippedTools = [...CONTEXT_TOOLS].filter(t => !toolsCalled.has(t))
  if (skippedTools.length) {
    console.log(`[agent] Skipped tools: ${skippedTools.join(', ')}`)
    emit({ type: 'skipped_tools', tools: skippedTools })
  }

  return decision
}

module.exports = { runModerationAgent }
