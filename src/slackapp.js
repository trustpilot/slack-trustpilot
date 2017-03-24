'use strict';

const botkit = require('botkit');
const _ = require('underscore');
const _S = require('underscore.string');
const moment = require('moment');
const bluebird = require('bluebird');

function setupApp(slackapp, config, businessUnitProvider, trustpilot) {

  /*
    Startup
  */

  slackapp.configureSlackApp({
    clientId: config.SLACK_CLIENT_ID,
    clientSecret: config.SLACK_SECRET,
    scopes: ['bot', 'channels:history', 'incoming-webhook']
  });

  slackapp.on('tick', () => {});

  // just a simple way to make sure we don't
  // connect to the RTM twice for the same team
  var _bots = {};

  function trackBot(bot) {
    _bots[bot.config.token] = bot;
  }

  slackapp.on('create_bot', (bot, config) => {
    if (_bots[bot.config.token]) {
      // already online! do nothing.
      return;
    }
    bluebird.promisifyAll(bot);

    bot.startRTMAsync().then(() => {
      trackBot(bot);
      console.info(`Use /incoming-webhooks/${bot.team_info.id} to receive new reviews.`);

      bot.startPrivateConversationAsync({
        user: config.createdBy
      }).then((convo) => {
        convo.say('I am a bot that has just joined your team');
        convo.say('You must now /invite me to a channel so that I can be of use!');
      });
    });
  });

  /*
    Internal workings
  */

  function formatReview(review) {
    var stars = _S.repeat('★', review.stars) + _S.repeat('✩', 5 - review.stars);
    var reviewMoment = moment(review.createdAt);
    var color = (review.stars >= 4) ? 'good' : (review.stars <= 2) ? 'danger' : 'warning';

    return {
      'text': '',
      'attachments': [{
        'callback_id': review.id,
        'attachment_type': 'default',
        'fallback': '',
        'author_name': review.consumer.displayName,
        'title': review.title,
        'text': review.text,
        'color': color,
        'footer': stars,
        'ts': reviewMoment.format('X'),
        'actions': [{
          'name': 'step_1_write_reply',
          'text': ':writing_hand: Reply',
          'value': 'step_1_write_reply',
          'type': 'button'
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
    replyStepMessage.text = 'You are replying to';
    replyStepMessage.attachments[0].actions = null;
    bot.replyInteractive(message, replyStepMessage);

    bot.replyInThread(replyStepMessage, {
      'text': `Please write your reply in this thread, in as many lines as you need. Hit the "Send reply" button
 when you're done.`,
      'attachments': [{
        'callback_id': reviewId,
        'attachment_type': 'default',
        'text': '',
        'actions': [{
          'name': 'step_2_send_reply',
          'text': ':postal_horn: Send reply',
          'value': 'step_2_send_reply',
          'type': 'button'
        }]
      }]
    });
  }

  function collectUserMessages(bot, user, channel, threadTs) {
    bluebird.promisifyAll(bot.api.channels);

    return bot.api.channels.repliesAsync({
      'token': bot.config.incoming_webhook.token,
      'channel': channel,
      'thread_ts': threadTs
    }).then((data) => {
      if (data && data.hasOwnProperty('messages')) {
        var fullText = data.messages.filter((message) => {
          return message.user === user;
        })
        .map((message) => {
          return message.text;
        })
        .join('\n');
        return fullText;
      }
      return null;
    });
  }

  function handleReply(bot, message) {
    var currentChannel = message.channel;
    var ts = message.original_message.ts;
    var reviewId = message.original_message.attachments[0].callback_id;
    var tracker = getReplyTracker(reviewId);
    if (!tracker) {
      return;
    }

    collectUserMessages(bot, message.user, currentChannel, tracker.reviewMessageTs).then((fullText) => {
      if (fullText) {
        trustpilot.replyToReview(reviewId, fullText).then(() => {
          bot.api.chat.update({
            ts: tracker.reviewMessageTs,
            channel: currentChannel,
            text: 'You have replied to this review.'
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

  /*
    Entry points
  */

  slackapp.hears(['.*'], ['direct_message'], (bot, message) => {
    bot.reply(message, {
      text: `I need to be invited to a channel in order to work (my permissions on Slack are a bit silly that way).
 Use one of your existing channels or create a new one, it's up to you!`
    });
  });

  slackapp.hears(['[1-5] stars?', 'la(te)?st'], ['direct_mention'], (bot, message) => {
    if (message.thread_ts) {
      bot.reply(message, {
        text: 'Looks like we\'re in a thread? I\'m confused! I can handle your request if you ask me in a channel.'
      });
      return;
    }
    var nbStars = Number(message.text.split(' ')[0]);
    nbStars = isNaN(nbStars) ? null : nbStars;
    var slackTeamId = bot.team_info.id;

    businessUnitProvider.getTeamBusinessUnitId(slackTeamId).then(function (businessUnitId) {
      trustpilot.getLastUnansweredReview(nbStars, businessUnitId).then(function (lastReview) {
        if (lastReview) {
          bot.reply(message, formatReview(lastReview));
        }
      });
    });
  });

  slackapp.on('interactive_message_callback', (bot, message) => {
    if (message.token !== config.VERIFICATION_TOKEN) {
      return;
    }
    switch (message.actions[0].value) {
      case 'step_1_write_reply':
        askForReply(bot, message);
        break;
      case 'step_2_send_reply':
        handleReply(bot, message);
        break;
    }
  });

  /*
    Incoming webhook plumbing
  */

  slackapp.findBot = function (teamId) {
    return _.find(_bots, (bot) => {
      return bot.team_info.id === teamId;
    });
  };

  slackapp.postNewReview = function (review, teamId) {
    var bot = slackapp.findBot(teamId);
    if (bot) {
      var message = formatReview(review);
      message.username = bot.config.bot.name; // Confusing, but such is life
      message.channel = bot.config.incoming_webhook.channel;
      bot.send(message);
    }
  };
}

module.exports = function (config, businessUnitProvider, trustpilot) {
  var slackapp = botkit.slackbot({
    debug: false,
    retry: 2
  });
  setupApp(slackapp, config, businessUnitProvider, trustpilot);
  return slackapp;
};
