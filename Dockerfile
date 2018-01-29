FROM mhart/alpine-node:8

RUN mkdir -p /usr/src/slack-trustpilot/app

COPY package.json yarn.lock /usr/src/slack-trustpilot/

WORKDIR /usr/src/slack-trustpilot

RUN yarn

COPY app/ /usr/src/slack-trustpilot/app/

EXPOSE 7142

CMD [ "npm", "start" ]
