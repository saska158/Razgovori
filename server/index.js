require('dotenv').config()

const express = require('express')
const cors = require('cors')
const { runRouter } = require('./router')
const { runModerationAgent } = require('./agent')
const { executeTool } = require('./tools')
const { db, admin } = require('./firebase')

const app = express()
app.use(cors({ origin: 'http://localhost:3000' }))
app.use(express.json())

class ReportStream {
  constructor() {
    this.buffer = []
    this.listeners = new Set()
    this.closed = false
  }

  emit(event) {
    this.buffer.push(event)
    this.listeners.forEach(fn => fn(event))
    if (event.type === 'done' || event.type === 'error') this.closed = true
  }

  subscribe(fn) {
    this.buffer.forEach(fn)
    if (!this.closed) this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
}

const reportStreams = new Map()

const processReport = async (reportId, reportRef, { postId, room, reportedBy, creatorUid, postText, postImage }) => {
  const stream = reportStreams.get(reportId)
  const emit = event => stream?.emit(event)

  try {
    const skillName = await runRouter({ postText, postImage, room, emit })
    await reportRef.update({ skillName })

    const decision = await runModerationAgent({
      reportId, postId, room, reportedBy, creatorUid, postText, postImage, skillName, emit
    })

    console.log(`[report] Decision for ${reportId}:`, decision)
    emit({ type: 'done', decision })

  } catch (error) {
    console.error('[report] Error processing report:', error)
    emit({ type: 'error', message: error.message })
    emit({ type: 'done', decision: null })
    await reportRef.update({ status: 'error' }).catch(() => {})
  } finally {
    setTimeout(() => reportStreams.delete(reportId), 60_000)
  }
}

app.post('/report', async (req, res) => {
  const { postId, room, reportedBy, creatorUid, postText = '', postImage = '' } = req.body

  if (!postId || !room || !reportedBy || !creatorUid || (!postText && !postImage)) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const reportRef = await db.collection('reports').add({
      postId, room, reportedBy, creatorUid,
      postText: postText || '',
      postImage: postImage || '',
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    })
    const reportId = reportRef.id
    console.log(`[report] New report: ${reportId} for post ${postId}`)

    const stream = new ReportStream()
    reportStreams.set(reportId, stream)

    processReport(reportId, reportRef, { postId, room, reportedBy, creatorUid, postText, postImage })

    res.json({ reportId })
  } catch (error) {
    console.error('[report] Error creating report:', error)
    res.status(500).json({ error: 'Failed to create report' })
  }
})

app.get('/report/:reportId/stream', (req, res) => {
  const stream = reportStreams.get(req.params.reportId)
  if (!stream) return res.status(404).json({ error: 'Report stream not found' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  const unsubscribe = stream.subscribe(event => {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`)
      if (event.type === 'done') {
        unsubscribe()
        res.end()
      }
    } catch {
      unsubscribe()
    }
  })

  req.on('close', unsubscribe)
})

app.post('/admin/resolve', async (req, res) => {
  const { reportId, action, reasoning } = req.body
  if (!reportId || !action || !reasoning) {
    return res.status(400).json({ error: 'Missing required fields' })
  }

  try {
    const reportDoc = await db.collection('reports').doc(reportId).get()
    if (!reportDoc.exists) return res.status(404).json({ error: 'Report not found' })

    const report = reportDoc.data()
    const input = { report_id: reportId, uid: report.creatorUid, room: report.room, post_id: report.postId, reasoning }

    await executeTool(action, input)
    console.log(`[admin] Resolved report ${reportId} with action: ${action}`)
    res.json({ success: true })
  } catch (error) {
    console.error('[admin] Error resolving report:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/health', (_, res) => res.json({ status: 'ok' }))

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
