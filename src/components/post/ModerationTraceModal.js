import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'

const DECISION_COLOR = {
  dismiss_report: '#16a34a',
  auto_dismissed: '#16a34a',
  warn_user: '#d97706',
  remove_post: '#e53e3e',
  ban_user: '#991b1b',
}

const DECISION_LABEL = {
  dismiss_report: 'Dismissed',
  auto_dismissed: 'Auto-dismissed',
  warn_user: 'User warned',
  remove_post: 'Post removed',
  ban_user: 'User banned',
}

const TOOL_ICON = {
  call_perspective: '🔬',
  get_post: '📄',
  get_comments: '💬',
  get_user_history: '📋',
  get_user_violations: '⚠️',
  get_reporter_history: '🔍',
  dismiss_report: '✓',
  warn_user: '⚠',
  remove_post: '✕',
  ban_user: '⊘',
}

const WARNING_TOOLS = new Set(['get_user_violations', 'warn_user'])

const scoreColor = score =>
  score > 0.7 ? '#e53e3e' : score > 0.4 ? '#d97706' : '#16a34a'

const Label = ({ text, color = '#9ca3af' }) => (
  <span style={{
    fontSize: '0.62rem',
    fontWeight: 700,
    color,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
  }}>
    {text}
  </span>
)

const Spinner = () => (
  <motion.span
    style={{
      display: 'inline-block',
      width: '13px',
      height: '13px',
      border: '2px solid #d1e9df',
      borderTopColor: '#4b896f',
      borderRadius: '50%',
      flexShrink: 0,
    }}
    animate={{ rotate: 360 }}
    transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
  />
)

const PulsingDot = () => (
  <motion.span
    style={{
      display: 'inline-block',
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#4b896f',
      flexShrink: 0,
    }}
    animate={{ opacity: [1, 0.25, 1] }}
    transition={{ duration: 1.4, repeat: Infinity }}
  />
)

// Merge sequential tool_call + tool_result into a single tool_row.
// _key is the raw event index so AnimatePresence keys stay stable when
// a pending row transitions to done without remounting.
const processEvents = events => {
  const out = []
  let i = 0
  while (i < events.length) {
    const ev = events[i]
    if (ev.type === 'tool_call') {
      const next = events[i + 1]
      if (next?.type === 'tool_result') {
        out.push({ type: 'tool_row', tool: ev.tool, label: ev.label, result: next.summary, done: true, _key: i })
        i += 2
      } else {
        out.push({ type: 'tool_row', tool: ev.tool, label: ev.label, result: null, done: false, _key: i })
        i++
      }
    } else if (ev.type === 'tool_result') {
      // consumed by preceding tool_call; skip orphaned ones silently
      i++
    } else {
      out.push({ ...ev, _key: i })
      i++
    }
  }
  return out
}

const ToolRow = ({ tool, label, result, done }) => {
  const isWarning = WARNING_TOOLS.has(tool)
  const pillColor = isWarning ? '#92400e' : '#3d7a60'
  const pillBg   = isWarning ? '#fef3c7' : '#dcfce7'
  const longResult = result && result.length > 40

  return (
    <div style={{
      padding: '6px 10px',
      borderRadius: '6px',
      background: '#f9fafb',
      marginBottom: '4px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '0.8rem', flexShrink: 0 }}>{TOOL_ICON[tool] || '⚙'}</span>
        <span style={{ fontSize: '0.78rem', color: '#374151', flex: 1 }}>{label}</span>
        {done
          ? result && !longResult && (
            <span style={{
              fontSize: '0.68rem',
              fontWeight: 600,
              color: pillColor,
              background: pillBg,
              padding: '2px 9px',
              borderRadius: '999px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}>{result}</span>
          )
          : <Spinner />
        }
      </div>
      {done && longResult && (
        <p style={{
          margin: '4px 0 0',
          fontSize: '0.72rem',
          color: pillColor,
          lineHeight: 1.5,
          paddingLeft: '24px',
        }}>{result}</p>
      )}
    </div>
  )
}

const ReasoningCard = ({ text, reactive }) => (
  <div style={{
    background: '#f7faf9',
    border: '1px solid #d1e9df',
    borderLeft: '3px solid #4b896f',
    borderRadius: '6px',
    padding: '10px 12px',
    marginBottom: '6px',
  }}>
    {reactive && (
      <div style={{ marginBottom: '4px' }}>
        <Label text="Reactive" color="#4b896f" />
      </div>
    )}
    <p style={{ margin: 0, fontSize: '0.8rem', color: '#444', lineHeight: 1.6, fontStyle: 'italic' }}>{text}</p>
  </div>
)

const StepHeader = ({ number, isActive }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '14px 0 8px' }}>
    <Label text={`Step ${number}`} color="#4b896f" />
    {isActive && <PulsingDot />}
    <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
  </div>
)

const EventRow = ({ event, isActiveStep }) => {
  switch (event.type) {
    case 'tool_row':
      return <ToolRow tool={event.tool} label={event.label} result={event.result} done={event.done} />

    case 'iteration':
      return <StepHeader number={event.number} isActive={isActiveStep} />

    case 'reasoning':
      return <ReasoningCard text={event.text} reactive={event.reactive} />

    case 'perspective': {
      const color = scoreColor(event.score)
      const pillBg = color === '#e53e3e' ? '#fee2e2' : color === '#d97706' ? '#fef3c7' : '#dcfce7'
      return (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 10px',
          borderRadius: '6px',
          background: '#f9fafb',
          marginBottom: '4px',
        }}>
          <span style={{ fontSize: '0.8rem' }}>🔬</span>
          <span style={{ fontSize: '0.78rem', color: '#374151', flex: 1 }}>Toxicity score</span>
          <span style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            color,
            background: pillBg,
            padding: '2px 9px',
            borderRadius: '999px',
            fontFamily: 'monospace',
            flexShrink: 0,
          }}>
            {event.score.toFixed(3)}
          </span>
        </div>
      )
    }

    case 'router_reasoning':
      return (
        <div style={{ padding: '4px 0', marginBottom: '4px' }}>
          <Label text="Router" />
          <p style={{ margin: '3px 0 0', fontSize: '0.8rem', color: '#555', fontStyle: 'italic', lineHeight: 1.55 }}>
            {event.text}
          </p>
        </div>
      )

    case 'routing':
      return (
        <div style={{ padding: '4px 0', marginBottom: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: '#4b896f', fontWeight: 700, fontSize: '0.8rem' }}>→</span>
            <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#4b896f', fontFamily: 'monospace' }}>{event.skill}</span>
          </div>
          {event.reasoning && (
            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#777', fontStyle: 'italic', lineHeight: 1.5 }}>
              {event.reasoning}
            </p>
          )}
        </div>
      )

    case 'verification':
      return (
        <div style={{
          marginTop: '8px',
          marginBottom: '4px',
          padding: '8px 12px',
          borderRadius: '6px',
          background: '#faf5ff',
          border: '1px solid #e9d5ff',
        }}>
          <Label text="Verifying decision" color="#7c3aed" />
          <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#7c3aed', fontStyle: 'italic', lineHeight: 1.5 }}>
            Checking all signals before finalizing…
          </p>
        </div>
      )

    case 'verification_confirmed':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', marginBottom: '4px' }}>
          <span style={{ color: '#16a34a', fontWeight: 700 }}>✓</span>
          <span style={{ fontSize: '0.78rem', color: '#16a34a', fontWeight: 600 }}>Decision confirmed</span>
        </div>
      )

    case 'verification_revised':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', marginBottom: '4px' }}>
          <span style={{ color: '#d97706', fontWeight: 700 }}>↻</span>
          <span style={{ fontSize: '0.78rem', color: '#d97706' }}>
            Revised: <span style={{ fontFamily: 'monospace' }}>{event.from}</span>
            {' → '}
            <span style={{ fontFamily: 'monospace' }}>{event.to}</span>
          </span>
        </div>
      )

    case 'decision': {
      const color = DECISION_COLOR[event.action] || '#555'
      const bg = { '#16a34a': '#dcfce7', '#d97706': '#fef3c7', '#e53e3e': '#fee2e2', '#991b1b': '#fee2e2' }[color] || '#f3f4f6'
      return (
        <div style={{ marginTop: '12px', padding: '12px', borderRadius: '8px', background: bg, border: `1px solid ${color}33` }}>
          <Label text="Decision" color={color} />
          <div style={{ marginTop: '4px', fontSize: '0.92rem', fontWeight: 700, color }}>
            {DECISION_LABEL[event.action] || event.action}
          </div>
          <p style={{ margin: '6px 0 0', fontSize: '0.78rem', color: '#555', lineHeight: 1.55 }}>
            {event.reasoning}
          </p>
        </div>
      )
    }

    case 'skipped_tools':
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 0', marginBottom: '4px' }}>
          <Label text="Skipped" />
          <span style={{ fontSize: '0.72rem', color: '#9ca3af', fontFamily: 'monospace' }}>
            {event.tools.join(', ')}
          </span>
        </div>
      )

    case 'auto_dismissed':
      return (
        <div style={{ padding: '4px 0', marginBottom: '4px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#16a34a' }}>
            ✓ Score too low — auto-dismissed
          </span>
        </div>
      )

    case 'error':
      return (
        <div style={{
          padding: '6px 10px',
          borderRadius: '6px',
          background: '#fee2e2',
          border: '1px solid #fca5a5',
          marginBottom: '4px',
        }}>
          <span style={{ fontSize: '0.8rem', color: '#991b1b' }}>Error: {event.message}</span>
        </div>
      )

    default:
      return null
  }
}

const ModerationTraceModal = ({ events, isLoading, onClose }) => {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const processed = processEvents(events)
  const lastIterIdx = processed.reduce((last, ev, i) => ev.type === 'iteration' ? i : last, -1)

  return createPortal(
    <motion.div
      style={{
        position: 'fixed', inset: 0, zIndex: 10000,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onClick={onClose}
    >
      <motion.div
        style={{
          background: '#fff',
          borderRadius: '12px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
          width: '100%',
          maxWidth: '520px',
          maxHeight: '75vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid #eaf4f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4b896f' }}>Agent Review</span>
            {isLoading && (
              <span style={{ display: 'flex', gap: '3px', alignItems: 'center' }}>
                {[0, 1, 2].map(i => (
                  <motion.span
                    key={i}
                    style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#4b896f', display: 'block' }}
                    animate={{ opacity: [0.3, 1, 0.3] }}
                    transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                  />
                ))}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', padding: '2px' }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" style={{ width: '18px' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Event log */}
        <div style={{ overflowY: 'auto', overflowX: 'hidden', padding: '12px 18px', flex: 1 }}>
          {processed.length === 0 && (
            <p style={{ fontSize: '0.8rem', color: '#aaa', fontStyle: 'italic' }}>Waiting for agent…</p>
          )}
          <AnimatePresence initial={false}>
            {processed.map((event, i) => (
              <motion.div
                key={event._key}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <EventRow
                  event={event}
                  isActiveStep={isLoading && event.type === 'iteration' && i === lastIterIdx}
                />
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}

export default ModerationTraceModal
