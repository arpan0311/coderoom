# Deploying CodeRoom

| Part | Where | Cost |
|---|---|---|
| Frontend (React) | **Vercel** | Free |
| Backend (Express + Socket.io + code runner) | **Render** (Docker) | Free |
| Database | **MongoDB Atlas** (M0 cluster) | Free |

None of these need a credit card.

> **Why not put the backend on Vercel?** Vercel only runs short functions. It cannot keep the live
> Socket.io connections open, and it cannot run the Python / Java / C++ compilers. Render runs our
> backend as a normal, always-on server from a Dockerfile that has all the compilers inside.

---

## Step 1. Put the code on GitHub

Create an **empty** repository on github.com (for example `coderoom`), then:

```bash
cd interview-platform
git init
git add .
git commit -m "CodeRoom: live interview platform"
git branch -M main
git remote add origin https://github.com/<your-username>/coderoom.git
git push -u origin main
```

`.gitignore` already keeps out `node_modules` and `.env` (your secrets).

## Step 2. MongoDB Atlas (database)

1. Sign up at **mongodb.com/atlas** → create a free **M0** cluster.
2. **Database Access** → **Add user** → choose a username and password (avoid `@ : / ?` in the password).
3. **Network Access** → **Add IP address** → `0.0.0.0/0` (allow from anywhere; Render's IP address changes).
4. **Connect → Drivers** → copy the URL and add the database name `interview_platform` before the `?`:
   ```
   mongodb+srv://USER:PASSWORD@cluster0.xxxxx.mongodb.net/interview_platform?retryWrites=true&w=majority
   ```

## Step 3. Backend on Render

1. Sign up at **render.com** with your GitHub account.
2. **New → Blueprint** → pick your `coderoom` repo. Render reads [`render.yaml`](../render.yaml).
3. It asks for 2 values:
   - `MONGO_URI` = the Atlas URL from step 2
   - `CLIENT_URL` = type `https://example.com` for now (you fix it in step 5)
4. Click **Apply**. The first build takes about **5–10 minutes**, because it installs Java, Python and C++.
5. When it is **Live**, open `https://<your-service>.onrender.com/api/health`. You should see:
   ```json
   {"ok":true,"db":true,"sandbox":"process"}
   ```
6. Check the logs (**Logs** tab). You should see:
   `Languages: JavaScript, Python 3, C++17, Java` and `Seed done.` (demo users and questions are added automatically the first time).

## Step 4. Frontend on Vercel

1. Sign up at **vercel.com** with GitHub → **Add New → Project** → import `coderoom`.
2. **Root Directory**: `client` (click Edit and choose the folder). Framework: **Vite** (detected automatically).
3. **Environment Variables**: `VITE_API_URL` = `https://<your-service>.onrender.com` (no `/` at the end).
4. **Deploy**. You get a URL like `https://coderoom-xyz.vercel.app`.

`client/vercel.json` makes links like `/room/ABC123` work when the page is refreshed.

## Step 5. Connect them

On Render → your service → **Environment** → set `CLIENT_URL` to your exact Vercel URL
(for example `https://coderoom-xyz.vercel.app`, with no `/` at the end) → **Save**. Render restarts the service.

Done! Open your Vercel URL and log in with `interviewer@demo.com` / `demo1234`.

---

## Good to know about the free plan

- **Sleeping:** Render's free service sleeps after 15 minutes with no visitors. The first visit after that takes **about 1 minute** to wake up.
  **Before an interview or demo, open the site 2 minutes early.**
- **Memory:** the free plan has 512 MB. Code runs one at a time (`RUN_CONCURRENCY=1`), so Java fits.
- **Updates:** every `git push` redeploys both Render and Vercel automatically.

## How safe is the code runner on Render?

Render cannot start a fresh Docker container for every run, so the code runs as a separate program inside our container, with these protections:

| Protection | How |
|---|---|
| Can't read our secrets | Runs as a separate user `sandbox` (no permissions). Its environment is cleaned. The server's secrets stay readable only by root |
| Can't crash the server | `prlimit`: max 128 processes (stops fork bombs), 512 MB memory (Python/C++), 16 MB file size, 128 open files |
| Can't run forever | 2 s per test (Java 4 s), 15 s to compile, killed after that |
| Can't print forever | Output limit of 64 KB per test |
| Can't see hidden answers | Expected outputs never reach the sandbox; the server compares them |

**What is missing compared with the Docker driver:** network isolation (the code could open an internet connection) and a fully separate file system.
Say this honestly in an interview: *"On the free hosting I use process isolation with a separate user and resource limits. With a real server, I switch `SANDBOX_DRIVER=docker` and every run gets its own container with no network."*

---

## Later: full Docker isolation on your own server (optional)

If you get a Linux server (Azure for Students, DigitalOcean with the GitHub Student Pack, AWS…):

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo -E bash -
sudo apt-get install -y nodejs nginx certbot python3-certbot-nginx
sudo npm install -g pm2

git clone https://github.com/<you>/coderoom.git
docker build -t coderoom-runner coderoom/server/sandbox-runner   # image with all 4 languages
cd coderoom/server && npm ci --omit=dev && cp .env.example .env && nano .env
#   NODE_ENV=production, MONGO_URI=..., JWT_SECRET=..., CLIENT_URL=...,
#   SANDBOX_DRIVER=docker, DOCKER_IMAGE=coderoom-runner
npm run test:runner && npm run seed
pm2 start src/index.js --name coderoom-api && pm2 save && pm2 startup

sudo cp ~/coderoom/deploy/nginx.conf /etc/nginx/sites-available/coderoom   # edit server_name first
sudo ln -s /etc/nginx/sites-available/coderoom /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d <your-domain>     # HTTPS (camera/mic need HTTPS)
```

Then point Vercel's `VITE_API_URL` to `https://<your-domain>`.
