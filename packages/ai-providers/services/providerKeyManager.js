const ProviderApiKey = require('../models/ProviderApiKey.js');
const logger = require('@packages/logger/index.js');

/**
 * Provider Key Manager – Quản lý xoay vòng API Key theo từng AI Provider (custom)
 * Tương tự apiKeyManager.js (dành cho Google) nhưng cache theo providerId,
 * cho phép mỗi provider có pool key riêng.
 */
class ProviderKeyManager {
    constructor() {
        this.pools = new Map(); // providerId(string) -> { keys, currentIndex, lastRefresh }
        this.refreshInterval = 5 * 60 * 1000; // Refresh cache mỗi 5 phút
    }

    _getPool(providerId) {
        const id = String(providerId);
        if (!this.pools.has(id)) {
            this.pools.set(id, { keys: [], currentIndex: 0, lastRefresh: 0 });
        }
        return this.pools.get(id);
    }

    /**
     * Refresh danh sách key từ database cho 1 provider
     */
    async refreshKeys(providerId) {
        const pool = this._getPool(providerId);
        const now = Date.now();
        if (pool.keys.length > 0 && now - pool.lastRefresh < this.refreshInterval) {
            return; // Chưa cần refresh
        }

        pool.keys = await ProviderApiKey.find({ providerId, isActive: true }).lean();
        pool.lastRefresh = now;

        if (pool.currentIndex >= pool.keys.length) {
            pool.currentIndex = 0;
        }
    }

    /**
     * Lấy API Key tiếp theo cho 1 provider
     * @param {string} providerId
     * @param {string} strategy - 'sequential' hoặc 'random'
     * @returns {Object} { key, name, _id }
     */
    async getNextKey(providerId, strategy) {
        await this.refreshKeys(providerId);
        const pool = this._getPool(providerId);

        if (pool.keys.length === 0) {
            throw new Error('Không có API Key nào được cấu hình cho Provider này. Vui lòng thêm API Key trong trang quản trị.');
        }

        const useStrategy = strategy || 'sequential';
        let selectedKey;

        if (useStrategy === 'random') {
            const randomIndex = Math.floor(Math.random() * pool.keys.length);
            selectedKey = pool.keys[randomIndex];
        } else {
            selectedKey = pool.keys[pool.currentIndex];
            pool.currentIndex = (pool.currentIndex + 1) % pool.keys.length;
        }

        ProviderApiKey.findByIdAndUpdate(selectedKey._id, {
            $inc: { usageCount: 1 },
            lastUsedAt: new Date()
        }).catch(err => logger.error('Lỗi cập nhật usage count (provider key):', err));

        return {
            key: selectedKey.key,
            name: selectedKey.name,
            _id: selectedKey._id
        };
    }

    /**
     * Đánh dấu key bị lỗi
     */
    async markKeyError(keyId, errorMessage) {
        await ProviderApiKey.findByIdAndUpdate(keyId, {
            lastError: errorMessage,
            lastErrorAt: new Date()
        });
    }

    /**
     * Force refresh cache của 1 provider (hoặc toàn bộ nếu không truyền providerId)
     */
    invalidateCache(providerId) {
        if (providerId) {
            this.pools.delete(String(providerId));
        } else {
            this.pools.clear();
        }
    }
}

// Singleton instance
module.exports = new ProviderKeyManager();
