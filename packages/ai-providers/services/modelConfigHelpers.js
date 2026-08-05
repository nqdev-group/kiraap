const AIProvider = require('../models/AIProvider.js');

/**
 * Helpers gọi từ server/routes/admin/models.js — giữ mọi logic liên quan tới
 * Custom AI Provider bên ngoài file route gốc, chỉ để lại 1 lời gọi mỗi chỗ dùng.
 */

async function getActiveProviders() {
    return AIProvider.find({ isActive: true }).sort({ name: 1 }).lean();
}

/**
 * ModelConfig.providerId là ObjectId — client gửi chuỗi rỗng khi người dùng chọn
 * "Google (mặc định)" trong form, phải chuyển thành null trước khi lưu để tránh
 * Mongoose CastError. Mutates `updates` in-place và trả về nó để tiện chain.
 */
function normalizeProviderId(updates) {
    if (updates.providerId === '') {
        updates.providerId = null;
    }
    return updates;
}

module.exports = { getActiveProviders, normalizeProviderId };
