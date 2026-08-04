# Razgovori

A React social media app with an AI-powered content moderation system built on the Claude API.

## Architecture

The project has two parts:

- **Frontend** — React app (`/src`), connects to Firebase directly
- **Moderation server** — Node.js/Express (`/server`), runs the AI moderation agent

### How moderation works

When a user reports a post:
1. A **router agent** (Claude Haiku) reads the report and selects the most appropriate moderation skill. Image-only posts skip the LLM and route directly to `content-toxicity`.
2. A **moderation agent** (Claude Sonnet) runs an agentic loop — autonomously deciding which tools to call, including `analyze_image` to inspect any attached image (downloaded and sent as base64; AVIF images are converted to JPEG via Cloudinary before analysis), `call_perspective` to score toxicity, and fetching post content, comments, user history, and violation history from Firestore. Post text is passed as context to image analysis so combined threats (e.g. a house photo + "I know where you live") are caught. For harassment cases it can also remove additional posts discovered during investigation before finalizing.
3. The decision (dismiss / warn / remove / ban / escalate to human) is written back to Firestore in real time, along with any additional posts removed during investigation. When the agent escalates, the report is marked `status: escalated` and appears in the admin review page for a human to resolve.

Available skills: `content-toxicity`, `harassment`, `misinformation`, `threats-and-violence`

The harassment skill can detect coordinated pile-ons — cases where multiple users all target the same person and individual posts may look borderline in isolation. This works because the app stores a `mentionedUids[]` field on every post when a user is `@mentioned`, giving the server a queryable signal for who a post is *about*, not just who wrote it.

---

## Setup

### Prerequisites

- Node.js 18+
- A Firebase project (Firestore enabled)
- An Anthropic API key
- A Google Perspective API key

---

### 1. Frontend

```bash
npm install
npm start
```

Opens at `http://localhost:3000`.

---

### 2. Moderation server

```bash
cd server
npm install
cp .env.example .env
```

Open `server/.env` and fill in the three values:

```
ANTHROPIC_API_KEY=
PERSPECTIVE_API_KEY=
FIREBASE_SERVICE_ACCOUNT=
```

For the admin review page, add `REACT_APP_ADMIN_UID` to the root `.env`:

```
REACT_APP_ADMIN_UID=<your Firebase UID>
```

The admin page (`/admin`) is only accessible to the user whose UID matches this value. It shows all reports where the agent escalated to human, with the agent's uncertainty reasoning and action buttons to resolve them.

| Key | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | Ask the repo owner to share privately |
| `PERSPECTIVE_API_KEY` | Ask the repo owner to share privately |
| `FIREBASE_SERVICE_ACCOUNT` | Ask the repo owner to share privately |

`FIREBASE_SERVICE_ACCOUNT` is the entire Firebase service account JSON as a single-line string:
```
FIREBASE_SERVICE_ACCOUNT={"type":"service_account","project_id":"..."}
```

Start the server:

```bash
npm run dev
```

Runs at `http://localhost:4000`.

---

### 3. Run both together

Open two terminal tabs:

```bash
# Tab 1 — frontend
npm start

# Tab 2 — server
cd server && npm run dev
```

---

## Notes

- `server/.env` is git-ignored and must be created locally — it is never committed
- If the Perspective API key is missing, scoring falls back to a neutral `0.5` and the agent still runs
- If the Anthropic key is missing, report submissions will fail silently on the server
