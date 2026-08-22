const notifications = require('../commands/notifications');

module.exports = {
  name: 'notifications',
  execute: async (message, args, client) => {
    await notifications.handleTextTrigger(message);
  },
};