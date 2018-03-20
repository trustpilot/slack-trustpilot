const _S = require('underscore.string');
const moment = require('moment');

const makeReviewAttachment = (review, ...partBuilders) => {
  const stars = _S.repeat('★', review.stars) + _S.repeat('✩', 5 - review.stars);
  const reviewMoment = moment(review.createdAt);
  const color = (review.stars >= 4) ? 'good' : (review.stars <= 2) ? 'danger' : 'warning';
  const basicAttachment = {
    'attachment_type': 'default',
    'fallback': '',
    'author_name': review.consumer.displayName,
    'title': review.title,
    'text': review.text,
    'color': color,
    'footer': stars,
    'ts': reviewMoment.format('X'),
  };

  return partBuilders.reduce((attachment, builder) => {
    return { ...attachment, ...builder(review) };
  }, basicAttachment);
};

const actionsPartBuilder = (actionsMap) => (review) => {
  const actions = [...actionsMap].filter(([, isPermitted]) => isPermitted).map(([action]) => action);
  return actions.length ? {
    'callback_id': review.id,
    actions,
  } : {};
};

const replyAction = {
  'name': 'step_1_write_reply',
  'text': ':writing_hand: Reply',
  'value': 'step_1_write_reply',
  'type': 'button',
};

const composeReviewMessage = (review, { canReply }) => {
  const actionsMap = new Map();
  actionsMap.set(replyAction, canReply);

  return {
    'text': '',
    'attachments': [
      makeReviewAttachment(review, actionsPartBuilder(actionsMap)),
    ],
  };
};

module.exports = { composeReviewMessage };
