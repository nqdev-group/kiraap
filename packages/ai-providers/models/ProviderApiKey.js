const mongoose = require('mongoose');

const providerApiKeySchema = new mongoose.Schema({
    providerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AIProvider',
        required: true
    },
    name: {
        type: String,
        required: [true, 'Tên Key là bắt buộc'],
        trim: true
    },
    key: {
        type: String,
        required: [true, 'API Key là bắt buộc'],
        trim: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    usageCount: {
        type: Number,
        default: 0
    },
    lastUsedAt: {
        type: Date,
        default: null
    },
    lastError: {
        type: String,
        default: ''
    },
    lastErrorAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('ProviderApiKey', providerApiKeySchema);
