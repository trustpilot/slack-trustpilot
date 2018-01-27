'use strict';

const botkit = require('botkit');
const _S = require('underscore.string');
const moment = require('moment');
const bluebird = require('bluebird');

function setupApp(slackapp, config, trustpilotApi) {

  /*
    Startup
  */

  slackapp.configureSlackApp({
    clientId: config.SLACK_CLIENT_ID,
    clientSecret: config.SLACK_SECRET,
    'rtm_receive_messages': false,
    scopes: ['bot', 'incoming-webhook', 'commands'],
  });

  slackapp.on('tick', () => {});

  slackapp.on('create_bot', async (bot, config) => {
    // We're not using the RTM API so we need to tell Botkit to start processing conversations
    slackapp.startTicking();
    bluebird.promisifyAll(bot);

    const convo = await bot.startPrivateConversationAsync({
      user: config.createdBy,
    });
    convo.say('I am a bot that has just joined your team');
    convo.say('You must now /invite me to a channel so that I can be of use!');
  });

  /*
    Internal workings
  */

  function formatReview(review) {
    const stars = _S.repeat('★', review.stars) + _S.repeat('✩', 5 - review.stars);
    const reviewMoment = moment(review.createdAt);
    const color = (review.stars >= 4) ? 'good' : (review.stars <= 2) ? 'danger' : 'warning';

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
          'type': 'button',
        }],
      }],
    };
  }

  function askForReply(bot, message) {
    const originalTs = message.original_message.ts;
    const reviewId = message.original_message.attachments[0].callback_id;
    const dialog = bot.createDialog('Reply to a review', JSON.stringify({
      originalTs,
      reviewId,
    }), 'Send')
      .addTextarea('Your reply', 'reply');

    bot.replyWithDialog(message, dialog.asObject(), (err, res) => {
      if (err) {
        console.log(err, res);
      }
    });
  }

  async function handleReply(bot, message) {
    const callbackData = JSON.parse(message.callback_id);
    const originalTs = callbackData.originalTs;
    const reviewId = callbackData.reviewId;
    const errorReaction = {
      timestamp: originalTs,
      channel: message.channel.id,
      name: 'boom',
    };

    try {
      await trustpilotApi.replyToReview({
        reviewId,
        message: message.submission.reply,
      });
      bot.say({
        'thread_ts': originalTs,
        channel: message.channel.id,
        text: '',
        attachments: [{
          'attachment_type': 'default',
          'fallback': '',
          'author_name': message.user.name,
          'text': message.submission.reply,
          'ts': message.action_ts,
        }],
      });
      bot.api.reactions.remove(errorReaction);
    } catch (e) {
      bot.sendEphemeral({
        user: message.user.id,
        channel: message.channel.id,
        text: 'Something went wrong while sending your reply! Please try again shortly.',
      });
      bot.api.reactions.add(errorReaction);
    }
  }

  /*
    Entry points
  */

  slackapp.on('slash_command', async (bot, message) => {
    bot.replyAcknowledge();
    if (/^[1-5] stars?$/i.test(message.text) || /^la(te)?st$/i.test(message.text)) {
      let stars = Number(message.text.split(' ')[0]);
      stars = isNaN(stars) ? null : stars;
      const businessUnitId = bot.team_info.businessUnitId;

      const lastReview = await trustpilotApi.getLastUnansweredReview({
        stars,
        businessUnitId,
      });
      if (lastReview) {
        bot.reply(message, formatReview(lastReview));
      }
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
        const bot = slackapp.spawn(team);
        const message = formatReview(review);
        message.username = bot.config.bot.name; // Confusing, but such is life
        message.channel = bot.config.incoming_webhook.channel;
        bot.send(message);
      }
    });
  };
}

module.exports = function (config, trustpilotApi, storage) {
  const slackapp = botkit.slackbot({
    'debug': false,
    'storage': storage,
    'json_file_store': './storage/', // Fallback to jfs when no storage middleware provided
    'retry': 2,
  });
  setupApp(slackapp, config, trustpilotApi);
  return slackapp;
};
