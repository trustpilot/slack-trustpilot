/*
    Trustpilot Review Slackbot
*/
const config = require('config.json');
const SLACK_CLIENT_ID = config['SLACK_CLIENT_ID'];
const SLACK_SECRET = config['SLACK_SECRET'];
const ENABLE_LOCAL_TUNNEL = process.env.ENABLE_LOCAL_TUNNEL;
const PORT = process.env.PORT || 3000;

if (!SLACK_CLIENT_ID || !SLACK_SECRET) {
    console.log("Sorry, you need to give me this app's credentials. Please configure SLACK_CLIENT_ID and SLACK_SECRET in config.json");
    process.exit(-1);
}

var localtunnel = null;
if (ENABLE_LOCAL_TUNNEL) {
    try {
        localtunnel = require('localtunnel');
    } catch(e) {}
}


var Botkit = require('botkit');
var apiBridge = require('./trustpilot.js');
var _ = require('underscore');
var _S = require('underscore.string');
var moment = require('moment');

var controller = Botkit.slackbot({
    // interactive_replies: true, // tells botkit to send button clicks into conversations
    debug: false,
}).configureSlackApp({
    clientId: SLACK_CLIENT_ID,
    clientSecret: SLACK_SECRET,
    scopes: ['bot', 'channels:history', 'incoming-webhook']
});

controller.on('tick', function() {});

// set up a botkit app to expose oauth and webhook endpoints
controller.setupWebserver(PORT,function(err,webserver) {
  controller.createWebhookEndpoints(controller.webserver);
  controller.createOauthEndpoints(controller.webserver,function(err,req,res) {
    if (err) {
      res.status(500).send('ERROR: ' + err);
    } else {
      res.send('Success!');
    }
  });

  if (localtunnel) {
    localtunnel(PORT, function(err, tunnel) {
        if (err) {
            console.log("Couldn't start localtunnel");
            return;
        }
        console.log("Tunnel started at", tunnel.url);
    });
  }
});


// just a simple way to make sure we don't
// connect to the RTM twice for the same team
var _bots = {};
function trackBot(bot) {
  _bots[bot.config.token] = bot;
}

controller.on('create_bot',function(bot,config) {
  if (_bots[bot.config.token]) {
    // already online! do nothing.
  } else {
    bot.startRTM(function(err) {

      if (!err) {
        trackBot(bot);
      }

      bot.startPrivateConversation({user: config.createdBy},function(err,convo) {
        if (err) {
          console.log(err);
        } else {
          convo.say('I am a bot that has just joined your team');
          convo.say('You must now /invite me to a channel so that I can be of use!');
        }
      });

    });
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

controller.on('interactive_message_callback', function(bot, message) {
    switch (message.actions[0].value) {
        case 'reply':
            var replyStepMessage = message.original_message;
            replyStepMessage.text = "You are replying to"
            replyStepMessage.attachments[0].actions = null;
            bot.replyInteractive(message, replyStepMessage);
            askForReply(bot, message);
            break;
        case 'send_reply':
            handleReply(bot, message);
            break;
    }
});

function askForReply(bot, message) {
    var original = message.original_message;
    var attachments = original.attachments;
    var reviewId = attachments[0].callback_id;
    trackReply(reviewId, message);
    bot.reply(message, {
        "text": "Please write your reply below this message, in as many lines as you need. Hit the \"Send reply\" button when you're done.",
        "attachments": [{
            "callback_id": reviewId,
            "attachment_type": "default",
            "text": "",
            "actions": [
                {
                    "name": "send_reply",
                    "text": ":postal_horn: Send reply",
                    "value": "send_reply",
                    "type": "button"
                }
            ]
        }]
    });
}

function handleReply(bot, message) {
    var user = message.user;
    var channel = message.channel;
    var original = message.original_message;
    var attachments = original.attachments;
    var ts = original.ts;
    var reviewId = original.attachments[0].callback_id;
    var tracker = getReplyTracker(reviewId);
    if (!tracker) return;
    bot.api.channels.history({
        token : bot.config.incoming_webhook.token,
        channel : channel,
        latest : message.action_ts,
        oldest : tracker.start,
        inclusive : 0
    }, function(err, data) {
        if (!err && data && data.hasOwnProperty('messages')) {
            var fullText = data.messages.filter(function(message) { return message.user === user })
                                        .reverse()
                                        .map(function(message) { return message.text })
                                        .join("\n");
            if (fullText) {
                apiBridge.replyToReview(reviewId, fullText)
                .then(function() {
                    bot.api.chat.update({ts:tracker.reviewMessageTs, channel:channel, text:"You have replied to this review."}, function() {});
                    bot.api.chat.delete({ts:ts, channel:channel}, function() {});
                });
            }
        }
    });
    delete _replyTrackers[reviewId];
}

function formatReview(review) {
    var stars = _S.repeat("★", review.stars) + _S.repeat("✩", 5 - review.stars);
    var reviewMoment = moment(review.createdAt);
    var color = (review.stars >= 4) ? "good"
                : (review.stars <= 2) ? "danger" : "warning";
    var link = review.links.filter(function(link) {
        return link.rel === 'reviews';
    })[0].href;
    var author_link = review.consumer.links.filter(function(link) {
        return link.rel = "consumers"
    })[0].href;

    return {
        "text": "",
        "attachments": [
            {
                "callback_id": review.id,
                "attachment_type": 'default',
                "fallback": "",
                "author_name": review.consumer.displayName,
                "author_link": author_link,
                "title": review.title,
                "title_link": link,
                "text": review.text,
                "color": color,
                "footer": stars,
                "ts": reviewMoment.format("X"),
                "actions": [
                    {
                        "name":"reply",
                        "text": ":writing_hand: Reply",
                        "value": "reply",
                        "type": "button",
                    }
                ]
            }
        ]
    };
}

controller.hears(["[1-5] stars?"],["direct_message","direct_mention"],function(bot, message) {
    var nbStars = message.text.split(" ")[0];
    apiBridge.getLastUnansweredReview(nbStars).then(function(d) {
        var lastReview = d.reviews[0];
        if (lastReview) {
            bot.reply(message, formatReview(lastReview));
        }
    });
});
