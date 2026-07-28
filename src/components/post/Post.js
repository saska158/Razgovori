import { useState, memo, useMemo, useRef, useEffect } from "react"
import { motion } from "framer-motion"
import { firestore, collection, doc } from "../../api/firebase"
import { useAuth } from "../../contexts/authContext"
import { useModerationTrace } from "../../contexts/moderationContext"
import FirestoreItemHeader from "./FirestoreItemHeader"
import FirestoreItemContent from "./FirestoreItemContent"
import FirestoreItemActions from "./FirestoreItemActions"
import PopUp from "../PopUp"
import JoinPopUp from "../JoinPopUp"
import Comments from "./Comments"

const SERVER_URL = 'http://localhost:4000'

const RESULT_MESSAGES = {
  auto_dismissed: 'Content looks clean — report dismissed.',
  dismiss_report: 'Thanks for the report — no further action needed.',
  warn_user: 'User has been warned.',
  remove_post: 'Post removed.',
  ban_user: 'User has been banned.',
}

const Post = ({post, room, style = {}}) => {
  const { id: postId, creatorUid, content, timestamp } = post
  const { user } = useAuth()
  const { openTrace, startStream, closeTrace } = useModerationTrace()

  const [showComments, setShowComments] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [showJoinPopup, setShowJoinPopup] = useState(false)
  const [reportState, setReportState] = useState('idle')
  const [reportResult, setReportResult] = useState(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!showMenu) return
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showMenu])

  const postRef = useMemo(() => doc(firestore, room, postId), [room, postId])
  const commentsRef = useMemo(() => collection(firestore, room, postId, 'comments'), [room, postId])

  const handleReportClick = (e) => {
    e.stopPropagation()
    if (!user) {
      setShowMenu(false)
      setShowJoinPopup(true)
      return
    }
    setShowMenu(false)
    setReportState('confirming')
  }

  const submitReport = async () => {
    setReportState('loading')
    openTrace()

    try {
      const res = await fetch(`${SERVER_URL}/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, room, reportedBy: user.uid, creatorUid, postText: content.text || '', postImage: content.image || '' })
      })
      const data = await res.json()
      if (!data.reportId) throw new Error('No reportId returned')

      startStream(data.reportId, (decision) => {
        setReportState('done')
        setReportResult(decision)
      })

    } catch {
      setReportState('done')
      closeTrace()
    }
  }

  const isOwnPost = user?.uid === creatorUid
  const showThreeDots = !isOwnPost
  const resultMessage = reportResult
    ? (RESULT_MESSAGES[reportResult.action] ?? 'Report submitted.')
    : 'Report submitted.'

  return (
    <motion.div
      className="post-container"
      style={style}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
        <FirestoreItemHeader {...{creatorUid, timestamp}} />

        {showThreeDots && (
          <div ref={menuRef} style={{position: 'relative', flexShrink: 0}}>

            {(reportState === 'loading' || reportState === 'done') && (
              <span style={{
                fontSize: '0.75rem',
                color: 'var(--dark-green)',
                fontStyle: 'italic',
                whiteSpace: 'nowrap',
                padding: '4px 6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}>
                {reportState === 'loading' ? (
                  <>
                    Reviewing
                    <span className="review-dots">
                      <span /><span /><span />
                    </span>
                  </>
                ) : resultMessage}
              </span>
            )}

            {(reportState === 'idle' || reportState === 'confirming') && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (reportState === 'confirming') {
                    setReportState('idle')
                  } else {
                    setShowMenu(prev => !prev)
                  }
                }}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '3px',
                  padding: '4px 6px',
                  color: 'var(--dark-green)',
                  opacity: 0.6,
                }}
              >
                <span style={{width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor', display: 'block'}} />
                <span style={{width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor', display: 'block'}} />
                <span style={{width: '4px', height: '4px', borderRadius: '50%', background: 'currentColor', display: 'block'}} />
              </button>
            )}

            {showMenu && reportState === 'idle' && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                minWidth: '120px',
                zIndex: 100,
                overflow: 'hidden',
              }}>
                <button
                  onClick={handleReportClick}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    textAlign: 'left',
                    color: '#e53e3e',
                    fontWeight: '500',
                    fontSize: '0.9rem',
                  }}
                >
                  Report
                </button>
              </div>
            )}

            {reportState === 'confirming' && (
              <div style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                background: '#fff',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
                zIndex: 100,
                padding: '12px 14px',
                minWidth: '160px',
              }}>
                <p style={{
                  fontSize: '0.8rem',
                  color: '#555',
                  marginBottom: '10px',
                  whiteSpace: 'nowrap',
                }}>
                  Report this post?
                </p>
                <div style={{display: 'flex', gap: '8px'}}>
                  <button
                    onClick={() => setReportState('idle')}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: '6px',
                      border: '1px solid #e0e0e0',
                      fontSize: '0.8rem',
                      color: '#555',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitReport}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      borderRadius: '6px',
                      background: '#e53e3e',
                      fontSize: '0.8rem',
                      color: '#fff',
                      fontWeight: '500',
                    }}
                  >
                    Confirm
                  </button>
                </div>
              </div>
            )}

          </div>
        )}
      </div>

      <FirestoreItemContent {...{content}} />
      <FirestoreItemActions
        firestoreDoc={postRef}
        firestoreCollection={commentsRef}
        {...{showComments, setShowComments}}
      />

      {showComments && (
        <PopUp setIsPopUpShown={setShowComments}>
          <Comments {...{room, postId}} firestoreRef={commentsRef} />
        </PopUp>
      )}
      {showJoinPopup && <JoinPopUp setIsPopUpShown={setShowJoinPopup} />}
    </motion.div>
  )
}

export default memo(Post)
