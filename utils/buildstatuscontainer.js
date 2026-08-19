// utils/buildStatusContainer.js
const { ContainerBuilder, TextDisplayBuilder } = require('discord.js');
const { SERVICES, STATUS, EMOJIS } = require('../config/orderStatus');

/**
 * @param {Record<string, string>} statusMap 
 * @param {object} [opts]
 * @param {string} [opts.title='Order Status'] - you can edit this title. do NOT remove any quotations marks around it ONLY edit the text
 * @param {number} [opts.accentColor] - 
 */
function buildStatusContainer(statusMap, opts = {}) {
  const title = opts.title ?? 'Order Status';

  const lines = SERVICES.map((service) => {
    const status = statusMap[service.key] ?? STATUS.CLOSED;
    const emoji = EMOJIS[status] ?? EMOJIS[STATUS.CLOSED];
    const suffix = status === STATUS.DELAYED ? ' (Delayed)' : '';
    return `${emoji} - ${service.label}${suffix}`;
  });

  const container = new ContainerBuilder();

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## ${EMOJIS.HEADER} | ${title}`),
    new TextDisplayBuilder().setContent(lines.join('\n')),
  );

  return container;
}

module.exports = { buildStatusContainer };