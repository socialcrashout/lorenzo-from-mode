const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'serverLock.json');

function readData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return {};
  }
}

function writeData(data) {
  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}

// Shape: { "<guildId>": { "<channelId>": previousSendMessagesValue (true|false|null) } }

function saveLockState(guildId, channelStates) {
  const data = readData();
  data[guildId] = channelStates;
  writeData(data);
}

function getLockState(guildId) {
  const data = readData();
  return data[guildId] || null;
}

function clearLockState(guildId) {
  const data = readData();
  delete data[guildId];
  writeData(data);
}

module.exports = { saveLockState, getLockState, clearLockState };