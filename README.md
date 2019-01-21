# slack-trustpilot

[![Build Status](https://travis-ci.org/trustpilot/slack-trustpilot.svg?branch=master)](https://travis-ci.org/trustpilot/slack-trustpilot)

Read and reply to your [Trustpilot](https://www.trustpilot.com/) reviews directly via [Slack](https://slack.com/). Integrate with [Webhook Notifications](https://businessapp.b2b.trustpilot.com/#/webhooks/) to get your reviews posted automatically in public or private channels.

Trustpilot also provides a hosted version of this project through [Trustpilot Labs](https://businessapp.b2b.trustpilot.com/#/labs/slack/).<br/>Continue here if you prefer your own API integration or would like to customize it.

## How does it work?

Once deployed and authorized on your Slack domain, the app creates a bot user and adds a new slash command which will enable you to ask for the latest review (e.g `/trustpilot latest` or `/trustpilot 5 stars` if you want to see a 5-star review). The latest unanswered review will then be displayed, along with a "Reply" button. If you want to reply, the app will create a dialog box where you can compose your reply and send it.

It's as easy as demonstrated by these screenshots!

[<img src="https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/slash_command.png">](https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/slash_command.png)

[<img src="https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/unanswered_reviews.jpg" width="175">](https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/unanswered_reviews.jpg) [<img src="https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/reply_dialog.png" width="175">](https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/reply_dialog.png) [<img src="https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/done.jpg" width="175">](https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/done.jpg)

## How to set this up

### Trustpilot Credentials

Make sure you have valid credentials to access the Trustpilot API, i.e. your Business Unit ID, API Key and API Secret. You will also need the login and password for your Business user on Trustpilot.

### Slack App Credentials

You will have to **[create an app](https://api.slack.com/apps/new)** on your Slack domain. Once your app is created, go to "Basic Information" and grab your Client ID, Client Secret and Signing Secret.

### Configuration

You should now have all the information to configure this app. Just clone this repo and edit the [`app/config.js`](app/config.js) file. The contents should be as follows:

```javascript
module.exports = {
  // Minimal configuration needed
  // Use the below environment variables or put values directly between the quotes, e.g.
  // SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID || '<Your Slack Client ID>'
  SLACK_CLIENT_ID: process.env.SLACK_CLIENT_ID || '',
  SLACK_SECRET: process.env.SLACK_SECRET || '',
  SLACK_SIGNING_SECRET: process.env.SLACK_SIGNING_SECRET || '',
  API_KEY: process.env.API_KEY || '',
  API_SECRET: process.env.API_SECRET || '',
  BUSINESS_USER_NAME: process.env.BUSINESS_USER_NAME || '',
  BUSINESS_USER_PASS: process.env.BUSINESS_USER_PASS || '',
  BUSINESS_UNIT_ID: process.env.BUSINESS_UNIT_ID || ''

  //...
};
```

As you can see, it's also possible to define all your configuration as environment variables, if you prefer this.

### Deploy this app somewhere

This is left as an [exercise to the reader](https://devcenter.heroku.com/articles/deploying-nodejs) :). You can – and maybe should – also run this app in a Docker container. The included [`Dockerfile`](Dockerfile) and [`docker-compose.yml`](docker-compose.yml) should set you off to a good start.

Once your app is deployed, the following endpoints should be reachable:

- `https://<your.app.url>/login`, where you will authorize your app for Slack
- `https://<your.app.url>/oauth`, where Slack will redirect after authorizing your app
- `https://<your.app.url>/slack/receive`, where Slack will send interactive messages.
- `https://<your.app.url>/incoming-webhooks/<your-slack-team-id>`, where new reviews can be posted. Use this endpoint to setup Webhook Notifications.

### Configure your app in Slack

- In "App Credentials", the Redirect URI should point to the OAuth endpoint at the place where you deployed your app. This should look like `https://<your.app.url>/oauth`.
- In "Bot Users", make sure to add a bot. Call it something nice, like `trustpilot` ;)
- In "Interactive Messages", paste your receiving endpoint (which should look like `https://<your.app.url>/slack/receive`)
- In "Slash Commands", create a new command (e.g `/trustpilot`) and point it to the same endpoint as above, `https://<your.app.url>/slack/receive`

You should now be able to authorize your app by visiting the login endpoint at `https://<your.app.url>/login`

### Tests and development: running the app locally with localtunnel

If you don't want to deploy this app just yet, this repo comes with everything you need to run the code locally.

After running the obligatory `npm install`, start the app with:

```
npm run local
```

Wait for the localtunnel.me URL to appear in the log messages. This will allow Slack to bridge with your locally running app:

```
Tunnel started at http://[random].localtunnel.me
```

Follow the instructions in the "Configure your app in Slack" section above, using the localtunnel URL as your app's URL. **Important!** Change the protocol to https to make Slack happy :)

Finally, go to `http://localhost:7142/login`, or your localtunnel URL followed by `/login`, and authorize your app.
