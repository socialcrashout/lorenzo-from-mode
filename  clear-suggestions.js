// clear-suggestions.js
// One-off script to wipe all suggestion data and reset numbering back to #1.
// Run with: node clear-suggestions.js
// Delete this file afterward if you don't want it lying around.

require('dotenv').config();
const mongoose = require('mongoose');

// Match whichever env var name your db.js actually uses to connect.
const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

(async () => {
    if (!MONGO_URI) {
        console.error('No Mongo connection string found in your .env (checked MONGODB_URI, MONGO_URI, DATABASE_URL).');
        console.error('Open your db.js and check which env var it reads, then set that same one here or in .env.');
        process.exit(1);
    }

    await mongoose.connect(MONGO_URI);
    console.log('Connected.');

    const suggestionsResult = await mongoose.connection.collection('suggestions').deleteMany({});
    console.log(`Deleted ${suggestionsResult.deletedCount} suggestion(s).`);

    const counterResult = await mongoose.connection.collection('counters').deleteOne({ _id: 'suggestionNumber' });
    console.log(counterResult.deletedCount ? 'Suggestion counter reset — next suggestion will be #1.' : 'No counter doc found (already at default).');

    await mongoose.disconnect();
    console.log('Done.');
    process.exit(0);
})().catch((err) => {
    console.error('Failed to clear suggestions:', err);
    process.exit(1);
});