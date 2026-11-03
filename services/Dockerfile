# One image recipe for every service: docker build --build-arg SERVICE=auth -f services/Dockerfile .
# Build context is the repo root, because services depend on packages/shared through npm workspaces.
FROM node:22-alpine
# Prisma's engines need OpenSSL, which alpine does not ship
RUN apk add --no-cache openssl
ARG SERVICE
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm ci
RUN npm run build -w @stock/shared && npm run build -w @stock/${SERVICE}
WORKDIR /app/services/${SERVICE}
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
