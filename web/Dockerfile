FROM node:22-bookworm-slim

# Prisma needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@12.11.2 && npm cache clean --force
WORKDIR /srv/web

COPY package.json pnpm-lock.yaml ./
# Plain folders, no symlinks, and a store inside the image.
RUN printf 'nodeLinker: hoisted\nallowBuilds:\n  prisma: true\n  "@prisma/engines": true\n' > pnpm-workspace.yaml \
    && pnpm install --frozen-lockfile

COPY . .
RUN printf 'nodeLinker: hoisted\nallowBuilds:\n  prisma: true\n  "@prisma/engines": true\n' > pnpm-workspace.yaml \
    && pnpm exec prisma generate && pnpm exec next build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["sh", "-c", "pnpm exec prisma migrate deploy && pnpm exec next start -H 0.0.0.0 -p 3000"]
