const ticketManager = require('../utils/ticketManager');

module.exports = {
  name: 'close',
  execute: async (message, args, client) => {
    await ticketManager.handleCloseCommand(message);
  },
};