const removeEmpty = (obj) => {
  Object.entries(obj).forEach(([key, val]) => {
    if (val && typeof val === 'object') {
      removeEmpty(val);
    } else if (val === null) {
      delete obj[key];
    }
  });
  return obj;
};

const fillInConfirm = ({ title, text, ...restOfConfirm }) => {
  return {
    title,
    text,
    ['ok_text']: 'Yes',
    ['dismiss_text']: 'No',
    ...restOfConfirm,
  };
};

const fillInAction = ({ value, text, confirm, ...restOfAction }) => {
  return {
    value,
    text,
    name: value,
    confirm: confirm ? fillInConfirm(confirm) : null,
    type: 'button',
    ...restOfAction,
  };
};

const fillInAttachment = ({ text, actions, ...restOfAttachment }) => {
  return {
    text,
    actions: actions ? actions.map(fillInAction) : null,
    ['callback_id']: 'default',
    ['attachment_type']: 'default',
    ...restOfAttachment,
  };
};

const fillInInteractiveMessage = ({ attachments, ...restOfMessage }) => {
  return removeEmpty({
    attachments: attachments ? attachments.map(fillInAttachment) : null,
    ...restOfMessage,
  });
};

const makeInteractiveMessage = (...pseudoAttachments) => {
  return fillInInteractiveMessage({
    attachments: pseudoAttachments,
  });
};

module.exports = { fillInInteractiveMessage, makeInteractiveMessage };
