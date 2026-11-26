# CodeRoom — Live Technical Interview & Assessment Platform

A MERN app for live coding interviews. An interviewer and a candidate join the same room. They get:

- a **shared code editor** (both see every key press, like Google Docs for code)
- a **video call** and **chat**
- **4 languages**: JavaScript, Python, C++ and Java. Both people see the same language, and switching changes it for both
- **Run / Submit**: the code runs in an **isolated sandbox** and is checked against example tests and **hidden tests**
- a **timer** for timed assessments (the editor locks when time is up)
- a **report** with the final code, every submission, the chat log and the interviewer's rating and decision

## Tech stack

| Part | Tech |
|---|---|
| Frontend | React 19, Vite, React Router, Monaco Editor (the editor inside VS Code) |
| Backend | Node.js, Express 5 |
| Database | MongoDB with Mongoose |
| Real-time | Socket.io + **Yjs** (CRDT) for conflict-free shared editing |
| Video | WebRTC (peer-to-peer). Socket.io only passes the setup messages |
| Code execution | Job queue (in-memory, or **BullMQ + Redis**) → **Docker** sandbox per run, image with Node, Python 3, OpenJDK, g++ |
| Auth | JWT + bcrypt, roles: `interviewer` and `candidate` |

## Architecture

```
 Browser (React)                                Server (Node + Express)
 ┌──────────────────────┐   REST /api   ┌──────────────────────────────┐
 │ Monaco editor + Yjs  │──────────────▶│ Auth · Rooms · Questions     │──▶ MongoDB
 │ Video (WebRTC)       │               │                              │
 │ Chat                 │◀─ Socket.io ─▶│ Realtime: Yjs doc per room,  │
 └─────────┬────────────┘               │ chat, WebRTC signaling       │
           │                            │                              │
           │ video goes                 │ POST /run ─▶ Queue ─▶ Worker │
           ▼ peer-to-peer               └──────────────────┬───────────┘
 Other person's browser                                    ▼
                                         ┌─────────────────────────────────┐
                                         │ Docker container (one per run)  │
                                         │ no network · 512 MB · 1 CPU     │
                                         │ read-only · non-root · timeouts │
                                         └─────────────────────────────────┘
```

### Test format (works for every language)

Each test case is **text on standard input** + **the exact text expected on standard output**, like HackerRank or Codeforces. Line endings and trailing spaces are ignored.

### How a "Run" works

1. The browser sends the code and language to `POST /api/rooms/:code/run`.
2. The server builds a **job**: the code, the language and the test **inputs only**. Expected outputs never go into the sandbox.
3. The job goes into a **queue**, so many clicks at once cannot overload the server.
4. A worker starts a **fresh Docker container** and pipes the job in. Inside, [`sandbox-runner/runner.mjs`](server/sandbox-runner/runner.mjs) compiles once (C++/Java), then runs the program once per test with a per-test time limit (2 s, Java 4 s).
5. The runner prints its result after a **random marker** that changes every run.
6. The server compares outputs and sends the result to **both people** through Socket.io.
   Hidden tests only show pass/fail and the verdict. Their inputs and outputs never leave the server.

Verdicts: Accepted · Wrong answer · Time limit exceeded · Runtime error · Output limit exceeded · Compile error.

### Sandbox drivers

| `SANDBOX_DRIVER` | Where | Isolation |
|---|---|---|
| `docker` | Production (Linux server with Docker) | Full: own container, no network, memory/CPU/process limits, read-only file system, non-root, no Linux capabilities |
| `process` + hosted limits | Render / any Docker host ([server/Dockerfile](server/Dockerfile)) | Medium: runs as an unprivileged `sandbox` user (cannot read the API's secrets), `prlimit` caps processes/memory/files, cleaned environment, timeouts. No network isolation |
| `process` | Local development | Partial: child process with a cleaned environment (no secrets) and timeouts, using the compilers on your computer. **Not isolated** |

At startup the server asks the sandbox which compilers it has. Languages that are not installed show as "(not installed)" in the editor.

## Run it on your computer

You need **Node.js 22+** and **MongoDB** running locally (or a MongoDB Atlas URL).

```bash
# 1. Backend
cd server
npm install
cp .env.example .env        # on Windows: copy .env.example .env
npm run seed                # demo users + 4 questions
npm run dev                 # http://localhost:5000

# 2. Frontend (new terminal)
cd client
npm install
npm run dev                 # http://localhost:5173
```

Demo logins (password `demo1234`):

- Interviewer: `interviewer@demo.com`
- Candidate: `candidate@demo.com`

To try a full interview on one computer, use **two browsers** (for example Chrome and Edge, or one normal window and one private window). Log in as the interviewer in one and as the candidate in the other.

Check the sandbox: `cd server && npm run test:runner`

**Languages on your own computer:** with `SANDBOX_DRIVER=process`, a language works only if its compiler is installed and on PATH:
JavaScript → Node (already there) · Python → `python3` (or `py` on Windows) · C++ → `g++` (on Windows: MSYS2/MinGW) · Java → a JDK (`javac` + `java`).
With the Docker driver, all four are inside the image, so nothing else is needed.

## Project structure

```
server/src/
  index.js              Express + Socket.io setup
  config.js             all settings from .env
  models/               User, Question, Room, Submission
  routes/               auth, questions, rooms (+ run code, report)
  realtime/socket.js    Yjs shared editor, chat, WebRTC signaling, presence
  runner/languages.js   the 4 languages + starter templates
  runner/harness.js     builds the job, compares outputs, hides hidden tests
  runner/sandbox.js     docker / process sandboxes
  runner/queue.js       in-memory queue or BullMQ
  worker.js             separate worker process (when using Redis)
server/sandbox-runner/
  runner.mjs            runs INSIDE the sandbox: compile once, run each test
  Dockerfile            the coderoom-runner image (Node, Python, Java, C++)
client/src/
  pages/                Login, Register, Dashboard, NewQuestion, Room, Report
  components/           CodeEditor, VideoCall, Chat, RunResults, Timer
```

## Deploy

Frontend on **Vercel**, backend on **Render** (Docker, free), database on **MongoDB Atlas** (free).
Step by step: [deploy/DEPLOY.md](deploy/DEPLOY.md).

## Known limits and next steps

- 4 languages. Adding one = an entry in `runner.mjs` + `languages.js` + its compiler in the Dockerfile.
- Video uses only a STUN server. Some strict office networks need a **TURN** server (for example coturn).
- One API server. To scale out: Socket.io Redis adapter + store Yjs docs in Redis, and run several workers.
- Shared-editor cursors (Yjs "awareness") are not shown yet.
