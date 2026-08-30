const mongoose = require('mongoose');

const suggestionSchema = new mongoose.Schema({
    messageId: { type: String, required: true, unique: true },
    channelId: { type: String, required: true },
    threadId: { type: String, default: null },
    number: { type: Number, required: true },
    authorId: { type: String, required: true },
    description: { type: String, required: true },
    referenceUrl: { type: String, default: null },
    upvotes: { type: [String], default: [] },
    downvotes: { type: [String], default: [] },
    status: { type: String, enum: ['pending', 'accepted', 'denied'], default: 'pending' },
    resolvedBy: { type: String, default: null },
}, { timestamps: true });

// Tiny counter collection so suggestion numbers increment atomically
// even if two people run /suggest at the same instant.
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);
const Suggestion = mongoose.models.Suggestion || mongoose.model('Suggestion', suggestionSchema);

async function getNextSuggestionNumber() {
    const result = await Counter.findByIdAndUpdate(
        'suggestionNumber',
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return result.seq;
}

module.exports = { Suggestion, getNextSuggestionNumber };