FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
ENV PORT=3030
# listen on every interface; hosts like Render set HOSTNAME to the container name
ENV HOSTNAME=0.0.0.0
EXPOSE 3030
CMD ["node", "server.js"]
