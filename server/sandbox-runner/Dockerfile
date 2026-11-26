# Sandbox image with every supported language: JavaScript (Node), Python 3, Java, C++.
# Build on the server:   docker build -t coderoom-runner server/sandbox-runner
FROM node:24-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 \
      default-jdk-headless \
      g++ libc6-dev \
    && rm -rf /var/lib/apt/lists/*

COPY runner.mjs /runner/runner.mjs

# Run as the unprivileged "node" user, never root.
USER node
WORKDIR /sandbox
CMD ["node", "/runner/runner.mjs"]
