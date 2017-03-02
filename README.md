# slack-trustpilot: reply to your Trustpilot reviews from Slack

This app enables anyone in your Slack team to reply to your latest reviews on Trustpilot, straight from a dedicated Slack channel.

Once deployed and authorized on your Slack domain, the app creates a bot user, which you will be able to "@mention" and ask e.g. for the latest "5 stars" review. The latest unanswered review with the given star rating will then be displayed, along with a "Reply" button. If you want to reply, the robot will create a thread where you can write your reply and send it. Don't worry! You can delete and edit messages as you please before pushing the "Send reply" button.

It's as easy as demonstrated by these screenshots!

![Setup] (https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/setup_and_invite.png)

![Ask] (https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/ask_for_review.png)

![Replying] (https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/replying.png)

![Done] (https://github.com/trustpilot/slack-trustpilot/blob/master/screenshots/done.png)

## How to set this up

### Trustpilot Credentials

Make sure you have valid credentials to access the Trustpilot API, i.e. your Business Unit ID, API Key and API Secret. You will also need the login and password for your Business user on Trustpilot.

### Slack App Credentials

You will have to **[create an app](https://api.slack.com/apps/new)** on your Slack domain. Once your app is created, go to "Basic Information" and grab your Client ID and Client Secret.

#### Verification token

You will also need to get a Verification token for Interactive Messages, to make sure that your app is receiving legitimate requests from Slack. In your app's configuration, go to the Interactive Messages section and turn on the feature. For the Request URL, just use `https://example.com/slack/receive` (yes, literally example.com), you will change this later. Once this setting is saved, go back to the Basic information section, where you should see your Verification token.

### Configuration

You should now have all the information to configure this app. Just clone this repo and edit the `config.js` file. The contents should be as follows:

```
module.exports = {
    "SLACK_CLIENT_ID" :
        process.env.SLACK_CLIENT_ID || "Paste_your_Slack_client_ID_here",
    "SLACK_SECRET" :
        process.env.SLACK_SECRET || "Paste_your_Slack_secret_here",
    "VERIFICATION_TOKEN" :
        process.env.VERIFICATION_TOKEN || "Paste_your_Slack_verification_token_here",
    "API_KEY" :
        process.env.API_KEY || "Paste_your_Trustpilot_API_key_here",
    "API_SECRET" :
        process.env.API_SECRET || "Paste_your_Trustpilot_API_secret_here",
    "API_HOST" :
        process.env.API_HOST || "https://api.trustpilot.com",
    "BUSINESS_USER_NAME" :
        process.env.BUSINESS_USER_NAME || "Enter_your_Trustpilot_business_user_login_here",
    "BUSINESS_USER_PASS" :
        process.env.BUSINESS_USER_PASS || "Enter_your_Trustpilot_business_user_password_here",
    "BUSINESS_UNIT_ID" :
        process.env.BUSINESS_UNIT_ID || "Enter_your_Trustpilot_business_unit_ID_here"
};
```
As you can see, it's also possible to define all your configuration as environment variables, if you prefer this.

### Deploy this app somewhere

This is left as an [exercise to the reader](https://devcenter.heroku.com/articles/deploying-nodejs) :)

Once your app is deployed, the following endpoints should be reachable:

- `https://<your.app.url>/login`, where you will authorize your app for Slack
- `https://<your.app.url>/oauth`, where Slack will redirect after authorizing your app
- `https://<your.app.url>/slack/receive`, where Slack will send interactive messages.

### Configure your app in Slack

- In "App Credentials", the Redirect URI should point to the OAuth endpoint at the place where you deployed your app. This should look like `https://<your.app.url>/oauth`.
- In "Bot Users", make sure to add a bot. Call it something nice, like `trustpilot` ;)
- In "Interactive Messages", paste your receiving endpoint (which should look like `https://<your.app.url>/slack/receive`)

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

Finally, go to `http://localhost:7142/login`, or your localtunnel URL followed by `/login`, and authorize your app.
