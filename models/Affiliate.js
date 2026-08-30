const mongoose = require('mongoose');

const affiliateSchema = new mongoose.Schema({
    buttonLabel: { type: String, required: true },
    description: { type: String, required: true },
    bannerUrl: { type: String, required: true },
    link: { type: String, required: true },
    addedBy: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.models.Affiliate || mongoose.model('Affiliate', affiliateSchema);