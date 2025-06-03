const mongoose = require('mongoose');
require('dotenv').config();

async function resetCaptains() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Get the captains collection
        const db = mongoose.connection.db;
        const captainsCollection = db.collection('captains');

        // Delete all documents
        await captainsCollection.deleteMany({});
        console.log('Deleted all captains');

        // Drop all indexes
        await captainsCollection.dropIndexes();
        console.log('Dropped all indexes');

        // Create fresh indexes
        await captainsCollection.createIndex({ email: 1 }, { unique: true });
        await captainsCollection.createIndex({ 'vehicle.plate': 1 }, { unique: true });
        await captainsCollection.createIndex({ location: '2dsphere' });
        console.log('Created fresh indexes');

        // Verify the cleanup
        const count = await captainsCollection.countDocuments();
        const indexes = await captainsCollection.indexes();
        console.log('\nCurrent document count:', count);
        console.log('\nCurrent indexes:', JSON.stringify(indexes, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('\nMongoDB connection closed');
    }
}

// Run the script
resetCaptains(); 