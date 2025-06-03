const mongoose = require('mongoose');
require('dotenv').config();

async function checkDatabase() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Get the captains collection
        const db = mongoose.connection.db;
        const captainsCollection = db.collection('captains');

        // List all current indexes
        const indexes = await captainsCollection.indexes();
        console.log('\nCurrent indexes:', JSON.stringify(indexes, null, 2));

        // Count documents
        const count = await captainsCollection.countDocuments();
        console.log('\nTotal documents:', count);

        // List all documents
        const documents = await captainsCollection.find({}).toArray();
        console.log('\nAll documents:', JSON.stringify(documents, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('\nMongoDB connection closed');
    }
}

// Run the script
checkDatabase(); 