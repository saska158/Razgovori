// End-to-end demo for the My social media Waste of time Moderation Agent
// Usage: node demo.js [optional post text in quotes]
// Requires: server/.env with ANTHROPIC_API_KEY, PERSPECTIVE_API_KEY, FIREBASE_SERVICE_ACCOUNT
// The server must already be running: node index.js
require('dotenv').config()

const http = require('http')

const SERVER = 'http://localhost:4000'
const DIVIDER = '─'.repeat(62)

const POST_TEXT = process.argv[2] ||
  'You people are all the same. Stop spreading your garbage opinions here. Nobody wants you in this community.'

const post = (url, body) => new Promise((resolve, reject) => {
  const data = JSON.stringify(body)
  const req = http.request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
  }, res => {
    let out = ''
    res.on('data', c => out += c)
    res.on('end', () => {
      try { resolve(JSON.parse(out)) }
      catch { reject(new Error(`Bad JSON: ${out}`)) }
    })
  })
  req.on('error', reject)
  req.write(data)
  req.end()
})

const streamReport = (reportId) => new Promise((resolve) => {
  http.get(`${SERVER}/report/${reportId}/stream`, res => {
    res.setEncoding('utf8')
    let buf = ''

    res.on('data', chunk => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop()

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        let event
        try { event = JSON.parse(line.slice(6)) } catch { continue }

        switch (event.type) {
          case 'router_reasoning':
            console.log(`[router] ${event.text.slice(0, 140)}`)
            break
          case 'routing':
            console.log(`\n${DIVIDER}`)
            console.log(`  Skill selected: ${event.skill}`)
            console.log(`  Reason: ${event.reasoning}`)
            console.log(`${DIVIDER}\n`)
            break
          case 'perspective':
            console.log(`  [perspective] Toxicity score: ${event.score.toFixed(3)}`)
            break
          case 'tool_call':
            console.log(`\n  tool start "${event.label}"`)
            break
          case 'tool_result':
            console.log(`  tool result "${event.tool}": ${event.summary}`)
            break
          case 'reasoning':
            console.log(`\n[agent] ${event.text.slice(0, 350)}`)
            break
          case 'verification':
            console.log('\n[verification] Decision reached — agent self-checking before finalizing...')
            break
          case 'verification_confirmed':
            console.log('[verification] Confirmed. Decision stands.')
            break
          case 'verification_revised':
            console.log(`[verification] Revised: ${event.from} → ${event.to}`)
            break
          case 'decision': {
            const extras = event.additionalRemovals?.length
              ? `\n  Additional posts removed: ${event.additionalRemovals.length}`
              : ''
            console.log(`\n${DIVIDER}`)
            console.log(`  DECISION:   ${event.action.toUpperCase()}`)
            console.log(`  REASONING:  ${event.reasoning.slice(0, 400)}`)
            if (extras) console.log(extras)
            console.log(DIVIDER)
            break
          }
          case 'done':
            resolve()
            break
          case 'error':
            console.error(`\nERROR: ${event.message}`)
            resolve()
            break
        }
      }
    })

    res.on('end', resolve)
  }).on('error', e => { console.error('Stream error:', e.message); resolve() })

  setTimeout(resolve, 90_000)
})

;(async () => {
  try {
    await new Promise((resolve, reject) => {
      http.get(`${SERVER}/health`, r => {
        r.resume()
        r.statusCode === 200 ? resolve() : reject()
      }).on('error', reject)
    })
  } catch {
    console.error('\nERROR: Server is not running. Start it first:\n\n  node index.js\n')
    process.exit(1)
  }

  console.log(`\n${DIVIDER}`)
  console.log('  My social media Waste of time — Moderation Agent demo')
  console.log(DIVIDER)
  console.log(`  Post text: "${POST_TEXT.slice(0, 72)}${POST_TEXT.length > 72 ? '...' : ''}"`)
  console.log(`${DIVIDER}\n`)

  let reportId
  try {
    const result = await post(`${SERVER}/report`, {
      postId: `demo-post-${Date.now()}`,
      room: 'reading',
      reportedBy: 'demo-reporter-uid',
      creatorUid: 'demo-author-uid',
      postText: POST_TEXT,
      postImage: ''
    })
    reportId = result.reportId
  } catch (e) {
    console.error('Failed to create report:', e.message)
    process.exit(1)
  }

  console.log(`Report created: ${reportId}`)
  console.log('Streaming moderation trace...\n')

  await streamReport(reportId)

  console.log(`\nReport ${reportId} written to Firestore — collection: reports\n`)
  process.exit(0)
})()
