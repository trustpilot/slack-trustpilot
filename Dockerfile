FROM mhart/alpine-node:8

WORKDIR /app

COPY package.json package-lock.json /app/

RUN npm ci --only=production

# Multi-stage build! We copy the modules over to this slimmer base image and install the app on top.
FROM mhart/alpine-node:base-8

WORKDIR /app

COPY --from=0 /app .

COPY app/ .

EXPOSE 7142

CMD [ "node", "index.js" ]
