require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;

mongoose.connect(uri)
.then(async () => {
    console.log("Connected to DB. Clearing ALL applications...");
    const result = await mongoose.connection.collection('applications').deleteMany({});
    console.log("Deleted count:", result.deletedCount);
    process.exit(0);
})
.catch(err => {
    console.error(err);
    process.exit(1);
});
