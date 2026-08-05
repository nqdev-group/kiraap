const path = require('path');
const winston = require('winston');
require('winston-daily-rotate-file');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const isProduction = process.env.NODE_ENV === 'production';
const level = process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug');

const consoleFormat = isProduction
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
            const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
            return `${timestamp} ${level}: ${message}${extra}`;
        })
    );

const fileFormat = winston.format.combine(winston.format.timestamp(), winston.format.json());

const logger = winston.createLogger({
    level,
    format: fileFormat,
    transports: [
        new winston.transports.Console({ format: consoleFormat }),
        new winston.transports.DailyRotateFile({
            dirname: LOG_DIR,
            filename: 'combined-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '7d'
        }),
        new winston.transports.DailyRotateFile({
            dirname: LOG_DIR,
            filename: 'error-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '7d',
            level: 'error'
        })
    ],
    exceptionHandlers: [
        new winston.transports.DailyRotateFile({
            dirname: LOG_DIR,
            filename: 'exceptions-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '7d'
        })
    ],
    rejectionHandlers: [
        new winston.transports.DailyRotateFile({
            dirname: LOG_DIR,
            filename: 'rejections-%DATE%.log',
            datePattern: 'YYYY-MM-DD',
            maxFiles: '7d'
        })
    ]
});

module.exports = logger;
