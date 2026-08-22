const { getDB } = require('../db');

// Each document shape:
// { _id: channelId, value: previousSendMessagesValue (true|false|null) }

async function saveLock(channelId, previousValue) {
  const db = getDB();
  await db.collection('channelLock').updateOne(
    { _id: channelId },
    { $set: { value: previousValue } },
    { upsert: true }
  );
}

async function getLock(channelId) {
  const db = getDB();
  const doc = await db.collection('channelLock').findOne({ _id: channelId });
  return doc ? doc.value : undefined; // undefined = never locked, matches old hasOwnProperty behavior
}

async function clearLock(channelId) {
  const db = getDB();
  await db.collection('channelLock').deleteOne({ _id: channelId });
}

module.exports = { saveLock, getLock, clearLock };