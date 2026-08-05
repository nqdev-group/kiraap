const morgan = require('morgan');
const logger = require('./index.js');

// Format tối giản, không có mã màu ANSI (morgan('dev') tô màu cứng vào chuỗi
// message bất kể stream đích là gì) — để log ghi ra file JSON không lẫn ký tự rác.
const httpLogger = morgan(':method :url :status :response-time ms', {
    stream: {
        write: (message) => logger.http(message.trim())
    }
});

module.exports = httpLogger;
