"use strict";

const botkit = require("botkit");
const _ = require("underscore");
const _S = require("underscore.string");
const moment = require("moment");
const bluebird = require("bluebird");

module.exports = function(config, businessUnitProvider, trustpilot) {
    var slackapp = botkit.slackbot({
        // interactive_replies: true, // tells botkit to send button clicks into conversations
        debug: false
    });
    setupApp(slackapp, config, businessUnitProvider, trustpilot);
    return slackapp;
};

function setupApp(slackapp, config, businessUnitProvider, trustpilot) {

    /*
        Startup
    */

    slackapp.configureSlackApp({
        clientId: config.SLACK_CLIENT_ID,
        clientSecret: config.SLACK_SECRET,
        scopes: ["bot", "channels:history", "incoming-webhook"]
    });

    slackapp.on("tick", function () {});

    // just a simple way to make sure we don't
    // connect to the RTM twice for the same team
    var _bots = {};

    function trackBot(bot) {
        _bots[bot.config.token] = bot;
    }

    slackapp.on("create_bot", function (bot, config) {
        if (_bots[bot.config.token]) {
            // already online! do nothing.
            return;
        }
        bluebird.promisifyAll(bot);

        bot.startRTMAsync().then(function () {
            trackBot(bot);
            bot.startPrivateConversationAsync({
                user: config.createdBy
            }).then(function (convo) {
                convo.say("I am a bot that has just joined your team");
                convo.say("You must now /invite me to a channel so that I can be of use!");
            });
        });
    });


    /*
        Entry points
    */

    slackapp.hears([".*"], ["direct_message"], function (bot, message) {
        bot.reply(message, {
            text: "I need to be invited to a channel in order to work (my permissions on Slack are a bit silly that way). Use one of your existing channels or create a new one, it's up to you!"
        });
    });

    slackapp.hears(["[1-5] stars?"], ["direct_mention"], function (bot, message) {
        var nbStars = message.text.split(" ")[0];
        var slackTeamName = bot.team_info.domain;

        businessUnitProvider.getTeamBusinessUnitId(slackTeamName).then(function (businessUnitId) {
            trustpilot.getLastUnansweredReview(nbStars, businessUnitId).then(function (data) {
                var lastReview = data.reviews[0];
                if (lastReview) {
                    bot.reply(message, formatReview(lastReview));
                }
            });
        });
    });

    slackapp.on("interactive_message_callback", function (bot, message) {
        if (message.token != config.VERIFICATION_TOKEN) return;
        switch (message.actions[0].value) {
            case "step_1_write_reply":
                askForReply(bot, message);
                break;
            case "step_2_send_reply":
                handleReply(bot, message);
                break;
        }
    });


    /*
        Internal workings
    */

    function formatReview(review) {
        var stars = _S.repeat("★", review.stars) + _S.repeat("✩", 5 - review.stars);
        var reviewMoment = moment(review.createdAt);
        var color = (review.stars >= 4) ? "good" :
            (review.stars <= 2) ? "danger" : "warning";
        var link = review.links.filter(function (link) {
            return link.rel === "reviews";
        })[0].href;
        var author_link = review.consumer.links.filter(function (link) {
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
                    "name": "step_1_write_reply",
                    "text": ":writing_hand: Reply",
                    "value": "step_1_write_reply",
                    "type": "button",
                }]
            }]
        };
    }

    var _replyTrackers = {};

    function trackReply(reviewId, message) {
        _replyTrackers[reviewId] = {
            reviewMessageTs: message.original_message.ts,
            start: message.action_ts
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
                    "name": "step_2_send_reply",
                    "text": ":postal_horn: Send reply",
                    "value": "step_2_send_reply",
                    "type": "button"
                }]
            }]
        });
    }

    function handleReply(bot, message) {
        var currentChannel = message.channel;
        var ts = message.original_message.ts;
        var reviewId = message.original_message.attachments[0].callback_id;
        var tracker = getReplyTracker(reviewId);
        if (!tracker) return;

        collectUserMessages(bot, message.user, currentChannel, tracker.start, message.action_ts).then(function (fullText) {
            if (fullText) {
                trustpilot.replyToReview(reviewId, fullText).then(function () {
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

    function collectUserMessages(bot, user, channel, start, end) {
        bluebird.promisifyAll(bot.api.channels);

        return bot.api.channels.historyAsync({
            token: bot.config.incoming_webhook.token,
            channel: channel,
            oldest: start,
            latest: end,
            inclusive: 0
        }).then(function (data) {
            if (data && data.hasOwnProperty("messages")) {
                var fullText = data.messages.filter(function (message) {
                        return message.user === user;
                    })
                    .reverse()
                    .map(function (message) {
                        return message.text;
                    })
                    .join("\n");
                return fullText;
            }
        });
    }
}
