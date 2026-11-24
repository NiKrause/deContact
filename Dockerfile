FROM node:22
WORKDIR /usr/src/app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages ./packages
RUN pnpm install --prod --frozen-lockfile
COPY src ./src

# src/relay.js is orbitdb-relay with deContact's access controller; browsers dial its
# WebSocket listener. Keep the peer id stable by passing RELAY_PRIV_KEY at run time.
ENV RELAY_WS_PORT=12345
ENV DATASTORE_PATH=/data/relay
EXPOSE 12345

CMD [ "node", "src/relay.js" ]
