const { promisify } = require('util');
const { makeInteractiveMessage } = require('./lib/interactive-message');

module.exports = (apiClient) => {
  const getTeamFeeds = (team) => {
    const feeds = team.feeds || [];
    // Add in the incoming webhook settings, for backwards compatibility
    if (team.incoming_webhook) {
      const {
        businessUnitId,
        incoming_webhook: { channel_id: webhookChannelId },
      } = team;
      const incomingWebhookDefaults = {
        businessUnitId,
        channelId: webhookChannelId,
        canReply: true,
      };
      const existingSettings = feeds.find((f) => f.channelId === webhookChannelId);
      if (!existingSettings) {
        return feeds.concat(incomingWebhookDefaults);
      }
    }
    return feeds;
  };

  const getBusinessUnitFeedsForStarRating = (team, targetBusinessUnitId, starRating) => {
    const feeds = getTeamFeeds(team);
    return feeds.filter(({ businessUnitId, starFilter = 'all' }) => {
      return (
        businessUnitId === targetBusinessUnitId &&
        (starFilter === 'all' ||
          (starFilter === 'positive' && starRating >= 4) ||
          (starFilter === 'negative' && starRating < 4))
      );
    });
  };

  const getChannelFeedSettings = (team, targetChannelId) => {
    const feeds = getTeamFeeds(team);
    const channelSettings = feeds.find(({ channelId }) => channelId === targetChannelId);
    return channelSettings;
  };

  const getChannelFeedSettingsOrDefault = (team, targetChannelId) => {
    return (
      getChannelFeedSettings(team, targetChannelId) || { canReply: false, businessUnitId: null }
    );
  };

  const areSettingsPresentForChannel = (team, targetChannelId) => {
    return !!getChannelFeedSettings(team, targetChannelId);
  };

  const upsertFeedSettings = (team, channelId, settings, slackapp) => {
    const feeds = team.feeds || [];
    // Using a Map to upsert the new settings
    const feedsMap = new Map(feeds.map((f) => [f.channelId, f]));
    const oldSettings = feedsMap.get(channelId);
    feedsMap.set(channelId, { ...oldSettings, ...settings });
    team.feeds = [...feedsMap.values()];
    slackapp.saveTeamAsync = slackapp.saveTeamAsync || promisify(slackapp.saveTeam);
    return slackapp.saveTeamAsync(team);
  };

  const showIntroMessage = (message, bot) => {
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

  const getBusinessUnitSelectionValues = (businessUnits) => {
    const promiseMap = businessUnits.map((bu) =>
      apiClient
        .getBusinessUnitDisplayName(bu)
        .then((displayName) => ({ label: displayName, value: bu }))
    );
    return Promise.all(promiseMap);
  };

  const showFeedSettings = (slackapp) => async (bot, message) => {
    const team = bot.team_info;
    const { starFilter = 'all', canReply, businessUnitId } = getChannelFeedSettingsOrDefault(
      team,
      message.channel
    );
    const sourceMessage = {
      ts: message.message_ts,
      response_url: message.response_url, // eslint-disable-line camelcase
      channel: message.channel,
    };
    const businessUnitValues = await getBusinessUnitSelectionValues(team.businessUnits);

    const dialogBuilder = bot
      .createDialog(
        'Review settings',
        'feed_settings',
        'Save',
        [],
        JSON.stringify({ sourceMessage })
      )
      .addSelect('Display reviews for', 'businessUnitId', businessUnitId, businessUnitValues)
      .addSelect('Filter by star rating', 'starFilter', starFilter, [
        { label: 'None - post all reviews', value: 'all' },
        { label: 'Only post 4 and 5-star reviews', value: 'positive' },
        { label: 'Only post reviews with 1, 2 or 3 stars', value: 'negative' },
      ])
      .addSelect('In-channel reply', 'replyFeature', canReply ? 'on' : 'off', [
        { label: 'Allow users to reply to reviews', value: 'on' },
        {
          label: 'Do not allow users to reply to reviews',
          value: 'off',
        },
      ]);

    bot.replyWithDialog(message, dialogBuilder.asObject(), (err, res) => {
      if (err) {
        console.log(err, res);
      }
    });
    slackapp.trigger('feed_settings_dialog_opened', [bot]);
  };

  const handleNewFeedSettings = async (bot, message, slackapp) => {
    const {
      channel: channelId,
      submission: { starFilter, replyFeature, businessUnitId },
    } = message;
    const team = bot.team_info;
    const newSettings = {
      channelId,
      businessUnitId,
      starFilter,
      canReply: replyFeature === 'on',
    };
    await upsertFeedSettings(team, channelId, newSettings, slackapp);
    const privateChannelWarning = channelId.startsWith('G')
      ? '\nJust one last thing: this looks like a private channel, so *please /invite me* so I can post reviews here!'
      : '';
    bot.replyPrivateDelayedAsync =
      bot.replyPrivateDelayedAsync || promisify(bot.replyPrivateDelayed);
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

  const handleDialogSubmission = (slackapp) => async (bot, message) => {
    const { sourceMessage } = JSON.parse(message.state);
    await handleNewFeedSettings(bot, message, slackapp);
    await showIntroMessage(sourceMessage, bot);
  };

  const deleteFeedSettings = (slackapp) => async (bot, message) => {
    const { channel: channelId } = message;
    const team = bot.team_info;
    if (team.incoming_webhook && team.incoming_webhook.channel_id === channelId) {
      team.incoming_webhook = null;
    }
    const deletedFeed = team.feeds && team.feeds.find((f) => f.channelId === channelId);
    team.feeds = (team.feeds || []).filter((f) => f.channelId !== channelId);
    slackapp.saveTeamAsync = slackapp.saveTeamAsync || promisify(slackapp.saveTeam);
    await slackapp.saveTeamAsync(team);
    if (deletedFeed) {
      slackapp.trigger('feed_settings_deleted', [{ businessUnitId: deletedFeed.businessUnitId }]);
    }
    showIntroMessage(message, bot);
  };

  const handleSettingsCommand = async (bot, message) => {
    bot.api.users.infoAsync = bot.api.users.infoAsync || promisify(bot.api.users.info);
    const { ok: userOk, user } = await bot.api.users.infoAsync({
      user: message.user_id,
    });
    bot.replyPrivateDelayedAsync =
      bot.replyPrivateDelayedAsync || promisify(bot.replyPrivateDelayed);
    if (message.channel_id.startsWith('D')) {
      // Direct message
      await bot.replyPrivateDelayedAsync(
        message,
        'Sorry, I can only post your reviews in a proper channel'
      );
    } else if (userOk && user.is_admin) {
      await showIntroMessage(message, bot);
    } else {
      await bot.replyPrivateDelayedAsync(message, 'Sorry, only administrators can do that');
    }
    return true;
  };

  return {
    handleSettingsCommand,
    handleDialogSubmission,
    showFeedSettings,
    deleteFeedSettings,
    getBusinessUnitFeedsForStarRating,
    getChannelFeedSettingsOrDefault,
  };
};
