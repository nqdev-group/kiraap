const express = require('express');
const router = express.Router();
const auth = require('../../middleware/auth');
const adminOnly = require('../../middleware/adminOnly');
const ModelConfig = require('../../models/ModelConfig');
const { getActiveProviders, normalizeProviderId } = require('@packages/ai-providers/services/modelConfigHelpers.js');

router.use(auth, adminOnly);

// GET /admin/models
router.get('/', async (req, res) => {
    const models = await ModelConfig.find().sort({ category: 1, createdAt: -1 }).lean();
    const grouped = { text: [], image: [], video: [], tts: [] };
    models.forEach(m => { if (grouped[m.category]) grouped[m.category].push(m); });
    const providers = await getActiveProviders();
    res.render('admin/models', { pageTitle: 'Mô hình AI', activePage: 'models', adminUser: req.user, models: grouped, providers });
});

// POST /admin/models/api
router.post('/api', async (req, res) => {
    try {
        const { category, modelId, displayName, systemPrompt, isDefault, parameters, providerId } = req.body;
        if (!category || !modelId || !displayName) {
            return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
        }
        const model = await ModelConfig.create({ category, modelId, displayName, systemPrompt, isDefault, parameters: parameters || {}, providerId: providerId || null });
        res.json({ success: true, data: model });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// PUT /admin/models/api/:id
router.put('/api/:id', async (req, res) => {
    try {
        const updates = normalizeProviderId(req.body);
        const model = await ModelConfig.findById(req.params.id);
        if (!model) return res.status(404).json({ success: false, message: 'Không tìm thấy' });

        Object.assign(model, updates);
        await model.save();
        res.json({ success: true, data: model });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// DELETE /admin/models/api/:id
router.delete('/api/:id', async (req, res) => {
    try {
        await ModelConfig.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

module.exports = router;
