# slack-trustpilot: reply to your Trustpilot reviews from Slack

This app enables anyone in your Slack team to reply to your latest reviews on Trustpilot, straight from a dedicated Slack channel.

Once deployed and authorized on your Slack domain, the app creates a bot user, which you will be able to "@mention" and ask e.g. for the latest "5 stars" review. The latest unanswered review with the given star rating will then be displayed, along with a "Reply" button.

![Example] (https://github.com/trustpilot/slack-trustpilot/blob/master/example.png)

## How to set this up

### Trustpilot Credentials

Make sure you have valid credentials to access the Trustpilot API, i.e. your Business Unit ID, API Key and API Secret. You will also need the login and password for your Business user on Trustpilot.

### Slack App Credentials

You will have to **[create an app](https://api.slack.com/apps/new)** on your Slack domain. If you need inspiration for the short and long descriptions, you can use the following:

- Short description : An application to reply to Trustpilot reviews
- Long description : An application to reply to Trustpilot reviews. This uses the Trustpilot APIs and allows replying from a Slack channel.

Once your app is created, go to "App Credentials" and grab your Client ID and Client Secret.

### Configuration

You should now have all the information to configure this app. Just clone this repo and edit the `node_modules/config.json` file. The contents should be as follows:

```
{
    "SLACK_CLIENT_ID" :
        "Paste_your_Slack_client_ID_here",
    "SLACK_SECRET" :
        "Paste_your_Slack_secret_here",
    "API_KEY" :
        "Paste_your_Trustpilot_API_key_here",
    "API_SECRET" :
        "Paste_your_Trustpilot_API_secret_here",
    "API_HOST" :
        "https://api.trustpilot.com",
    "BUSINESS_USER_NAME" :
        "Enter_your_Trustpilot_business_user_login_here",
    "BUSINESS_USER_PASS" :
        "Enter_your_Trustpilot_business_user_password_here",
    "BUSINESS_UNIT_ID" :
        "Enter_your_Trustpilot_business_unit_ID_here"
}
```

### Deploy this app somewhere

This is left as an [exercise to the reader](https://devcenter.heroku.com/articles/deploying-nodejs) :)

Once your app is deployed, the following endpoints should be reachable:

- `https://<your.app.url>/login`, where you will authorize your app for Slack
- `https://<your.app.url>/oauth`, where Slack will redirect after authorizing your app
- `https://<your.app.url>/slack/receive`, where Slack will send interactive messages.

### Configure your app in Slack

- In "App Credentials", the Redirect URI should point to the OAuth endpoint at the place where you deployed your app. This should look like `https://<your.app.url>/oauth`.
- In "Bot Users", make sure to add a bot.
- In "Interactive Messages", enable the feature and paste your receiving endpoint (which should look like `https://<your.app.url>/slack/receive`)

You should now be able to authorize your app by visiting the login endpoint at `https://<your.app.url>/login`


### Tests and development: running the app locally with localtunnel

If you don't want to deploy this app just yet, this repo comes with everything you need to run the code locally.

After running the obligatory `npm install`, start the app with Gulp:

```
gulp local
```

Wait for the localtunnel.me URL to appear in the log messages. This will allow Slack to bridge with your locally running app:

```
Tunnel started at http://[random].localtunnel.me
```

Follow the instructions in the "Configure your app in Slack" section above, using the localtunnel URL as your app's URL. **Important!** Change the protocol to https to make Slack happy :)

Finally, go to `http://localhost:3000/login`, or your localtunnel URL followed by `/login`, and authorize your app.
