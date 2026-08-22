require('dotenv').config();
const { MongoClient } = require('mongodb');
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;
const client = new MongoClient(uri);

let db;

async function connectDB() {
    if (db) return db; // already connected
    await client.connect();
    db = client.db("lorenzo");
    console.log("Connected to MongoDB");

    // Also connect mongoose, since some modules (e.g. infractionManager) use it
    if (mongoose.connection.readyState === 0) {
        await mongoose.connect(uri);
        console.log("Mongoose connected");
    }

    return db;
}

function getDB() {
    if (!db) throw new Error("Database not connected yet — call connectDB() first.");
    return db;
}

module.exports = { connectDB, getDB };