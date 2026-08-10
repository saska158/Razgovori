# My social media Waste of time — Moderation Agent

The moderation agent is a Node.js server embedded in the My social media Waste of time social media app. When a user reports a post, the server runs an autonomous investigation and makes a binding moderation decision — dismiss, warn the author, remove the post, or ban the user. The decision is written back to Firestore, and the frontend shows the outcome to both the reporter and the post author without any human in the loop.

---

## Data sources

- **Firestore** — post content, comments, user profiles, violation history, cross-reports, and coordination signals (same Firebase project as the app)
- **Perspective API** — Google's toxicity scoring for post text (used for triage before the agent runs)
- **Claude Vision** — image analysis for posts that contain images, run by the agent as a tool call
- **Skill files** (`server/skills/`) — per-violation-type guidance loaded from local markdown files at runtime

---

## How it works

A report arrives at `POST /report` with the post text, image URL, room, and user IDs. The pipeline then runs in three stages:

**Stage 1 — Triage (Perspective API)**
The post text is scored for toxicity (0–1).
- Score < 0.05 → auto-dismissed (genuinely clean content)
- Score ≥ 0.90 → fast-tracked directly to the `content-toxicity` skill
- Score 0.05–0.89 → passes to the router

**Stage 2 — Routing (Claude Haiku)**
A lightweight model reads the post and picks the most appropriate skill:
- `content-toxicity` — hate speech, slurs, dehumanising language
- `harassment` — targeted attacks, pile-ons, coordinated targeting
- `misinformation` — false claims, health misinformation
- `threats-and-violence` — explicit threats, calls for violence

**Stage 3 — Investigation (Claude Sonnet)**
The agent loops (up to 10 iterations), calling tools to gather context:
- `get_post`, `get_comments` — fetch the reported content and community reaction
- `call_perspective` — score toxicity directly within the agent loop
- `analyze_image` — run Claude Vision on any attached image
- `get_user_history`, `get_user_violations` — check the author's posting pattern and prior offences
- `get_reporter_history` — assess the reporter's credibility
- `get_cross_reports` — check how many other users have reported this person
- `get_posts_by_user_in_room`, `get_posts_targeting_victim` — detect coordinated patterns across the platform
- `remove_additional_post` — remove related posts discovered mid-investigation

When the agent has enough signal, it calls a decision tool (`dismiss_report`, `warn_user`, `remove_post`, or `ban_user`). Before the decision is finalised, the agent is asked to self-verify — it reflects on whether it is confident, and can revise or gather more context before confirming.

---

## Setup

**Requirements:** Node.js 18+, three API keys.

```bash
# 1 — get the code (clone or Download ZIP from the GitHub repo page)
git clone https://github.com/aleksandra-mikic/My-social-media-Waste-of-time.git
cd My-social-media-Waste-of-time/server

# 2 — install dependencies
npm install

# 3 — create the env file
cp .env.example .env
```

Open `server/.env` and fill in the three values — ask the repo owner to share them privately:

```
ANTHROPIC_API_KEY=
PERSPECTIVE_API_KEY=
FIREBASE_SERVICE_ACCOUNT=
```

`FIREBASE_SERVICE_ACCOUNT` is the full Firebase Admin SDK JSON pasted as a single-line string.

---

## Input example

In production the React app sends this automatically when a user clicks "Report". For the demo you send it directly via the script.

```json
POST http://localhost:4000/report

{
  "postId": "abc123",
  "room": "reading",
  "reportedBy": "uid-of-reporter",
  "creatorUid": "uid-of-post-author",
  "postText": "You people are all the same. Stop spreading your garbage opinions here. Nobody wants you in this community.",
  "postImage": ""
}
```

You can also pass an image URL in `postImage` — the agent will call `analyze_image` on it automatically.

---

## Option 1 — run via script (no UI needed)

```bash
cd My-social-media-Waste-of-time/server

# terminal 1 — start the server
node index.js

# terminal 2 — run the demo with the default test post
node demo.js

# or pass your own post text
node demo.js "Some post text you want to test"
```

---

## Option 2 — run via the UI (full end-to-end)

Use this to see the complete flow — report triggered from the app, decision reflected back in the UI. You need two user accounts (reporter and post author).

```bash
# Terminal 1 — React frontend (from repo root)
npm start
# → http://localhost:3000

# Terminal 2 — Moderation server
cd server
npm start
# → http://localhost:4000
```

1. Sign in as the **post author** and create a post with content you want to test
2. Sign out, sign in as the **reporter**
3. Find the post and click the **Report** button
4. Watch the server terminal — the investigation trace streams there in real time
5. Once the agent finishes, the UI updates automatically:
   - **As the reporter** — you'll see a status message on the post you reported
   - **As the post author** (sign back in) — you'll see a banner at the top of your feed

To verify the Firestore write, open the Firebase console → your project → Firestore → `reports` collection.

---

## Example logs (looping progress)

```
──────────────────────────────────────────────────────────────
  My social media Waste of time — Moderation Agent demo
──────────────────────────────────────────────────────────────
  Post text: "You people are all the same. Stop spreading your garbage..."
──────────────────────────────────────────────────────────────

Report created: kX9mQpL2nR7vYwBc
Streaming moderation trace...

[router] The post uses hostile generalising language targeting a group — "you people", "garbage opinions", "nobody wants you".

──────────────────────────────────────────────────────────────
  Skill selected: harassment
  Reason: Dismissive group framing with "you people" combined with exclusionary language
──────────────────────────────────────────────────────────────

  tool start "Fetching post content"
  tool result "get_post": Post fetched

  tool start "Scoring toxicity"
  tool result "call_perspective": Score: 0.847

[agent] The post scores 0.847 on toxicity — high signal. The phrase "you people" paired with "garbage opinions" and "nobody wants you" reads as targeted group dismissal aimed at silencing participation.

  tool start "Checking violation history"
  tool result "get_user_violations": 0 violations: 0W / 0R / 0B

  tool start "Checking reporter credibility"
  tool result "get_reporter_history": 2 reports filed

  tool start "Reading community reaction"
  tool result "get_comments": 3 comments

[agent] No prior violations on record. Reporter history is credible. Community reaction shows concern. Content is clearly hostile but this is a first offence — warn is the appropriate response.

[verification] Decision reached — agent self-checking before finalizing...
[verification] Confirmed. Decision stands.

──────────────────────────────────────────────────────────────
  DECISION:   WARN_USER
  REASONING:  High toxicity score (0.847). The post uses "you people" framing
              with explicit exclusionary language ("nobody wants you"). No prior
              violations — warn is proportionate for a first offence.
──────────────────────────────────────────────────────────────

Report kX9mQpL2nR7vYwBc written to Firestore — collection: reports
```

---

## Expected output (roughly)

The agent writes to Firestore and the React frontend reflects the result immediately.

**Reporter** sees a status message on the post they reported:
> "Your report has been reviewed. Action has been taken."

**Post author** sees a banner at the top of their feed:
> "One of your posts was flagged by our moderation system. Please review our community guidelines."

**In Firestore** (`reports` collection):
```json
{
  "postId": "abc123",
  "room": "reading",
  "status": "warned",
  "skillName": "harassment",
  "perspectiveScore": 0.847,
  "reasoning": "High toxicity score (0.847). The post uses 'you people' framing...",
  "resolvedAt": "2026-08-10T14:23:11Z"
}
```

**In Firestore** (`profiles/{uid}`):
```json
{
  "warned": true
}
```
