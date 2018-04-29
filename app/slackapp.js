const botkit = require('botkit');
const bluebird = require('bluebird');
const { composeReviewMessage } = require('./review-message');
const { fillInInteractiveMessage, makeInteractiveMessage } = require('./interactive-message');

function setupApp(slackapp, config, trustpilotApi) {
  /*
    Startup
  */

  slackapp.configureSlackApp({
    clientId: config.SLACK_CLIENT_ID,
    clientSecret: config.SLACK_SECRET,
    rtm_receive_messages: false, // eslint-disable-line camelcase
    scopes: ['bot', 'incoming-webhook', 'commands'],
  });

  slackapp.on('tick', () => {});

  slackapp.on('create_bot', async (bot, config) => {
    // We're not using the RTM API so we need to tell Botkit to start processing conversations
    slackapp.startTicking();
    bot.startPrivateConversationAsync = bluebird.promisify(bot.startPrivateConversation);

    const convo = await bot.startPrivateConversationAsync({
      user: config.createdBy,
    });
    convo.say('I am a bot that has just joined your team');
    convo.say('You must now /invite me to a channel so that I can be of use!');
  });

  /*
    Internal workings
  */
  const getTeamFeeds = (team) => team.feeds || [{ channelId: team.incoming_webhook.channel_id, canReply: true }];

  const getChannelFeedSettings = (team, targetChannelId) => {
    const feeds = getTeamFeeds(team);
    const channelSettings = feeds.find(({ channelId }) => channelId === targetChannelId);
    const { canReply = false } = { ...channelSettings };
    return { canReply };
  };

  const handleReviewQuery = async (bot, sourceMessage) => {
    let stars = Number(sourceMessage.text.split(' ')[0]);
    stars = isNaN(stars) ? null : stars;
    const team = bot.team_info;
    const businessUnitId = team.businessUnitId;
    const { canReply } = getChannelFeedSettings(team, sourceMessage.channel);

    const lastReview = await trustpilotApi.getLastUnansweredReview({
      stars,
      businessUnitId,
    });

    if (lastReview) {
      bot.replyAsync = bot.replyAsync || bluebird.promisify(bot.reply);
      bot.replyAsync(
        sourceMessage,
        composeReviewMessage(lastReview, {
        canReply,
        })
      );
      return true;
    }
  };

  function askForReply(bot, message) {
    const dialog = bot
      .createDialog(
        'Reply to a review',
        JSON.stringify({
      dialogType: 'review_reply',
      originalTs: message.message_ts,
      reviewId: message.callback_id,
        }),
        'Send'
      )
      .addTextarea('Your reply', 'reply');

    bot.replyWithDialog(message, dialog.asObject(), (err, res) => {
      if (err) {
        console.log(err, res);
      }
    });
  }

  const handleReply = async (bot, message) => {
    const { originalTs, reviewId } = JSON.parse(message.callback_id);
    const errorReaction = {
      timestamp: originalTs,
      channel: message.channel,
      name: 'boom',
    };

    try {
      await trustpilotApi.replyToReview({
        reviewId,
        message: message.submission.reply,
      });
      bot.say(
        fillInInteractiveMessage({
          thread_ts: originalTs, // eslint-disable-line camelcase
        channel: message.channel,
          attachments: [
            {
              author_name: message.raw_message.user.name, // eslint-disable-line camelcase
              text: message.submission.reply,
              ts: message.action_ts,
            },
          ],
        })
      );
      bot.api.reactions.remove(errorReaction);
    } catch (e) {
      bot.whisper(message, 'Something went wrong while sending your reply! Please try again shortly.');
      bot.api.reactions.add(errorReaction);
    }
  };

  /*
    Entry points
  */

  slackapp.on('slash_command', async (bot, message) => {
    bot.replyAcknowledge();
    if (/^[1-5] stars?$/i.test(message.text) || /^la(te)?st$/i.test(message.text)) {
      return handleReviewQuery(bot, message);
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
    bot.dialogOk();
    const { dialogType } = JSON.parse(message.callback_id);
    if (dialogType === 'review_reply') {
      return handleReply(bot, message);
    } else {
      return true;
    }
  });

  /*
    Incoming webhook plumbing
  */

  slackapp.postNewReview = async (review, teamId) => {
    slackapp.findTeamByIdAsync = slackapp.findTeamByIdAsync || bluebird.promisify(slackapp.findTeamById);
    const team = await slackapp.findTeamByIdAsync(teamId);
    const bot = slackapp.spawn(team);
    bot.team_info = team; // eslint-disable-line camelcase
    bot.sendAsync = bot.sendAsync || bluebird.promisify(bot.send);
    const feeds = getTeamFeeds(team);

    feeds.forEach(async ({ channelId, canReply }) => {
      const message = composeReviewMessage(review, { canReply });
      message.username = bot.config.bot.name; // Confusing, but such is life
      message.channel = channelId;
      try {
        const { ok: sentOk, ts, channel } = await bot.sendAsync(message);
        if (sentOk) {
          slackapp.trigger('trustpilot_review_posted', [bot, { ts, channel, reviewId: review.id }]);
        }
      } catch (e) {
        if (e.message === 'account_inactive') {
          // Integration removed, just do a bit of clean up.
          team.feeds = [];
          slackapp.storage.teams.save(team);
        }
        slackapp.log.error(e);
      }
    });
  };
}

module.exports = function (config, trustpilotApi, storage) {
  // Fallback to jfs when no storage middleware provided
  const slackapp = botkit.slackbot({
    debug: false,
    storage: storage,
    json_file_store: './storage/', // eslint-disable-line camelcase
    retry: 2,
  });
  setupApp(slackapp, config, trustpilotApi);
  return slackapp;
};
