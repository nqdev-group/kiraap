const mongoose = require('mongoose');

const aiProviderSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Tên Provider là bắt buộc'],
        trim: true
    },
    type: {
        type: String,
        required: [true, 'Loại Provider là bắt buộc'],
        enum: ['openai', 'anthropic']
    },
    baseUrl: {
        type: String,
        required: [true, 'Base URL là bắt buộc'],
        trim: true
    },
    extraHeaders: {
        type: Object,
        default: {}
    },
    keyRotationStrategy: {
        type: String,
        enum: ['sequential', 'random'],
        default: 'sequential'
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('AIProvider', aiProviderSchema);
