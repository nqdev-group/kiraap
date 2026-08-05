const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const AIProvider = require('../models/AIProvider.js');
const providerKeyManager = require('./providerKeyManager.js');
const providerAdapters = require('./providerAdapters/index.js');
const tokenCounter = require('#server/services/tokenCounter.js');
const Media = require('#server/models/Media.js');

/**
 * Bridge gọi từ server/services/agentPlatform.js sang Custom AI Provider
 * (OpenAI/Anthropic compatible) khi model.providerId có giá trị.
 * Toàn bộ logic nghiệp vụ của tính năng Custom AI Provider nằm ở đây và trong
 * package này — agentPlatform.js chỉ giữ 1 điều kiện + 1 lời gọi mỗi hàm.
 */

async function resolveProvider(model) {
    const provider = await AIProvider.findById(model.providerId).lean();
    if (!provider || !provider.isActive) {
        throw new Error('Provider AI không tồn tại hoặc đã bị tắt');
    }
    const keyInfo = await providerKeyManager.getNextKey(provider._id, provider.keyRotationStrategy);
    const adapter = providerAdapters[provider.type];
    if (!adapter) {
        throw new Error(`Loại Provider "${provider.type}" chưa được hỗ trợ`);
    }
    return { provider, keyInfo, adapter };
}

/**
 * Sinh text qua Custom AI Provider, không stream
 */
async function generateText({ prompt, history, systemPrompt, model, user, startTime }) {
    const { keyInfo, adapter, provider } = await resolveProvider(model);
    try {
        const result = await adapter.generateText({ prompt, history, systemPrompt, provider, keyInfo, model });
        const responseTime = Date.now() - startTime;

        if (user) {
            tokenCounter.logUsage({
                userId: user._id || user.id,
                username: user.username,
                modelUsed: model.modelId,
                category: 'text',
                prompt: prompt?.substring(0, 1000),
                responseContent: result.text?.substring(0, 2000),
                tokenInput: result.tokenInput,
                tokenOutput: result.tokenOutput,
                apiKeyName: keyInfo.name,
                responseTime,
                status: 'success'
            });
        }

        return {
            text: result.text,
            modelUsed: model.modelId,
            tokenInput: result.tokenInput,
            tokenOutput: result.tokenOutput,
            responseTime
        };
    } catch (error) {
        await providerKeyManager.markKeyError(keyInfo._id, error.message);
        if (user) {
            tokenCounter.logUsage({
                userId: user._id || user.id,
                username: user.username,
                modelUsed: model.modelId,
                category: 'text',
                prompt: prompt?.substring(0, 500),
                apiKeyName: keyInfo.name,
                responseTime: Date.now() - startTime,
                status: 'error',
                errorMessage: error.message
            });
        }
        throw error;
    }
}

/**
 * Sinh text stream (SSE) qua Custom AI Provider
 */
async function generateTextStream({ prompt, history, systemPrompt, model, user }) {
    const { keyInfo, adapter, provider } = await resolveProvider(model);
    try {
        const { stream } = await adapter.generateTextStream({ prompt, history, systemPrompt, provider, keyInfo, model });
        return {
            stream,
            modelUsed: model.modelId,
            apiKeyName: keyInfo.name,
            userId: user?._id || user?.id,
            username: user?.username
        };
    } catch (error) {
        await providerKeyManager.markKeyError(keyInfo._id, error.message);
        throw error;
    }
}

/**
 * Tạo ảnh qua Custom AI Provider (chỉ type 'openai' hỗ trợ ảnh — Anthropic không có API ảnh)
 */
async function generateImage({ prompt, aspectRatio, model, user, startTime }) {
    const { keyInfo, adapter, provider } = await resolveProvider(model);
    if (!adapter.generateImage) {
        throw new Error(`Provider loại "${provider.type}" không hỗ trợ tạo ảnh`);
    }
    try {
        const result = await adapter.generateImage({ prompt, aspectRatio, provider, keyInfo, model });

        const ext = result.mimeType === 'image/png' ? 'png' : 'jpg';
        const fileName = `img_${uuidv4()}.${ext}`;
        const filePath = path.join('uploads', 'images', fileName);
        const absolutePath = path.join(__dirname, '..', '..', '..', 'public', filePath);

        const buffer = Buffer.from(result.data, 'base64');
        fs.writeFileSync(absolutePath, buffer);

        const fileSize = buffer.length;
        const responseTime = Date.now() - startTime;

        if (user) {
            await Media.create({
                userId: user._id || user.id,
                type: 'image',
                filePath: '/' + filePath,
                fileName,
                originalName: fileName,
                fileSize,
                mimeType: result.mimeType,
                prompt: prompt?.substring(0, 500),
                modelUsed: model.modelId
            });

            tokenCounter.logUsage({
                userId: user._id || user.id,
                username: user.username,
                modelUsed: model.modelId,
                category: 'image',
                prompt: prompt?.substring(0, 1000),
                responseContent: '/' + filePath,
                tokenInput: result.tokenInput,
                tokenOutput: result.tokenOutput,
                apiKeyName: keyInfo.name,
                responseTime,
                status: 'success'
            });
        }

        return {
            imageUrl: '/' + filePath,
            mimeType: result.mimeType,
            textResponse: result.textResponse || '',
            modelUsed: model.modelId,
            tokenInput: result.tokenInput,
            tokenOutput: result.tokenOutput,
            responseTime
        };
    } catch (error) {
        await providerKeyManager.markKeyError(keyInfo._id, error.message);
        if (user) {
            tokenCounter.logUsage({
                userId: user._id || user.id,
                username: user.username,
                modelUsed: model.modelId,
                category: 'image',
                prompt: prompt?.substring(0, 500),
                apiKeyName: keyInfo.name,
                responseTime: Date.now() - startTime,
                status: 'error',
                errorMessage: error.message
            });
        }
        throw error;
    }
}

module.exports = { generateText, generateTextStream, generateImage };
