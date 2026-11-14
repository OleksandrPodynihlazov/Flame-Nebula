FROM node:20-alpine
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION} NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
USER node
EXPOSE 3000
CMD ["node", "app.js"]
