import { MentionsInput, Mention } from 'react-mentions'
import searchUsers from '../api/searchUsers'

const mentionsInputStyle = {
  control: {
    width: '100%',
    fontFamily: 'inherit',
  },
  '&multiLine': {
    highlighter: {
      padding: '1em',
      fontFamily: 'inherit',
      fontWeight: 'inherit',
      lineHeight: 'inherit',
      border: 'none',
    },
    input: {
      overflow: 'hidden',
      resize: 'none',
    },
  },
  suggestions: {
    zIndex: 1000,
    list: {
      background: 'white',
      border: '1px solid #e0e0e0',
      borderRadius: '12px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      overflow: 'hidden',
    },
    item: {
      padding: '8px 16px',
      color: 'var(--dark-green)',
      fontSize: '0.95rem',
      cursor: 'pointer',
      '&focused': {
        background: '#eaf4f0',
      },
    },
  },
}

const MentionTextarea = ({ value, onChange, placeholder, style = {}, maxLength }) => {
  const fetchUsers = (query, callback) => {
    searchUsers(query).then(callback).catch(() => callback([]))
  }

  const combinedStyle = {
    ...mentionsInputStyle,
    '&multiLine': {
      ...mentionsInputStyle['&multiLine'],
      highlighter: {
        ...mentionsInputStyle['&multiLine'].highlighter,
        paddingLeft: style.paddingLeft || '1em',
        fontSize: style.fontSize || 'inherit',
      },
      input: {
        ...mentionsInputStyle['&multiLine'].input,
        ...(style.fontSize && { fontSize: style.fontSize }),
        ...(style.paddingLeft !== undefined && { paddingLeft: style.paddingLeft }),
        ...(style.background !== undefined && { background: style.background }),
        ...(style.borderBottom !== undefined && { borderBottom: style.borderBottom }),
      },
    },
  }

  return (
    <MentionsInput
      value={value}
      onChange={(_, newValue, __, mentions) => onChange(newValue, mentions.map(m => m.id))}
      placeholder={placeholder}
      maxLength={maxLength}
      style={combinedStyle}
      a11ySuggestionsListLabel="Suggested users to mention"
      autoFocus
    >
      <Mention
        trigger="@"
        data={fetchUsers}
        markup="@[__display__](__id__)"
        displayTransform={(_, display) => `@${display}`}
        style={{ backgroundColor: '#d4edda', borderRadius: '3px', padding: '1px 0' }}
        appendSpaceOnAdd
      />
    </MentionsInput>
  )
}

export default MentionTextarea
