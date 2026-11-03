# One image for every service: it builds all of them, and each container starts its own with a command.
# Local compose sets the working directory with --build-arg SERVICE=<name>; Render sets the command per service.
# Build context is the repo root, because services depend on packages/shared through npm workspaces.
FROM node:22-alpine
# Prisma's engines need OpenSSL, which alpine does not ship
RUN apk add --no-cache openssl
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages ./packages
COPY services ./services
RUN npm ci
RUN npm run build
ARG SERVICE=auth
WORKDIR /app/services/${SERVICE}
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
