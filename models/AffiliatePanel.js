const mongoose = require('mongoose');

const affiliatePanelSchema = new mongoose.Schema({
    _id: { type: String, default: 'panel' },
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
});

module.exports = mongoose.models.AffiliatePanel || mongoose.model('AffiliatePanel', affiliatePanelSchema);