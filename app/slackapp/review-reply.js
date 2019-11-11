const { promisify } = require('util');
const { fillInInteractiveMessage } = require('./lib/interactive-message');

const addReaction = async (bot, channel, timestamp, name) => {
  try {
    bot.api.reactions.addAsync = bot.api.reactions.addAsync || promisify(bot.api.reactions.add);
    await bot.api.reactions.addAsync({ channel, timestamp, name });
  } catch (error) {
    if (error === 'already_reacted') {
      return;
    } else {
      throw error;
    }
  }
};

// This method is not symmetric to addReaction: no async/await because we don't care about errors.
const removeReaction = (bot, channel, timestamp, name) => {
  bot.api.reactions.remove({ channel, timestamp, name });
};

const showReplyDialog = (bot, message) => {
  const dialogBuilder = bot
    .createDialog(
      'Reply to a review',
      'review_reply',
      'Send',
      JSON.stringify({
        originalTs: message.message_ts,
        reviewId: message.callback_id,
      })
    )
    .addTextarea('Your reply', 'reply');

  bot.replyWithDialog(message, dialogBuilder.asObject(), (err, res) => {
    if (err) {
      console.log(err, res);
    }
  });
};

const confirmReply = async (bot, message, originalTs) => {
  // Reply confirmation can take two different looks:
  // - if the bot is invited to the channel, and the review message is public to the channel,
  //   we can confirm the reply by posting it to a thread beneath the review, and adding a reaction.
  // - in all other cases, we fall back to a private message in the channel.
  try {
    // Try to add the reaction first, if the review message was private (slash command), this should fail.
    await addReaction(bot, message.channel, originalTs, 'outbox_tray');
    bot.sayAsync = bot.sayAsync || promisify(bot.say);
    await bot.sayAsync(
      fillInInteractiveMessage({
        ['thread_ts']: originalTs,
        channel: message.channel,
        attachments: [
          {
            ['author_name']: message.raw_message.user.name,
            text: message.submission.reply,
            ts: message.action_ts,
          },
        ],
      })
    );
  } catch (e) {
    // Review message was private, or bot not in channel
    bot.replyPrivateDelayed(message, 'Your reply was sent successfully.');
  }
};

const handleReply = (apiClient) => async (bot, message) => {
  const { originalTs, reviewId } = JSON.parse(message.state);
  try {
    await apiClient.replyToReview({
      reviewId,
      message: message.submission.reply,
    });
    confirmReply(bot, message, originalTs);
    removeReaction(bot, message.channel, originalTs, 'boom');
  } catch (e) {
    bot.replyPrivateDelayed(
      message,
      'Something went wrong while sending your reply! Please try again shortly.'
    );
    addReaction(bot, message.channel, originalTs, 'boom');
  }
};

module.exports = { showReplyDialog, handleReply };
