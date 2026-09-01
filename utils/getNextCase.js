const { getDB } = require('../db');

// Returns the next case number for a guild, using a counters collection
// Document shape: { _id: guildId, count: <lastCaseNumber> }
async function getNextCase(guildId) {
  const db = getDB();

  const result = await db.collection('caseCounters').findOneAndUpdate(
    { _id: guildId },
    { $inc: { count: 1 } },
    { upsert: true, returnDocument: 'after' }
  );

  // MongoDB Node driver v6+ changed findOneAndUpdate to return the document
  // directly instead of wrapping it in { value }. Handle both shapes so this
  // keeps working whether you're on v5 or v6+.
  const doc = result?.value ?? result;
  return doc.count;
}

module.exports = getNextCase;