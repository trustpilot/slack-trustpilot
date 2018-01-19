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
    scopes: ['bot', 'incoming-webhook', 'commands']
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
    var originalTs = message.original_message.ts;
    var reviewId = message.original_message.attachments[0].callback_id;
    var dialog = bot.createDialog('Reply to a review', JSON.stringify({originalTs, reviewId}), 'Send')
      .addTextarea('Your reply', 'reply');

    bot.replyWithDialog(message, dialog.asObject(), (err, res) => {
      if (err) {
        console.log(err, res);
      }
    });
  }

  function handleReply(bot, message) {
    var callbackData = JSON.parse(message.callback_id);
    var originalTs = callbackData.originalTs;
    var reviewId = callbackData.reviewId;
    var errorReaction = {
      timestamp: originalTs,
      channel: message.channel.id,
      name: 'boom'
    };

    trustpilotApi.replyToReview({
      reviewId,
      message: message.submission.reply
    }).then(() => {
        bot.say({
          'thread_ts': originalTs,
        channel: message.channel.id,
          text: '',
          attachments: [{
            'attachment_type': 'default',
            'fallback': '',
          'author_name': message.user.name,
            'text': message.submission.reply,
            'ts': message.action_ts
          }]
        });
        bot.api.reactions.remove(errorReaction);
    }).catch(() => {
      bot.sendEphemeral({
        user: message.user.id,
        channel: message.channel.id,
        text: 'Something went wrong while sending your reply! Please try again shortly.'
      });
      bot.api.reactions.add(errorReaction);
    });
  }

  /*
    Entry points
  */

  slackapp.on('slash_command', (bot, message) => {
    bot.replyAcknowledge();
      if (/^[1-5] stars?$/i.test(message.text) || /^la(te)?st$/i.test(message.text)) {
        var stars = Number(message.text.split(' ')[0]);
        stars = isNaN(stars) ? null : stars;
        var slackTeamId = bot.team_info.id;

        businessUnitProvider.getTeamBusinessUnitId(slackTeamId).then(function (businessUnitId) {
          trustpilotApi.getLastUnansweredReview({stars, businessUnitId}).then(function (lastReview) {
            if (lastReview) {
              bot.reply(message, formatReview(lastReview));
            }
          });
        });
      }
    return true;
  });

  slackapp.on('interactive_message_callback', (bot, message) => {
    bot.replyAcknowledge();
    if (message.actions[0].value === 'step_1_write_reply') {
      askForReply(bot, message);
    }
    return true;
  });

  slackapp.on('dialog_submission', (bot, message) => {
    // Tell Slack right away that the dialog can be dismissed
    bot.dialogOk();
    handleReply(bot, message.raw_message);
    return true;
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
