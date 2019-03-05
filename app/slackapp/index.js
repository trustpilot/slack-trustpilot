const botkit = require('botkit');
const { promisify } = require('util');
const { composeReviewMessage } = require('./lib/review-message');
const reviewReply = require('./review-reply');
const feedSettingsLib = require('./feed-settings');

const setupAppHandlers = (slackapp, apiClient, enableReviewQueries) => {
  const feedSettings = feedSettingsLib(apiClient);

  const slashCommandType = (text) => {
    if (/^[1-5] stars?$/i.test(text) || /^la(te)?st$/i.test(text)) {
      return 'review_query';
    } else if (text === 'settings' || text === 'feed') {
      return 'feed_settings';
    } else if (text === 'test') {
      return 'test_feeds';
    } else {
      return null;
    }
  };

  const handleReviewQuery = async (bot, sourceMessage) => {
    let stars = Number(sourceMessage.text.split(' ')[0]);
    stars = isNaN(stars) ? null : stars;
    const team = bot.team_info;
    const businessUnitId = team.businessUnits[0];
    const { canReply } = feedSettings.getChannelFeedSettingsOrDefault(team, sourceMessage.channel);

    const lastReview = await apiClient.getLastUnansweredReview({
      stars,
      businessUnitId,
    });

    bot.replyPrivateDelayedAsync =
      bot.replyPrivateDelayedAsync || promisify(bot.replyPrivateDelayed);
    if (lastReview) {
      await bot.replyPrivateDelayedAsync(
        sourceMessage,
        composeReviewMessage(lastReview, {
          canReply,
        })
      );
    } else {
      await bot.replyPrivateDelayedAsync(
        sourceMessage,
        'Sorry, I could not find a matching review.'
      );
    }
    return true;
  };

  const testFeeds = async (bot) => {
    const { id: teamId, businessUnits } = bot.team_info;
    businessUnits.forEach(async (businessUnitId) => {
      const name = await apiClient.getBusinessUnitDisplayName(businessUnitId);
      const review = {
        stars: 5,
        createdAt: new Date(),
        title: `Test Review of ${name}`,
        text: 'This is just a test to verify the settings on your Slack channels.',
        consumer: {
          displayName: 'The Trustpilot Slack App',
        },
      };
      slackapp.trigger('trustpilot_review_received', [{ review, teamId, businessUnitId }]);
    });
  };

  const handleReplyButton = async (bot, message) => {
    const { canReply } = feedSettings.getChannelFeedSettingsOrDefault(
      bot.team_info,
      message.channel
    );
    if (!canReply) {
      bot.replyPublicDelayedAsync =
        bot.replyPublicDelayedAsync || promisify(bot.replyPublicDelayed);
      await bot.replyPublicDelayedAsync(
        message,
        'Sorry, it’s no longer possible to reply to reviews from this channel.'
      );
    } else {
      reviewReply.showReplyDialog(bot, message);
      slackapp.trigger('reply_dialog_opened', [
        {
          reviewId: message.callback_id,
        },
      ]);
    }
  };

  slackapp.on('tick', () => {}); // Avoid filling the logs on each tick

  slackapp.on('create_bot', async (bot, botConfig) => {
    // We're not using the RTM API so we need to tell Botkit to start processing conversations
    slackapp.startTicking();
    bot.startPrivateConversationAsync = promisify(bot.startPrivateConversation);

    const convo = await bot.startPrivateConversationAsync({
      user: botConfig.createdBy,
    });
    convo.say('Hi there,');
    convo.say(
      'Receive and reply to reviews directly from Slack at your convenience. ' +
        'Select the private or public channel of your choice, and use the `/trustpilot settings` ' +
        'or `/trustpilot feed` command to get started.'
    );
    convo.say('Enjoy! Trustpilot');
  });

  /*
    Entry points : Slash command, button clicks, dialog submissions
  */

  slackapp.on('slash_command', async (bot, message) => {
    bot.replyAcknowledge();
    const type = slashCommandType(message.text);
    const noop = () => {};
    const commandHandlers = {
      ['review_query']: enableReviewQueries ? handleReviewQuery : noop,
      ['feed_settings']: feedSettings.handleSettingsCommand,
      ['test_feeds']: testFeeds,
    };
    await commandHandlers[type](bot, message);
    return true;
  });

  slackapp.on('interactive_message_callback', async (bot, message) => {
    bot.replyAcknowledge();
    const action = message.actions[0].value;
    const actionHandlers = {
      ['step_1_write_reply']: handleReplyButton,
      ['open_feed_settings']: feedSettings.showFeedSettings(slackapp),
      ['delete_feed_settings']: feedSettings.deleteFeedSettings(slackapp),
    };
    await actionHandlers[action](bot, message);
    return true;
  });

  slackapp.on('dialog_submission', async (bot, message) => {
    bot.dialogOk();
    const dialogType = message.callback_id;
    const dialogHandlers = {
      ['review_reply']: reviewReply.handleReply(apiClient),
      ['feed_settings']: feedSettings.handleDialogSubmission(slackapp),
    };
    await dialogHandlers[dialogType](bot, message);
    return true;
  });

  /*
    Custom handler : incoming review
  */

  slackapp.on('trustpilot_review_received', async ({ review, teamId, businessUnitId }) => {
    slackapp.findTeamByIdAsync = slackapp.findTeamByIdAsync || promisify(slackapp.findTeamById);
    const team = await slackapp.findTeamByIdAsync(teamId);
    const bot = slackapp.spawn(team);
    bot.team_info = team; // eslint-disable-line camelcase
    bot.sendAsync = bot.sendAsync || promisify(bot.send);
    const feeds = feedSettings.getBusinessUnitFeedsForStarRating(
      team,
      businessUnitId,
      review.stars
    );

    feeds.forEach(async ({ channelId, canReply }) => {
      const message = {
        username: bot.config.bot.name, // Confusing, but such is life
        channel: channelId,
        ...composeReviewMessage(review, { canReply }),
      };
      try {
        const { ok: sentOk, ts, channel } = await bot.sendAsync(message);
        if (sentOk) {
          slackapp.trigger('trustpilot_review_posted', [
            bot,
            { businessUnitId, ts, channel, reviewId: review.id },
          ]);
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
  });
};

module.exports = (config, apiClient, storage) => {
  // Fallback to jfs when no storage middleware provided
  const slackapp = botkit.slackbot({
    debug: false,
    storage: storage,
    json_file_store: './storage/', // eslint-disable-line camelcase
    retry: 2,
    clientId: config.SLACK_CLIENT_ID,
    clientSecret: config.SLACK_SECRET,
    clientSigningSecret: config.SLACK_SIGNING_SECRET,
    rtm_receive_messages: false, // eslint-disable-line camelcase
    scopes: ['bot', 'incoming-webhook', 'commands'],
  });
  setupAppHandlers(slackapp, apiClient, config.ENABLE_REVIEW_QUERIES);
  return slackapp;
};
