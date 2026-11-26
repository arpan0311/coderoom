# Image for hosting the API on Render / Railway / Fly (any host that runs a Dockerfile).
# It contains Node, Python 3, Java and C++, and runs candidate code with the "process"
# sandbox as a separate unprivileged user with resource limits.
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      default-jdk-headless \
      g++ libc6-dev \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -g 10001 sandbox \
    && useradd -u 10001 -g 10001 -M -s /usr/sbin/nologin sandbox

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

ENV NODE_ENV=production \
    SANDBOX_DRIVER=process \
    RUN_AS_UID=10001 \
    RUN_AS_GID=10001 \
    SANDBOX_LIMITS=1 \
    RUN_CONCURRENCY=1 \
    SEED_ON_START=true

# Stays root so it can start candidate programs as the "sandbox" user.
EXPOSE 5000
CMD ["node", "src/index.js"]
