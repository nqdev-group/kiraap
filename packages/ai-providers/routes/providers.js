const express = require('express');
const router = express.Router();
const auth = require('#server/middleware/auth.js');
const adminOnly = require('#server/middleware/adminOnly.js');
const ModelConfig = require('#server/models/ModelConfig.js');
const AIProvider = require('../models/AIProvider.js');
const ProviderApiKey = require('../models/ProviderApiKey.js');
const providerKeyManager = require('../services/providerKeyManager.js');

router.use(auth, adminOnly);

// GET /admin/providers
router.get('/', async (req, res) => {
    const providers = await AIProvider.find().sort({ createdAt: -1 }).lean();
    const keyCounts = await ProviderApiKey.aggregate([
        { $group: { _id: '$providerId', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    keyCounts.forEach(k => { countMap[k._id.toString()] = k.count; });
    providers.forEach(p => { p.keyCount = countMap[p._id.toString()] || 0; });

    res.render('admin/providers', { pageTitle: 'AI Provider', activePage: 'providers', adminUser: req.user, providers });
});

// GET /admin/providers/:id/keys — trang riêng quản lý Key của 1 Provider
router.get('/:id/keys', async (req, res) => {
    const provider = await AIProvider.findById(req.params.id).lean();
    if (!provider) return res.status(404).render('admin/404', { layout: false });
    res.render('admin/provider-keys', { pageTitle: 'Quản lý Key — ' + provider.name, activePage: 'providers', adminUser: req.user, provider });
});

// POST /admin/providers/api
router.post('/api', async (req, res) => {
    try {
        const { name, type, baseUrl, extraHeaders, keyRotationStrategy } = req.body;
        if (!name || !type || !baseUrl) {
            return res.status(400).json({ success: false, message: 'Tên, loại và Base URL là bắt buộc' });
        }
        const provider = await AIProvider.create({
            name,
            type,
            baseUrl,
            extraHeaders: extraHeaders || {},
            keyRotationStrategy: keyRotationStrategy || 'sequential'
        });
        res.json({ success: true, data: provider });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /admin/providers/api/:id
router.put('/api/:id', async (req, res) => {
    try {
        const { name, type, baseUrl, extraHeaders, keyRotationStrategy, isActive } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (type !== undefined) updates.type = type;
        if (baseUrl !== undefined) updates.baseUrl = baseUrl;
        if (extraHeaders !== undefined) updates.extraHeaders = extraHeaders;
        if (keyRotationStrategy !== undefined) updates.keyRotationStrategy = keyRotationStrategy;
        if (isActive !== undefined) updates.isActive = isActive;

        const provider = await AIProvider.findByIdAndUpdate(req.params.id, updates, { new: true });
        if (!provider) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        providerKeyManager.invalidateCache(provider._id);
        res.json({ success: true, data: provider });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /admin/providers/api/:id
router.delete('/api/:id', async (req, res) => {
    try {
        const inUse = await ModelConfig.exists({ providerId: req.params.id });
        if (inUse) {
            return res.status(400).json({ success: false, message: 'Không thể xoá: vẫn còn Model AI đang gắn với Provider này' });
        }
        await AIProvider.findByIdAndDelete(req.params.id);
        await ProviderApiKey.deleteMany({ providerId: req.params.id });
        providerKeyManager.invalidateCache(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// GET /admin/providers/api/:id/keys
router.get('/api/:id/keys', async (req, res) => {
    try {
        const keys = await ProviderApiKey.find({ providerId: req.params.id }).sort({ createdAt: -1 }).lean();
        res.json({ success: true, data: keys });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// POST /admin/providers/api/:id/keys
router.post('/api/:id/keys', async (req, res) => {
    try {
        const { name, key } = req.body;
        if (!name || !key) {
            return res.status(400).json({ success: false, message: 'Tên và API Key là bắt buộc' });
        }
        const providerKey = await ProviderApiKey.create({ providerId: req.params.id, name, key });
        providerKeyManager.invalidateCache(req.params.id);
        res.json({ success: true, data: providerKey });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /admin/providers/api/:id/keys/:keyId
router.put('/api/:id/keys/:keyId', async (req, res) => {
    try {
        const { name, key, isActive } = req.body;
        const updates = {};
        if (name !== undefined) updates.name = name;
        if (key !== undefined) updates.key = key;
        if (isActive !== undefined) updates.isActive = isActive;

        const providerKey = await ProviderApiKey.findOneAndUpdate(
            { _id: req.params.keyId, providerId: req.params.id },
            updates,
            { new: true }
        );
        if (!providerKey) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
        providerKeyManager.invalidateCache(req.params.id);
        res.json({ success: true, data: providerKey });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /admin/providers/api/:id/keys/:keyId
router.delete('/api/:id/keys/:keyId', async (req, res) => {
    try {
        await ProviderApiKey.findOneAndDelete({ _id: req.params.keyId, providerId: req.params.id });
        providerKeyManager.invalidateCache(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
