# @Mentions Feature

## Why this was built

The moderation server needs to detect coordinated harassment — cases where multiple users target the same person, and individual posts may not violate rules on their own but together constitute a pile-on or bullying pattern.

To support this, the server needs a queryable field on Firestore documents that captures who a post is *about*, not just who wrote it. That field is `mentionedUids`.

See `server/MULTI_TARGET_UPGRADE.md` for the full multi-target upgrade design.

---

## What was implemented

### Product feature
Users can type `@` in any post or comment form and get an autocomplete dropdown of matching users. Selecting a user inserts a mention that appears as a highlighted `@DisplayName` in the rendered post.

### Data stored
Each post/comment document now has a top-level `mentionedUids` array alongside `content`:

```
/watching/{postId}
  creatorUid: "uid_of_author"
  content: { text: "Hey @[Alice](uid1) check this", image: "" }
  mentionedUids: ["uid1"]
  timestamp: ...
  likes: {}
  comments: []
```

`mentionedUids` is top-level (not inside `content`) so Firestore can index it and the server can query with `array-contains`.

The raw mention markup `@[DisplayName](uid)` is stored in `content.text`. This lets the renderer reconstruct the display from text alone, without needing to cross-reference the `mentionedUids` array.

---

## Files

### App (client)

| File | Role |
|---|---|
| `src/components/MentionTextarea.js` | Replaces `Textarea` in post/comment forms. Wraps `react-mentions` — detects `@`, queries profiles, shows dropdown, inserts markup on select. |
| `src/api/searchUsers.js` | Prefix-searches the `profiles` Firestore collection for autocomplete suggestions. Runs two queries (lowercase + capitalized) to handle case, same pattern as `UsersSearch.js`. |
| `src/utils/renderContent.js` | Renders post/comment text. Splits on `@[Name](uid)` markup first (renders as styled `@Name` span), then applies `linkify` to remaining parts for URL handling. Old posts without mentions are unaffected. |
| `src/components/post/PostForm.js` | Swapped `Textarea` → `MentionTextarea`. `initialData` now includes `mentionedUids: []`. `handleDataChange` receives `(newValue, mentionedUids)` instead of a DOM event. |
| `src/components/post/CommentsForm.js` | Same changes as `PostForm`. |
| `src/api/sendPostToFirestore.js` | Destructures `{ text, image, mentionedUids }` from `data`. Stores `content: { text, image }` and `mentionedUids` as separate top-level fields. |
| `src/components/post/FirestoreItemContent.js` | Uses `renderContent` instead of `linkify`. |
| `src/App.css` | `.mention` class styles the rendered `@Name` span (green, bold). |

### Moderation server

| File | Role |
|---|---|
| `server/tools.js` | `get_posts_targeting_victim(victim_uid)` — queries all three rooms for posts where `mentionedUids array-contains victim_uid`. Returns posts sorted by recency, `uniquePerpetratorCount`, timing buckets (`postsInLast1h`, `postsInLast24h`), and a `coordinationSignal` (low / medium / high). |
| `server/agent.js` | Tool registered in `CONTEXT_TOOLS` with label `"Scanning for coordinated targeting"` and a summary line (`"4 posts found, 3 perpetrators, coordination: high"`). |
| `server/skills/harassment/SKILL.md` | Agent instructed to call `get_posts_targeting_victim` when the report suggests multiple users may be targeting the same person. Decision table updated with medium/high coordination signal rows. |

---

## Mention markup format

`react-mentions` stores mentions in the text using this markup:

```
@[DisplayName](uid)
```

Examples:
- `"Hey @[Alice](abc123) what do you think?"` — single mention
- `"@[Alice](abc123) and @[Bob](def456) please check this"` — two mentions

The regex used to parse this in `renderContent.js`:
- Split: `/@\[[^\]]+\]\([^)]+\)/`
- Parse: `/^@\[([^\]]+)\]\(([^)]+)\)$/` — group 1 = display name, group 2 = uid

---

## How the server uses mentionedUids

`get_posts_targeting_victim` queries all three rooms using Firestore `array-contains`:

```js
db.collection(room)
  .where('mentionedUids', 'array-contains', victim_uid)
  .orderBy('timestamp', 'desc')
  .limit(20)
  .get()
```

The coordination signal is computed from the result:

```
postsInLast1h >= 3                                    → high
postsInLast24h >= 5 OR uniquePerpetratorCount >= 3   → medium
otherwise                                              → low
```

The harassment skill uses this to distinguish an isolated post from an organized pile-on, and scales the response accordingly — warning first-time participants, removing posts, and escalating repeat offenders.

---

## Limitations

- Mentions only work in posts and comments, not in chat messages (`ChatBoxForm` unchanged — DMs are 1-on-1 so mentions are less relevant).
- The autocomplete prefix search is case-sensitive to Firestore's ordering, so two queries are run (lowercase + capitalized first letter). Mid-word casing (e.g. searching `ALI` to find `Alice`) won't match.
- Old posts have no `mentionedUids` field. The moderation server must treat a missing field as an empty array (Firestore `array-contains` queries naturally exclude documents where the field doesn't exist).
