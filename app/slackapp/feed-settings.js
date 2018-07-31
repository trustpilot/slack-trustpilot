const { promisify } = require('util');
const { makeInteractiveMessage } = require('./interactive-message');

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
const upsertFeedSettings = (team, channelId, settings, slackapp) => {
  const feeds = team.feeds || [];
  // Using a Map to upsert the new settings
  const feedsMap = new Map(feeds.map((f) => [f.channelId, f]));
  const oldSettings = feedsMap.get(channelId);
  feedsMap.set(channelId, oldSettings ? { ...oldSettings, ...settings } : settings);
  team.feeds = [...feedsMap.values()];
  slackapp.saveTeamAsync = slackapp.saveTeamAsync || promisify(slackapp.saveTeam);
  return slackapp.saveTeamAsync(team);
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

const handleNewFeedSettings = async (bot, message, slackapp) => {
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
  await upsertFeedSettings(team, channelId, newSettings, slackapp);
  const privateChannelWarning = channelId.startsWith('G') ? '\nJust one last thing:'
    + ' this looks like a private channel, so *please /invite me* so I can post reviews here!' : '';
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

const handleDialogSubmission = async (bot, message, slackapp) => {
  const { sourceMessage } = JSON.parse(message.callback_id);
  await handleNewFeedSettings(bot, message, slackapp);
  await showFeedSettingsIntroMessage(sourceMessage, bot);
};

const deleteFeedSettings = async (message, bot, slackapp) => {
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

module.exports = {
  handleSettingsCommand,
  handleDialogSubmission,
  showFeedSettings,
  deleteFeedSettings,
  getTeamFeeds,
  getChannelFeedSettingsOrDefault,
};
