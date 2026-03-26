FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json tsconfig.json ./
RUN npm install

COPY src ./src
RUN npm run build

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache tar

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY web ./web
COPY run.sh ./run.sh

RUN chmod +x ./run.sh

ENV NODE_ENV=production
ENV CONFIG_PATH=/data/options.json
ENV UI_PORT=8099
ENV START_MODE=addon

CMD ["./run.sh"]
