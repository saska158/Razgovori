// Run: node test-escalation.js
require('dotenv').config()

const ZORA_UID = 'aKCQtIVmEkUjjBxPngfMvJxWHpX2'
const REPORTER_UID = 'BDA8rbimxDYokHqhyhEaRMNHhc63'
const SERVER = 'http://localhost:4000'

const POSTS = [
  {
    label: 'Harassment — vague accusation framed as question, victim or aggressor unknown',
    postText: 'Has anyone else had a weird or uncomfortable experience with @mario in this community? I do not want to go into detail publicly but something happened that made me uneasy and I am trying to figure out if it is just me.',
  },
]

const { db } = require('./firebase')

const wipeZora = async () => {
  const ref = db.collection('profiles').doc(ZORA_UID)
  const [violSnap, reportSnap] = await Promise.all([
    ref.collection('violations').get(),
    db.collection('reports').where('creatorUid', '==', ZORA_UID).get()
  ])
  const batch = db.batch()
  violSnap.docs.forEach(d => batch.delete(d.ref))
  reportSnap.docs.forEach(d => batch.delete(d.ref))
  await batch.commit()
  await ref.update({ warned: false, removedPending: false, banned: false })
}

const http = require('http')

const streamReport = (reportId) => new Promise((resolve) => {
  const req = http.get(`${SERVER}/report/${reportId}/stream`, res => {
    res.setEncoding('utf8')
    let buf = ''
    res.on('data', chunk => {
      buf += chunk
      const lines = buf.split('\n')
      buf = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const event = JSON.parse(line.slice(6))
          if (event.type === 'decision') {
            console.log(`  → DECISION: ${event.action}`)
            console.log(`  → REASONING: ${event.reasoning?.slice(0, 200)}...`)
          } else if (event.type === 'routing') {
            console.log(`  → SKILL: ${event.skill}`)
          } else if (event.type === 'done') {
            resolve()
          }
        } catch {}
      }
    })
    res.on('end', resolve)
  })
  req.on('error', resolve)
  setTimeout(resolve, 60000)
})

const sendReport = async (postText) => {
  const body = JSON.stringify({
    postId: `test-post-${Date.now()}`,
    room: 'reading',
    reportedBy: REPORTER_UID,
    creatorUid: ZORA_UID,
    postText,
    postImage: '',
  })

  return new Promise((resolve, reject) => {
    const req = http.request(`${SERVER}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, res => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => resolve(JSON.parse(data)))
    })
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

;(async () => {
  for (const { label, postText } of POSTS) {
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`TEST: ${label}`)
    console.log(`POST: "${postText.slice(0, 80)}..."`)
    try {
      await wipeZora()
      const { reportId } = await sendReport(postText)
      console.log(`  reportId: ${reportId}`)
      await streamReport(reportId)
    } catch (e) {
      console.log(`  ERROR: ${e.message}`)
    }
    await new Promise(r => setTimeout(r, 2000))
  }
  console.log('\nDone.')
  process.exit(0)
})()
