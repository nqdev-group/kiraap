// Kết nối MongoDB đôi khi bị "Socket 'connect' timed out" do chập chờn VPN
// ngắn hạn tới máy chủ tự host — thử lại vài lần trước khi coi là lỗi thật.
const logger = require('@packages/logger/index.js');

const MAX_RETRIES = 5;
const RETRY_DELAYS_MS = [2000, 4000, 6000, 8000];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectWithRetry = async (mongoose, uri) => {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const conn = await mongoose.connect(uri);
            logger.info(`✅ MongoDB đã kết nối: ${conn.connection.host}`);
            return;
        } catch (error) {
            logger.error(`❌ Lỗi kết nối MongoDB (lần ${attempt}/${MAX_RETRIES}): ${error.message}`);

            if (attempt === MAX_RETRIES) {
                process.exit(1);
            }

            const delay = RETRY_DELAYS_MS[attempt - 1];
            logger.warn(`⏳ Thử kết nối lại MongoDB sau ${delay / 1000}s...`);
            await sleep(delay);
        }
    }
};

module.exports = { connectWithRetry };
