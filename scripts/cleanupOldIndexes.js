const mongoose = require('mongoose');
require('dotenv').config();

async function cleanupOldIndexes() {
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

        // Drop problematic indexes
        const indexesToDrop = [
            'documents.license.number_1',
            'documents.insurance.number_1',
            'documents.vehicleRegistration.number_1',
            'license.number_1',
            'vehicleDetails.licensePlate_1',
            'status_1_lastActive_-1',
            'status_1',
            'fullname.firstname_1_fullname.lastname_1',
            'createdAt_-1',
            'location.coordinates_2dsphere'
        ];

        for (const indexName of indexesToDrop) {
            try {
                await captainsCollection.dropIndex(indexName);
                console.log(`Dropped index: ${indexName}`);
            } catch (err) {
                console.log(`Could not drop index ${indexName}:`, err.message);
            }
        }

        // Keep only essential indexes
        await captainsCollection.createIndex({ email: 1 }, { unique: true });
        await captainsCollection.createIndex({ 'vehicle.plate': 1 }, { unique: true });
        await captainsCollection.createIndex({ location: '2dsphere' });

        // List final indexes
        const finalIndexes = await captainsCollection.indexes();
        console.log('\nFinal indexes:', JSON.stringify(finalIndexes, null, 2));

    } catch (error) {
        console.error('Error:', error);
    } finally {
        // Close the connection
        await mongoose.connection.close();
        console.log('\nMongoDB connection closed');
    }
}

// Run the script
cleanupOldIndexes(); 