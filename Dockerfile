FROM node:22
WORKDIR /usr/src/app
COPY package*.json ./
RUN npm install
COPY src .

# src/relay.js is orbitdb-relay with deContact's access controller; browsers dial its
# WebSocket listener. Keep the peer id stable by passing RELAY_PRIV_KEY at run time.
ENV RELAY_WS_PORT=12345
ENV DATASTORE_PATH=/data/relay
EXPOSE 12345

# Command to run your app
CMD [ "node", "relay.js" ]