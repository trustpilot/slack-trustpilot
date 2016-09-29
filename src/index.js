"use strict";

const _ = require("underscore");
const _S = require("underscore.string");
const moment = require("moment");
const bluebird = require("bluebird");
const path = require("path");

const config = require(path.resolve(__dirname, "../config.json"));
const SLACK_CLIENT_ID = config.SLACK_CLIENT_ID;
const SLACK_SECRET = config.SLACK_SECRET;
const VERIFICATION_TOKEN = config.VERIFICATION_TOKEN;
const MULTI_TEAM = config.MULTI_TEAM;
const ENABLE_LOCAL_TUNNEL = process.env.ENABLE_LOCAL_TUNNEL;
const PORT = process.env.PORT || 3000;

if (!SLACK_CLIENT_ID || !SLACK_SECRET) {
    console.log("Sorry, you need to give me this app's credentials. Please configure SLACK_CLIENT_ID and SLACK_SECRET in config.json");
    process.exit(-1);
}

var botkit = require("botkit");
var tokenRequest = require(path.resolve(__dirname, "./" + config.TOKEN_REQUEST_SOURCE))(config);
var trustpilot = require(path.resolve(__dirname, "./trustpilot.js"))(config, tokenRequest);
var businessUnitProvider = require(path.resolve(__dirname, "./business-unit-provider.js"))(config);

var controller = botkit.slackbot({
    // interactive_replies: true, // tells botkit to send button clicks into conversations
    debug: false
}).configureSlackApp({
    clientId: SLACK_CLIENT_ID,
    clientSecret: SLACK_SECRET,
    scopes: ["bot", "channels:history", "incoming-webhook"]
});

controller.on("tick", function() {});

// set up a botkit app to expose oauth and webhook endpoints
controller.setupWebserver(PORT, function(err, webserver) {
    controller.createWebhookEndpoints(controller.webserver);
    controller.createOauthEndpoints(controller.webserver, function(err, req, res) {
        if (err) {
            res.status(500).send("ERROR: " + err);
        } else {
            res.send("Success!");
        }
    });

    controller.webserver.get("/health-check", function(req, res) {
        res.sendStatus(200);
    });

    if (ENABLE_LOCAL_TUNNEL) {
        var tunnel = require(path.resolve(__dirname, "./tunnel.js"))(PORT);
    }
});


// just a simple way to make sure we don't
// connect to the RTM twice for the same team
var _bots = {};

function trackBot(bot) {
    _bots[bot.config.token] = bot;
}

controller.on("create_bot", function(bot, config) {
    if (_bots[bot.config.token]) {
        // already online! do nothing.
        return;
    }
    bluebird.promisifyAll(bot);

    bot.startRTMAsync().then(function() {
        trackBot(bot);
        bot.startPrivateConversationAsync({
            user: config.createdBy
        }).then(function(convo) {
            convo.say("I am a bot that has just joined your team");
            convo.say("You must now /invite me to a channel so that I can be of use!");
        });
    });
});


controller.hears([".*"], ["direct_message"], function(bot, message) {
    bot.reply(message, {
        text: "I need to be invited to a channel in order to work (my permissions on Slack are a bit silly that way). Use one of your existing channels or create a new one, it's up to you!"
    });
});

controller.hears(["[1-5] stars?"], ["direct_mention"], function(bot, message) {
    var nbStars = message.text.split(" ")[0];
    var slackTeamName = bot.team_info.domain;

    businessUnitProvider.getTeamBusinessUnitId(slackTeamName).then(function(businessUnitId) {
        trustpilot.getLastUnansweredReview(nbStars, businessUnitId).then(function(data) {
            var lastReview = data.reviews[0];
            if (lastReview) {
                bot.reply(message, formatReview(lastReview));
            }
        });
    });
});

controller.on("interactive_message_callback", function(bot, message) {
    if (message.token != config.VERIFICATION_TOKEN) return;
    switch (message.actions[0].value) {
        case "reply":
            askForReply(bot, message);
            break;
        case "send_reply":
            handleReply(bot, message);
            break;
    }
});

var _replyTrackers = {};

function trackReply(reviewId, message) {
    _replyTrackers[reviewId] = {
        reviewMessageTs: message.original_message.ts,
        start: message.message_ts
    };
}

function getReplyTracker(reviewId) {
    return _replyTrackers[reviewId];
}

function askForReply(bot, message) {
    var reviewId = message.original_message.attachments[0].callback_id;
    trackReply(reviewId, message);

    var replyStepMessage = message.original_message;
    replyStepMessage.text = "You are replying to";
    replyStepMessage.attachments[0].actions = null;
    bot.replyInteractive(message, replyStepMessage);

    bot.reply(message, {
        "text": "Please write your reply below this message, in as many lines as you need. Hit the \"Send reply\" button when you're done.",
        "attachments": [{
            "callback_id": reviewId,
            "attachment_type": "default",
            "text": "",
            "actions": [{
                "name": "send_reply",
                "text": ":postal_horn: Send reply",
                "value": "send_reply",
                "type": "button"
            }]
        }]
    });
}

function collectUserMessages(bot, user, channel, start, end) {
    bluebird.promisifyAll(bot.api.channels);

    return bot.api.channels.historyAsync({
        token: bot.config.incoming_webhook.token,
        channel: channel,
        oldest: start,
        latest: end,
        inclusive: 0
    }).then(function(data) {
        if (data && data.hasOwnProperty("messages")) {
            var fullText = data.messages.filter(function(message) {
                    return message.user === user;
                })
                .reverse()
                .map(function(message) {
                    return message.text;
                })
                .join("\n");
            return fullText;
        }
    });
}

function handleReply(bot, message) {
    var currentChannel = message.channel;
    var ts = message.original_message.ts;
    var reviewId = message.original_message.attachments[0].callback_id;
    var tracker = getReplyTracker(reviewId);
    if (!tracker) return;

    collectUserMessages(bot, message.user, currentChannel, tracker.start, message.action_ts).then(function(fullText) {
        if (fullText) {
            trustpilot.replyToReview(reviewId, fullText).then(function() {
                bot.api.chat.update({
                    ts: tracker.reviewMessageTs,
                    channel: currentChannel,
                    text: "You have replied to this review."
                });
                bot.api.chat.delete({
                    ts: ts,
                    channel: currentChannel
                });
                delete _replyTrackers[reviewId];
            });
        }
    });
}

function formatReview(review) {
    var stars = _S.repeat("★", review.stars) + _S.repeat("✩", 5 - review.stars);
    var reviewMoment = moment(review.createdAt);
    var color = (review.stars >= 4) ? "good" :
        (review.stars <= 2) ? "danger" : "warning";
    var link = review.links.filter(function(link) {
        return link.rel === "reviews";
    })[0].href;
    var author_link = review.consumer.links.filter(function(link) {
        return link.rel === "consumers";
    })[0].href;

    return {
        "text": "",
        "attachments": [{
            "callback_id": review.id,
            "attachment_type": "default",
            "fallback": "",
            "author_name": review.consumer.displayName,
            "author_link": author_link,
            "title": review.title,
            "title_link": link,
            "text": review.text,
            "color": color,
            "footer": stars,
            "ts": reviewMoment.format("X"),
            "actions": [{
                "name": "reply",
                "text": ":writing_hand: Reply",
                "value": "reply",
                "type": "button",
            }]
        }]
    };
}