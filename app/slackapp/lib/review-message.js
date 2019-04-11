const _S = require('underscore.string');
const moment = require('moment');
const { fillInInteractiveMessage } = require('./interactive-message');

const makeReviewAttachment = (review, ...partBuilders) => {
  const stars = _S.repeat('★', review.stars) + _S.repeat('✩', 5 - review.stars);
  const verifiedString = review.isVerified ? 'Verified' : 'Not verified';
  const reviewMoment = moment(review.createdAt);
  const color = review.stars >= 4 ? 'good' : review.stars <= 2 ? 'danger' : 'warning';
  const fields = review.referenceId
    ? [
        {
          title: 'Reference number',
          value: review.referenceId,
        },
      ]
    : [];
  const basicAttachment = {
    ['author_name']: review.consumer.displayName,
    title: review.title,
    text: review.text,
    color: color,
    footer: `${stars} ${verifiedString}`,
    ts: reviewMoment.format('X'),
    fields,
  };

  return partBuilders.reduce((attachment, builder) => {
    return { ...attachment, ...builder(review) };
  }, basicAttachment);
};

const actionsPartBuilder = (actionsMap) => (review) => {
  const actions = [...actionsMap]
    .filter(([, isPermitted]) => isPermitted)
    .map(([action]) => action);
  return actions.length
    ? {
        ['callback_id']: review.id,
        actions,
      }
    : {};
};

const replyAction = {
  value: 'step_1_write_reply',
  text: ':writing_hand: Reply',
};

const composeReviewMessage = (review, { canReply }) => {
  const actionsMap = new Map();
  actionsMap.set(replyAction, canReply);

  return fillInInteractiveMessage({
    attachments: [makeReviewAttachment(review, actionsPartBuilder(actionsMap))],
  });
};

module.exports = { composeReviewMessage };
