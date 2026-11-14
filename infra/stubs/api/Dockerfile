# Placeholder api image; replaced by ./api/Dockerfile.
FROM node:20-alpine

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION} \
    NODE_ENV=production \
    PORT=3000

WORKDIR /app
COPY server.js ./

USER node
EXPOSE 3000
CMD ["node", "server.js"]
