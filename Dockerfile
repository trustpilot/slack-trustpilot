FROM mhart/alpine-node:8

RUN mkdir -p /usr/app/slack-trustpilot/src

COPY package.json yarn.lock /usr/app/slack-trustpilot/

WORKDIR /usr/app/slack-trustpilot

RUN yarn

COPY src/* /usr/app/slack-trustpilot/src/

EXPOSE 7142

CMD [ "npm", "start" ]
