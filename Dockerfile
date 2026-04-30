# No client build on QNAP - client/dist is pre-built on Windows
FROM node:20-alpine
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install --production
COPY server/ ./server/
COPY client/dist ./client/dist
EXPOSE 3000
CMD ["node", "server/index.js"]
