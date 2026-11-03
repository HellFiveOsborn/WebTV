# Dockerfile do backend WebTV.
#
# CONTEXTO DE BUILD: a raiz do repositorio (o parser compartilhado vive em
# `shared/`, fora de `backend/`).
#
# Build local:  docker build -f backend/Dockerfile -t webtv-backend .
# Run local:    docker run -p 8080:8080 webtv-backend
#
# Na Suga (Service from GitHub):
#   - Build method: Dockerfile
#   - Dockerfile path: backend/Dockerfile
#   - Root directory: (raiz do repo)
#   - Port: 8080

FROM node:22-alpine

WORKDIR /app

# O backend usa apenas o runtime do Node - nao ha dependencias npm.
COPY backend/package.json ./package.json
COPY backend/server.mjs ./server.mjs

# Parser compartilhado (fonte unica de verdade com o frontend)
COPY shared/parseEmbedcanais.mjs ../shared/parseEmbedcanais.mjs

ENV PORT=8080
ENV NODE_ENV=production
ENV EMBEDCANAIS_SOURCE_URL=https://embedcanais.online/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.mjs"]
