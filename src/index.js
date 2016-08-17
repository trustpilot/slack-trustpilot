"use strict";
/*
    Entry point of this app, sets us up and running from config and env variables
*/

const path = require("path");
const config = require(path.resolve(__dirname, "../config.js"));

if (!config.SLACK_CLIENT_ID || !config.SLACK_SECRET) {
    console.log("Sorry, you need to give me this app's credentials. Please configure SLACK_CLIENT_ID and SLACK_SECRET in config.js");
    process.exit(-1);
}

// Allows dependency injection (injected modules need to be in the same directory as this source)
const TOKEN_REQUEST_SOURCE = process.env.TOKEN_REQUEST_SOURCE || "business-user-token-request.js";
const BUSINESS_UNIT_PROVIDER_SOURCE = process.env.BUSINESS_UNIT_PROVIDER_SOURCE || "business-unit-provider.js";

const ENABLE_LOCAL_TUNNEL = process.env.ENABLE_LOCAL_TUNNEL;
const PORT = process.env.PORT || 7142;

var tokenRequest = require(path.resolve(__dirname, "./" + TOKEN_REQUEST_SOURCE))(config);
var businessUnitProvider = require(path.resolve(__dirname, "./" + BUSINESS_UNIT_PROVIDER_SOURCE))(config);
var trustpilot = require(path.resolve(__dirname, "./trustpilot.js"))(config, tokenRequest);
var slackapp = require(path.resolve(__dirname, "./slackapp.js"))(config, businessUnitProvider, trustpilot);

// Set up a web server to expose oauth and webhook endpoints
slackapp.setupWebserver(PORT, function (err, webserver) {
    slackapp.createWebhookEndpoints(slackapp.webserver);
    slackapp.createOauthEndpoints(slackapp.webserver, function (err, req, res) {
        if (err) {
            res.status(500).send("ERROR: " + err);
        } else {
            res.send("Success!");
        }
    });

    // For AWS
    slackapp.webserver.get("/health-check", function (req, res) {
        res.sendStatus(200);
    });

    if (ENABLE_LOCAL_TUNNEL) {
        var tunnel = require(path.resolve(__dirname, "./tunnel.js"))(PORT);
    }
});