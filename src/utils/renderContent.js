import linkify from './linkify'

const MENTION_SPLIT = /(@\[[^\]]+\]\([^)]+\))/
const MENTION_PARSE = /^@\[([^\]]+)\]\(([^)]+)\)$/

const renderContent = (text) => {
  if (!text) return null
  return text.split(MENTION_SPLIT).flatMap((part, i) => {
    const m = part.match(MENTION_PARSE)
    if (m) {
      return [<span key={`m${i}`} className="mention">@{m[1]}</span>]
    }
    return linkify(part)
  })
}

export default renderContent
