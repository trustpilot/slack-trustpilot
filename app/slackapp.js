const botkit = require('botkit');
const { promisify } = require('util');
const { composeReviewMessage } = require('./review-message');
const { fillInInteractiveMessage, makeInteractiveMessage } = require('./interactive-message');

const setupApp = (slackapp, config, trustpilotApi) => {
  /*
    Startup
  */

  slackapp.configureSlackApp({
    clientId: config.SLACK_CLIENT_ID,
    clientSecret: config.SLACK_SECRET,
    rtm_receive_messages: false, // eslint-disable-line camelcase
    scopes: ['bot', 'incoming-webhook', 'commands'],
  });

  slackapp.on('tick', () => { });

  slackapp.on('create_bot', async (bot, config) => {
    // We're not using the RTM API so we need to tell Botkit to start processing conversations
    slackapp.startTicking();
    bot.startPrivateConversationAsync = promisify(bot.startPrivateConversation);

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
    return channelSettings;
  };

  const getChannelFeedSettingsOrDefault = (team, targetChannelId) => {
    return getChannelFeedSettings(team, targetChannelId) || { canReply: false };
  };

  const areSettingsPresentForChannel = (team, targetChannelId) => {
    return !!getChannelFeedSettings(team, targetChannelId);
  };

  const handleReviewQuery = async (bot, sourceMessage) => {
    let stars = Number(sourceMessage.text.split(' ')[0]);
    stars = isNaN(stars) ? null : stars;
    const team = bot.team_info;
    const businessUnitId = team.businessUnitId;
    const { canReply } = getChannelFeedSettingsOrDefault(team, sourceMessage.channel);

    const lastReview = await trustpilotApi.getLastUnansweredReview({
      stars,
      businessUnitId,
    });

    bot.replyPrivateDelayedAsync = bot.replyPrivateDelayedAsync || promisify(bot.replyPrivateDelayed);
    if (lastReview) {
      await bot.replyPrivateDelayedAsync(
        sourceMessage,
        composeReviewMessage(lastReview, {
          canReply,
        })
      );
    } else {
      await bot.replyPrivateDelayedAsync(sourceMessage, 'Sorry, I could not find a matching review.');
    }
    return true;
  };

  const askForReply = (bot, message) => {
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
  };

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
      bot.replyPrivateDelayed(message, 'Something went wrong while sending your reply! Please try again shortly.');
      bot.api.reactions.add(errorReaction);
    }
  };

  const showFeedSettings = (message, bot) => {
    const team = bot.team_info;
    const { canReply } = getChannelFeedSettingsOrDefault(team, message.channel);
    const sourceMessage = {
      ts: message.message_ts,
      response_url: message.response_url, // eslint-disable-line camelcase
      channel: message.channel,
    };
    const dialog = bot
      .createDialog('Review settings', JSON.stringify({ dialogType: 'feed_settings', sourceMessage }), 'Save')
      .addSelect(
        'In-channel reply',
        'replyFeature',
        canReply ? 'on' : 'off',
        [
          { label: 'Allow users to reply to reviews', value: 'on' },
          {
            label: 'Do not allow users to reply to reviews', value: 'off',
          },
        ]
      );
    bot.replyWithDialog(message, dialog.asObject(), (err, res) => {
      if (err) {
        console.log(err, res);
      }
    });
  };

  const showFeedSettingsIntroMessage = (message, bot) => {
    bot.replyInteractiveAsync = bot.replyInteractiveAsync || promisify(bot.replyInteractive);
    if (areSettingsPresentForChannel(bot.team_info, message.channel)) {
      return bot.replyInteractiveAsync(
        message,
        makeInteractiveMessage({
          text: 'Manage your review settings for this channel.',
          actions: [
            {
              value: 'delete_feed_settings',
              text: 'Stop posting reviews',
              style: 'danger',
              confirm: {
                title: 'Are you sure?',
                text: ' You will no longer see your Trustpilot reviews in this channel.',
              },
            },
            {
              value: 'open_feed_settings',
              text: 'Change settings',
            },
          ],
        })
      );
    } else {
      return bot.replyInteractiveAsync(
        message,
        makeInteractiveMessage({
          text:
            'Get your Trustpilot reviews posted on this channel. ' +
            'Click the button below to manage your review settings.',
          actions: [
            {
              value: 'open_feed_settings',
              text: 'Post reviews here',
              style: 'primary',
            },
          ],
        })
      );
    }
  };

  const upsertFeedSettings = (team, channelId, settings) => {
    const feeds = team.feeds || [];
    // Using a Map to upsert the new settings
    const feedsMap = new Map(feeds.map((f) => [f.channelId, f]));
    const oldSettings = feedsMap.get(channelId);
    feedsMap.set(channelId, oldSettings ? { ...oldSettings, ...settings } : settings);
    team.feeds = [...feedsMap.values()];
    slackapp.saveTeamAsync = slackapp.saveTeamAsync || promisify(slackapp.saveTeam);
    return slackapp.saveTeamAsync(team);
  };

  const handleNewFeedSettings = async (bot, message) => {
    const {
      channel: channelId,
      submission: { replyFeature },
    } = message;
    const team = bot.team_info;
    const businessUnitId = team.businessUnitId;
    const newSettings = {
      channelId,
      businessUnitId,
      canReply: replyFeature === 'on',
    };
    await upsertFeedSettings(team, channelId, newSettings);
    const privateChannelWarning = channelId.startsWith('G') ? '\nObs! Looks like this is a private channel! ' +
      'Make sure to */invite @trustpilot* to get reviews posted here!' : '';
    bot.replyPrivateDelayedAsync = bot.replyPrivateDelayedAsync || promisify(bot.replyPrivateDelayed);
    if (newSettings.canReply) {
      await bot.replyPrivateDelayedAsync(
        message,
        `All set! Users on this channel can reply to reviews.${privateChannelWarning}`
      );
    } else {
      await bot.replyPrivateDelayedAsync(
        message,
        `Settings saved! The reply button is not available to users in this channel.${privateChannelWarning}`
      );
    }
  };

  const deleteFeedSettings = async (message, bot) => {
    const { channel: channelId } = message;
    const team = bot.team_info;
    const feeds = team.feeds || [];
    // Using a Map to upsert the new settings
    const feedsMap = new Map(feeds.map((f) => [f.channelId, f]));
    feedsMap.delete(channelId);
    team.feeds = [...feedsMap.values()];
    slackapp.saveTeamAsync = slackapp.saveTeamAsync || promisify(slackapp.saveTeam);
    await slackapp.saveTeamAsync(team);
    showFeedSettingsIntroMessage(message, bot);
  };

  const handleSettingsCommand = async (bot, message) => {
    bot.api.users.infoAsync = bot.api.users.infoAsync || promisify(bot.api.users.info);
    const { ok: userOk, user } = await bot.api.users.infoAsync({
      user: message.user_id,
    });
    bot.replyPrivateDelayedAsync = bot.replyPrivateDelayedAsync || promisify(bot.replyPrivateDelayed);
    if (message.channel_id.startsWith('D')) { // Direct message
      await bot.replyPrivateDelayedAsync(message, 'Sorry, I can only post your reviews in a proper channel');
    } else if (userOk && user.is_admin) {
      await showFeedSettingsIntroMessage(message, bot);
    } else {
      await bot.replyPrivateDelayedAsync(message, 'Sorry, only administrators can do that');
    }
    return true;
  };

  /*
    Entry points
  */

  slackapp.on('slash_command', async (bot, message) => {
    bot.replyAcknowledge();
    if (/^[1-5] stars?$/i.test(message.text) || /^la(te)?st$/i.test(message.text)) {
      return await handleReviewQuery(bot, message);
    } else if (message.text === 'settings' || message.text === 'feed') {
      return await handleSettingsCommand(bot, message);
    } else {
      return true;
    }
  });

  slackapp.on('interactive_message_callback', async (bot, message) => {
    bot.replyAcknowledge();
    const messageAction = message.actions[0].value;
    if (messageAction === 'step_1_write_reply') {
      const { canReply } = getChannelFeedSettingsOrDefault(bot.team_info, message.channel);
      if (!canReply) {
        bot.replyPublicDelayedAsync = bot.replyPublicDelayedAsync || promisify(bot.replyPublicDelayed);
        await bot.replyPublicDelayedAsync(message, 'Sorry, it’s no longer possible to reply to reviews'
          + ' from this channel.');
      } else {
        askForReply(bot, message);
      }
    } else if (messageAction === 'open_feed_settings') {
      showFeedSettings(message, bot);
    } else if (messageAction === 'delete_feed_settings') {
      deleteFeedSettings(message, bot);
    }
    return true;
  });

  slackapp.on('dialog_submission', async (bot, message) => {
    bot.dialogOk();
    const { dialogType, sourceMessage } = JSON.parse(message.callback_id);
    if (dialogType === 'review_reply') {
      return handleReply(bot, message);
    } else if (dialogType === 'feed_settings') {
      await handleNewFeedSettings(bot, message);
      bot.replyInteractiveAsync = bot.replyInteractiveAsync || promisify(bot.replyInteractive);
      await showFeedSettingsIntroMessage(sourceMessage, bot);
      return true;
    } else {
      return true;
    }
  });

  /*
    Incoming webhook plumbing
  */

  slackapp.postNewReview = async (review, teamId) => {
    slackapp.findTeamByIdAsync = slackapp.findTeamByIdAsync || promisify(slackapp.findTeamById);
    const team = await slackapp.findTeamByIdAsync(teamId);
    const bot = slackapp.spawn(team);
    bot.team_info = team; // eslint-disable-line camelcase
    bot.sendAsync = bot.sendAsync || promisify(bot.send);
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
};

module.exports = (config, trustpilotApi, storage) => {
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
