FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

FROM node:22-slim
WORKDIR /app
COPY --from=build /app/dist dist/
COPY --from=build /app/package.json /app/package-lock.json ./
RUN npm ci --omit=dev
ENTRYPOINT ["node", "dist/index.js"]
