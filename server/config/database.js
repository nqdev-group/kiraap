const mongoose = require('mongoose');
const { connectWithRetry } = require('@packages/mongo-connect-retry/index.js');

const connectDB = () => connectWithRetry(mongoose, process.env.MONGODB_URI);

module.exports = connectDB;
