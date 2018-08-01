const { fillInInteractiveMessage } = require('./lib/interactive-message');

const showReplyDialog = (bot, message) => {
  const dialog = bot
    .createDialog('Reply to a review', JSON.stringify({
      dialogType: 'review_reply',
      originalTs: message.message_ts,
      reviewId: message.callback_id,
    }), 'Send')
    .addTextarea('Your reply', 'reply');
  bot.replyWithDialog(message, dialog.asObject(), (err, res) => {
    if (err) {
      console.log(err, res);
    }
  });
};

const handleReply = async (bot, message, trustpilotApi) => {
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
    bot.say(fillInInteractiveMessage({
      ['thread_ts']: originalTs,
      channel: message.channel,
      attachments: [
        {
          ['author_name']: message.raw_message.user.name,
          text: message.submission.reply,
          ts: message.action_ts,
        },
      ],
    }));
    bot.api.reactions.remove(errorReaction);
  } catch (e) {
    bot.replyPrivateDelayed(message, 'Something went wrong while sending your reply! Please try again shortly.');
    bot.api.reactions.add(errorReaction);
  }
};

module.exports = { showReplyDialog, handleReply };
