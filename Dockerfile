FROM node:22-alpine3.19

LABEL maintainer="gurrrrrrett3 <gart@gart.sh>"
LABEL version="1.0"
LABEL description="a Jellyfin client for VRChat."

WORKDIR /app

COPY package.json package-lock.json ./
COPY scripts/ scripts/
RUN npm ci

COPY . .
RUN npm run build

RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser

<<<<<<< Updated upstream
# docker build -t vrchat-jellyfin .
=======
CMD ["npm", "start"]
>>>>>>> Stashed changes
