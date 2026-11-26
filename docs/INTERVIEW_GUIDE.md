# How to explain this project in an interview

Simple English notes. Read them a few times and say it in your own words.

---

## 1. The 30-second pitch

> "I built **CodeRoom**, a live technical interview platform with the MERN stack.
> An interviewer creates a room and sends a link. The candidate joins, and they get a **shared code editor**, a **video call** and **chat**.
> The candidate can code in **Python, C++, Java or JavaScript**.
> When they click Run, the code runs in an **isolated Docker sandbox** with no internet, limited memory and a time limit.
> It is checked against **hidden test cases**, and the interviewer gets a **report** at the end."

---

## 2. The main parts (draw this on a whiteboard)

```
React app  ──REST──▶  Express API  ──▶  MongoDB
    │                     │
    └──Socket.io──────────┤  (live editor, chat, video setup)
                          │
                          └──▶ Queue ──▶ Worker ──▶ Docker container (runs the code)
```

- **React + Monaco**: the UI. Monaco is the same editor as VS Code.
- **Express**: login, rooms, questions, running code, reports.
- **MongoDB**: users, questions, rooms, submissions.
- **Socket.io**: everything live.
- **Queue + Docker**: running untrusted code safely.

---

## 3. Questions they will ask, with answers

### "Why can't you just run the code with `eval` on the server?"
Because the candidate's code is **untrusted**. It could:
- loop forever and block the server,
- use all the memory,
- read our secrets (database password, JWT key),
- delete files, or
- attack other websites from our server.

So the code never runs inside the API server.

### "How did you isolate the code?"
Every run gets a **brand new Docker container**, which is deleted afterwards. The container has:
- `--network none`: no internet,
- `--memory 128m` and `--cpus 0.5`: small memory and CPU,
- `--pids-limit 64`: stops "fork bombs" (code that keeps creating new processes),
- `--read-only`: it cannot change its own files,
- `--user node` and `--cap-drop ALL`: it does not run as root and has no special Linux powers,
- **timeouts**: 15 seconds to compile, and 2 seconds per test (Java gets 4, because the JVM starts slowly),
- an **output limit**: we stop it if it prints too much.

**On the free hosting (Render)** I can't start a container for every run, so I use the "process" mode, hardened:
- the code runs as a separate Linux user called `sandbox` with no permissions, so it **cannot read the server's secrets**,
- `prlimit` caps processes (stops fork bombs), memory, file size and open files,
- the environment is cleaned, and the same timeouts apply.

What it does **not** have is network isolation. I say this honestly: *"With a real server I switch one setting, `SANDBOX_DRIVER=docker`, and every run gets its own container with no network."*

### "How do you support many languages?"
I use **one test format for every language**: each test is some **input text** (standard input) and the **exact output** expected (standard output). HackerRank and Codeforces work the same way.
So I don't need a special test harness per language. To add a language, I only add:
1. how to compile and run it (in `runner.mjs`),
2. a starter template, and
3. its compiler in the Docker image.

### "How do you check the answers?"
Inside the container, a small **runner** script compiles the code **once** (for C++ and Java), then runs it once per test, feeding the input and capturing the output, the errors, the exit code and the time.
The **server** then compares the output with the expected answer. It ignores line endings (`\r\n` vs `\n`) and trailing spaces.
Verdicts: **Accepted, Wrong answer, Time limit exceeded, Runtime error, Compile error**.

### "Couldn't the candidate cheat?"
- The **expected outputs never go into the sandbox**. Only the inputs do. So even code that reads the whole container cannot find the hidden answers.
- The runner prints its result after a **random marker** that is new on every run, for example `__RESULT_8f3a...__`. The candidate's program cannot guess it.

### "How do both people see the same language?"
The chosen language is stored inside the shared **Yjs** document. When someone switches, the **server** sets it and adds the starter template. Only the server adds the template, so it never appears twice. Each question + language has its own text, so switching back to Python brings back your Python code.

### "What are hidden tests?"
**Run** uses only the example tests. **Submit** also uses hidden tests. For hidden tests, the candidate only sees pass or fail. The inputs and expected outputs **never leave the server**, so the candidate cannot hard-code the answers.

### "Why a queue?"
If 50 people click Run at the same time, starting 50 containers together could crash the server. The queue runs only a few jobs at a time (for example 2), and the rest wait. If the queue is too full, the API answers "busy, try again" (HTTP 503).
With Redis + **BullMQ**, the workers can even run on **other machines**.
I also added **rate limiting**: 20 runs per minute per user.

### "How does the shared editor work? What if both people type at the same time?"
I use **Yjs**, which is a **CRDT** (Conflict-free Replicated Data Type).
- Each key press becomes a small "update".
- The update goes to the server through Socket.io, and the server sends it to the other person.
- Yjs is built so that updates can arrive in **any order** and everyone still ends with the **same text**. Nothing is lost and nobody overwrites the other.
- The server keeps one Yjs document per room in memory and **saves the code to MongoDB** 2 seconds after typing stops, and again when the last person leaves.

*Simpler option I did not choose:* send the whole code on every change. If two people type at once, one person's text would overwrite the other's.

### "How does the video call work?"
**WebRTC**. The video goes **directly between the two browsers** (peer-to-peer), not through my server, so it is fast and cheap.
The browsers first need to exchange some setup messages (the "offer", the "answer" and network details called "ICE candidates"). That is called **signaling**, and I do it over Socket.io.
A **STUN** server helps each browser find its public address. On very strict networks you also need a **TURN** server to relay the video. That is a next step.

### "How do you handle security / login?"
- Passwords are hashed with **bcrypt**.
- Login gives a **JWT** token. The same token is checked for REST calls **and** for socket connections.
- **Roles**: only interviewers can create rooms, see hidden tests, end interviews and write feedback.
- Room access: only the room's interviewer and its candidate can join. The first candidate who opens the link is locked in. Others get "This room belongs to another candidate".
- **Helmet** (security headers), **CORS** (only our frontend), a body size limit, and rate limits on login and runs.

### "How does the timer work?"
The room stores `startedAt` and `durationMinutes`. The **server** decides when time is up, not the browser, so a candidate cannot change it. After the deadline, the server rejects edits and runs, and the editor becomes read-only.

### "What would you do to scale it?"
1. Run several API servers behind a load balancer, with the **Socket.io Redis adapter** so events reach users on other servers.
2. Keep the Yjs documents in Redis (or use sticky sessions).
3. Run many **workers** on separate machines, all reading from the BullMQ queue.
4. Add a **TURN** server for video.
5. Use lighter sandboxes like **gVisor** or **Firecracker** micro-VMs for even stronger isolation.

### "What was the hardest part?"
Pick one and tell it as a story:
- **Sandboxing**: thinking about all the ways code can attack (infinite loops, fork bombs, reading secrets, faking results) and blocking each one.
- **Shared editing**: understanding why a CRDT is needed when two people type at once.
- **WebRTC**: making sure only one side starts the call. I added a "call-ready" message: whoever is already in the room calls the new person.

---

## 4. Demo plan (2–3 minutes)

1. Log in as the **interviewer**, pick 2 questions, set 45 minutes, and create the room.
2. **Copy the invite link** and open it in another browser as the **candidate**.
3. Show live typing: text appears on the other screen right away.
4. **Switch the language** (for example Python → Java): it changes on both screens.
5. Click **Run**: show the input, expected output and "your output" for each test.
6. Write `while True: pass` and click Run: show **"Time limit exceeded"**. *(This proves the sandbox.)*
7. Fix the code and click **Submit**: show the **hidden tests** passing.
8. As the interviewer, switch to **Q2**: it changes for the candidate too.
9. Open the **Report**: give a rating and decision, and show the submissions and chat log.

---

## 5. Words to know

| Word | Simple meaning |
|---|---|
| Sandbox | A locked box where unsafe code can run without hurting anything outside |
| Container (Docker) | A small, separate mini-computer that starts in about a second |
| CRDT | A data type that lets many people edit at once and always ends the same |
| WebRTC | Browser technology for direct video/audio between users |
| Signaling | Passing the setup messages so two browsers can connect |
| STUN / TURN | STUN finds your public address. TURN relays the video when a direct link fails |
| Queue | A waiting line for jobs, so the server is not overloaded |
| JWT | A signed token that proves who you are |
| Rate limiting | Allowing only N requests per minute per user |
