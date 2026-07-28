const { db, admin } = require('./firebase')
const { analyzeToxicity } = require('./perspective')
const { analyzeImage } = require('./vision')

const ROOMS = ['watching', 'reading', 'listening']

const TOOL_DEFINITIONS = [
  {
    name: 'analyze_image',
    description: 'Analyze an image in the reported post for visual content violations using Claude Vision. Call this when get_post reveals the post has an image (content.image field is present). Returns severity levels for explicit content, violence, hate symbols, and dangerous content. Visual violations can be severe even when post text is benign — always check the image if one exists.',
    input_schema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'The URL of the image to analyze (content.image from get_post)' },
        context: { type: 'string', description: 'Optional post text to help interpret the image in context' }
      },
      required: ['image_url']
    }
  },
  {
    name: 'call_perspective',
    description: 'Score the post text for toxicity using the Perspective API. Returns a score from 0 (not toxic) to 1 (very toxic). Call this early — the score is a useful calibration signal. Not all violation types correlate with toxicity (e.g. misinformation often scores low), but it is worth checking.',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to score for toxicity' }
      },
      required: ['text']
    }
  },
  {
    name: 'get_post',
    description: 'Fetch the content of the reported post',
    input_schema: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'Collection: watching, reading, or listening' },
        post_id: { type: 'string', description: 'Post ID' }
      },
      required: ['room', 'post_id']
    }
  },
  {
    name: 'get_comments',
    description: 'Fetch comments on the post — community reaction is an important signal',
    input_schema: {
      type: 'object',
      properties: {
        room: { type: 'string' },
        post_id: { type: 'string' }
      },
      required: ['room', 'post_id']
    }
  },
  {
    name: 'get_user_history',
    description: 'Fetch recent posts by the reported user to check for behavior patterns',
    input_schema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'UID of the reported user' }
      },
      required: ['uid']
    }
  },
  {
    name: 'get_user_violations',
    description: 'Fetch the moderation violation history for the reported user — warnings, removals, and bans. Use this to assess escalation.',
    input_schema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'UID of the reported user' }
      },
      required: ['uid']
    }
  },
  {
    name: 'get_reporter_history',
    description: 'Check how many times this user has filed reports — assess their credibility',
    input_schema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'UID of the user who filed the report' }
      },
      required: ['uid']
    }
  },
  {
    name: 'dismiss_report',
    description: 'Dismiss the report — false report, context justifies the content, or the community defends the user',
    input_schema: {
      type: 'object',
      properties: {
        report_id: { type: 'string' },
        reasoning: { type: 'string', description: 'Reasoning for the decision' }
      },
      required: ['report_id', 'reasoning']
    }
  },
  {
    name: 'warn_user',
    description: 'Warn the user — first offense or borderline content',
    input_schema: {
      type: 'object',
      properties: {
        report_id: { type: 'string' },
        uid: { type: 'string', description: 'UID of the user being warned' },
        reasoning: { type: 'string', description: 'Reasoning for the decision' }
      },
      required: ['report_id', 'uid', 'reasoning']
    }
  },
  {
    name: 'remove_post',
    description: 'Remove the post — clear violation or established pattern',
    input_schema: {
      type: 'object',
      properties: {
        report_id: { type: 'string' },
        room: { type: 'string' },
        post_id: { type: 'string' },
        uid: { type: 'string', description: 'UID of the post author' },
        reasoning: { type: 'string', description: 'Reasoning for the decision' }
      },
      required: ['report_id', 'room', 'post_id', 'uid', 'reasoning']
    }
  },
  {
    name: 'ban_user',
    description: 'Ban the user and remove the offending post — reserved for severe or repeated violations after escalation through warn and remove',
    input_schema: {
      type: 'object',
      properties: {
        report_id: { type: 'string' },
        uid: { type: 'string', description: 'UID of the user being banned' },
        room: { type: 'string', description: 'Collection the post lives in (watching, reading, listening)' },
        post_id: { type: 'string', description: 'ID of the post to remove' },
        reasoning: { type: 'string', description: 'Reasoning for the decision, referencing the violation history' }
      },
      required: ['report_id', 'uid', 'room', 'post_id', 'reasoning']
    }
  },
  {
    name: 'get_cross_reports',
    description: 'Query all reports filed against a specific user. Returns total count, number of unique reporters, and a summary of each report. Call this when the initial evidence suggests a pattern — it reveals whether multiple different people have complained about this user, which distinguishes a repeat offender from a one-off incident.',
    input_schema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'UID of the reported user' }
      },
      required: ['uid']
    }
  },
  {
    name: 'get_posts_by_user_in_room',
    description: 'Fetch all current live posts by a user in a specific room. Use this after get_user_history suggests a pattern — it gives the full list of posts in one room so you can identify which ones share the same violation and should be removed alongside the reported post.',
    input_schema: {
      type: 'object',
      properties: {
        uid: { type: 'string', description: 'UID of the user' },
        room: { type: 'string', description: 'Collection: watching, reading, or listening' }
      },
      required: ['uid', 'room']
    }
  },
  {
    name: 'remove_additional_post',
    description: 'Remove a post discovered during investigation that shares the same violation pattern as the reported post. Call this for each additional post that warrants removal — the loop continues after each call so you can keep investigating. Use this before finalizing your decision with remove_post or ban_user.',
    input_schema: {
      type: 'object',
      properties: {
        room: { type: 'string', description: 'Collection the post lives in' },
        post_id: { type: 'string', description: 'ID of the post to remove' },
        uid: { type: 'string', description: 'UID of the post author' },
        reasoning: { type: 'string', description: 'Why this post warrants removal' }
      },
      required: ['room', 'post_id', 'uid', 'reasoning']
    }
  },
  {
    name: 'get_posts_targeting_victim',
    description: 'Find all posts across all rooms that mention a specific user (victim_uid). Uses the mentionedUids field stored on each post. Returns posts sorted by recency, with timing analysis and a coordination signal. Call this when a harassment report suggests the victim may be targeted by multiple users — it reveals whether a pile-on is forming across the platform, not just in one thread.',
    input_schema: {
      type: 'object',
      properties: {
        victim_uid: { type: 'string', description: 'UID of the user who may be the target of coordinated harassment' }
      },
      required: ['victim_uid']
    }
  }
]

const recordViolation = async (uid, violation) => {
  await db.collection('profiles').doc(uid).collection('violations').add({
    ...violation,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  })
}

const executeTool = async (name, input) => {
  switch (name) {
    case 'analyze_image': {
      const result = await analyzeImage(input.image_url, input.context)
      return result
    }

    case 'call_perspective': {
      const score = await analyzeToxicity(input.text)
      return { score }
    }

    case 'get_post': {
      const snap = await db.collection(input.room).doc(input.post_id).get()
      if (!snap.exists) return { error: 'Post not found' }
      return { id: snap.id, ...snap.data() }
    }

    case 'get_comments': {
      const snap = await db
        .collection(input.room)
        .doc(input.post_id)
        .collection('comments')
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get()
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }

    case 'get_user_history': {
      const posts = []
      for (const room of ROOMS) {
        const snap = await db
          .collection(room)
          .where('creatorUid', '==', input.uid)
          .orderBy('timestamp', 'desc')
          .limit(10)
          .get()
        snap.docs.forEach(d => posts.push({ room, id: d.id, ...d.data() }))
      }
      return posts
    }

    case 'get_user_violations': {
      const snap = await db
        .collection('profiles')
        .doc(input.uid)
        .collection('violations')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get()
      const violations = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      return {
        violations,
        totalWarnings: violations.filter(v => v.type === 'warn').length,
        totalRemovals: violations.filter(v => v.type === 'remove').length,
        totalBans: violations.filter(v => v.type === 'ban').length,
        total: violations.length
      }
    }

    case 'get_reporter_history': {
      const snap = await db.collection('reports').where('reportedBy', '==', input.uid).get()
      return { totalReports: snap.size }
    }

    case 'dismiss_report': {
      await db.collection('reports').doc(input.report_id).update({
        status: 'dismissed',
        reasoning: input.reasoning,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp()
      })
      return { success: true }
    }

    case 'warn_user': {
      await db.collection('reports').doc(input.report_id).update({
        status: 'warned',
        reasoning: input.reasoning,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp()
      })
      await db.collection('profiles').doc(input.uid).set({ warned: true }, { merge: true })
      await recordViolation(input.uid, {
        type: 'warn',
        reportId: input.report_id,
        reasoning: input.reasoning
      })
      return { success: true }
    }

    case 'remove_post': {
      await db.collection(input.room).doc(input.post_id).delete()
      await db.collection('reports').doc(input.report_id).update({
        status: 'removed',
        reasoning: input.reasoning,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp()
      })
      await db.collection('profiles').doc(input.uid).set({ removedPending: true }, { merge: true })
      await recordViolation(input.uid, {
        type: 'remove',
        reportId: input.report_id,
        postId: input.post_id,
        room: input.room,
        reasoning: input.reasoning
      })
      return { success: true }
    }

    case 'ban_user': {
      await db.collection(input.room).doc(input.post_id).delete()
      await db.collection('profiles').doc(input.uid).set({ banned: true }, { merge: true })
      await db.collection('reports').doc(input.report_id).update({
        status: 'banned',
        reasoning: input.reasoning,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp()
      })
      await recordViolation(input.uid, {
        type: 'ban',
        reportId: input.report_id,
        postId: input.post_id,
        room: input.room,
        reasoning: input.reasoning
      })
      return { success: true }
    }

    case 'get_cross_reports': {
      const snap = await db.collection('reports').where('creatorUid', '==', input.uid).get()
      const reports = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      const uniqueReporters = [...new Set(reports.map(r => r.reportedBy).filter(Boolean))]
      return {
        total: reports.length,
        uniqueReporterCount: uniqueReporters.length,
        reports: reports.map(r => ({
          id: r.id,
          room: r.room,
          status: r.status,
          createdAt: r.createdAt
        }))
      }
    }

    case 'get_posts_by_user_in_room': {
      const snap = await db
        .collection(input.room)
        .where('creatorUid', '==', input.uid)
        .orderBy('timestamp', 'desc')
        .limit(20)
        .get()
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    }

    case 'remove_additional_post': {
      await db.collection(input.room).doc(input.post_id).delete()
      await recordViolation(input.uid, {
        type: 'remove',
        postId: input.post_id,
        room: input.room,
        reasoning: input.reasoning,
        source: 'additional'
      })
      return { success: true }
    }

    case 'get_posts_targeting_victim': {
      const posts = []
      for (const room of ROOMS) {
        const snap = await db
          .collection(room)
          .where('mentionedUids', 'array-contains', input.victim_uid)
          .limit(20)
          .get()
        snap.docs.forEach(d => posts.push({ room, id: d.id, ...d.data() }))
      }

      posts.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0))

      const nowSeconds = Date.now() / 1000
      const postsInLast1h = posts.filter(p => nowSeconds - (p.timestamp?.seconds || 0) < 3600)
      const postsInLast24h = posts.filter(p => nowSeconds - (p.timestamp?.seconds || 0) < 86400)
      const uniquePerpetratorUids = [...new Set(posts.map(p => p.creatorUid))]

      const coordinationSignal =
        postsInLast1h.length >= 3 ? 'high' :
        postsInLast24h.length >= 5 || uniquePerpetratorUids.length >= 3 ? 'medium' : 'low'

      return {
        posts,
        total: posts.length,
        uniquePerpetratorCount: uniquePerpetratorUids.length,
        uniquePerpetratorUids,
        postsInLast1h: postsInLast1h.length,
        postsInLast24h: postsInLast24h.length,
        coordinationSignal
      }
    }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

module.exports = { TOOL_DEFINITIONS, executeTool }
