import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/authContext'
import { firestore, collection, query, where, onSnapshot } from '../api/firebase'

const ADMIN_UID = process.env.REACT_APP_ADMIN_UID
const SERVER_URL = 'http://localhost:4000'

const ACTIONS = [
  { key: 'dismiss_report', label: 'Dismiss' },
  { key: 'warn_user', label: 'Warn' },
  { key: 'remove_post', label: 'Remove post' },
  { key: 'ban_user', label: 'Ban user' },
]

const EscalationCard = ({ report, onResolved }) => {
  const [reasoning, setReasoning] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const resolve = async (action) => {
    if (!reasoning.trim()) {
      setError('Add your reasoning before resolving.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${SERVER_URL}/admin/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId: report.id, action, reasoning })
      })
      if (!res.ok) throw new Error((await res.json()).error)
      onResolved(report.id)
    } catch (e) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="escalation-card">
      <div className="escalation-card-meta">
        <span className="escalation-badge">Needs review</span>
        <span className="escalation-room">{report.room}</span>
      </div>

      {report.postText && (
        <p className="escalation-post-text">"{report.postText}"</p>
      )}
      {report.postImage && (
        <img src={report.postImage} alt="reported" className="escalation-post-image" />
      )}

      <div className="escalation-agent-reasoning">
        <p className="escalation-label">Agent's uncertainty</p>
        <p>{report.agentReasoning}</p>
      </div>

      <textarea
        className="escalation-reasoning-input"
        placeholder="Your reasoning for the decision..."
        value={reasoning}
        onChange={e => setReasoning(e.target.value)}
        rows={3}
        disabled={loading}
      />

      {error && <p className="escalation-error">{error}</p>}

      <div className="escalation-actions">
        {ACTIONS.map(({ key, label }) => (
          <button
            key={key}
            className={`escalation-action-btn escalation-action-${key}`}
            onClick={() => resolve(key)}
            disabled={loading}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

const AdminPage = () => {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [escalations, setEscalations] = useState([])
  const [resolved, setResolved] = useState(new Set())
  const [loading, setLoading] = useState(true)

  const isAdmin = user?.uid === ADMIN_UID

  useEffect(() => {
    if (!user) navigate('/')
  }, [user])

  useEffect(() => {
    if (!isAdmin) return

    const q = query(
      collection(firestore, 'reports'),
      where('status', '==', 'escalated')
    )

    const unsub = onSnapshot(q, snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      docs.sort((a, b) => (b.escalatedAt?.seconds || 0) - (a.escalatedAt?.seconds || 0))
      setEscalations(docs)
      setLoading(false)
    }, () => setLoading(false))

    return unsub
  }, [isAdmin])

  const handleResolved = (id) => {
    setResolved(prev => new Set([...prev, id]))
  }

  if (!user) return null

  if (!isAdmin) {
    return (
      <div className="admin-page">
        <p style={{ color: '#888', textAlign: 'center', marginTop: '4rem' }}>Access denied.</p>
      </div>
    )
  }

  const pending = escalations.filter(e => !resolved.has(e.id))

  return (
    <div className="admin-page">
      <h1 className="admin-page-title">Admin — Escalations</h1>

      {loading ? (
        <p className="admin-empty">Loading...</p>
      ) : pending.length === 0 ? (
        <p className="admin-empty">No pending escalations.</p>
      ) : (
        <div className="escalation-list">
          {pending.map(report => (
            <EscalationCard key={report.id} report={report} onResolved={handleResolved} />
          ))}
        </div>
      )}
    </div>
  )
}

export default AdminPage
