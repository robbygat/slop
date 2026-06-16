# SLOP.game — zero-dependency Node server (needs Node 22.5+ for node:sqlite)
FROM node:22-slim
WORKDIR /app
COPY . .
# the SQLite db lives in a volume so deploys don't wipe accounts/games
ENV DB_PATH=/data/slop.db
RUN mkdir -p /data
VOLUME /data
EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
