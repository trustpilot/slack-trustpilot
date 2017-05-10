'use strict';

const botkit = require('botkit');
const _S = require('underscore.string');
const moment = require('moment');
const bluebird = require('bluebird');

function setupApp(slackapp, config, businessUnitProvider, trustpilotApi) {

  /*
    Startup
  */

  slackapp.configureSlackApp({
    clientId: config.SLACK_CLIENT_ID,
    clientSecret: config.SLACK_SECRET,
    'rtm_receive_messages': false,
    scopes: ['bot', 'channels:history', 'incoming-webhook', 'commands']
  });

  slackapp.on('tick', () => {});

  slackapp.on('create_bot', (bot, config) => {
    // We're not using the RTM API so we need to tell Botkit to start processing conversations
    slackapp.startTicking();
    bluebird.promisifyAll(bot);

    bot.startPrivateConversationAsync({
      user: config.createdBy
    }).then((convo) => {
      convo.say('I am a bot that has just joined your team');
      convo.say('You must now /invite me to a channel so that I can be of use!');
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

  function askForReply(bot, message) {
    var reviewId = message.original_message.attachments[0].callback_id;
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
    var threadTs = message.original_message.thread_ts;
    var reviewId = message.original_message.attachments[0].callback_id;

    collectUserMessages(bot, message.user, currentChannel, threadTs).then((fullText) => {
      if (fullText) {
        trustpilotApi.replyToReview(reviewId, fullText).then(() => {
          bot.api.chat.update({
            ts: threadTs,
            channel: currentChannel,
            text: 'You have replied to this review.'
          });
          bot.api.chat.delete({
            ts: ts,
            channel: currentChannel
          });
        });
      }
    });
  }

  /*
    Entry points
  */

  slackapp.on('slash_command', (bot, message) => {
    if (message.token !== config.VERIFICATION_TOKEN) {
      return;
    }
    bot.replyAcknowledge(() => {
      if (/^[1-5] stars?$/i.test(message.text) || /^la(te)?st$/i.test(message.text)) {
        var nbStars = Number(message.text.split(' ')[0]);
        nbStars = isNaN(nbStars) ? null : nbStars;
        var slackTeamId = bot.team_info.id;

        businessUnitProvider.getTeamBusinessUnitId(slackTeamId).then(function (businessUnitId) {
          trustpilotApi.getLastUnansweredReview(nbStars, businessUnitId).then(function (lastReview) {
            if (lastReview) {
              bot.reply(message, formatReview(lastReview));
            }
          });
        });
      }
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

  slackapp.postNewReview = function (review, teamId) {
    slackapp.findTeamById(teamId, (err, team) => {
      if (!err && team) {
        var bot = slackapp.spawn(team);
        var message = formatReview(review);
        message.username = bot.config.bot.name; // Confusing, but such is life
        message.channel = bot.config.incoming_webhook.channel;
        bot.send(message);
      }
    });
  };
}

module.exports = function (config, businessUnitProvider, trustpilotApi, storage) {
  var slackapp = botkit.slackbot({
    'debug': false,
    'storage': storage,
    'json_file_store': './storage/', // Fallback to jfs when no storage middleware provided
    'retry': 2
  });
  setupApp(slackapp, config, businessUnitProvider, trustpilotApi);
  return slackapp;
};
