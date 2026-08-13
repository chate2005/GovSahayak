require('dotenv').config();
const mongoose = require('mongoose');

const uri = process.env.MONGO_URI;

mongoose.connect(uri)
.then(async () => {
    const db = mongoose.connection.collection('applications');
    const apps = await db.find({}).sort({ createdAt: -1 }).toArray();
    console.log(JSON.stringify(apps[0], null, 2));
    process.exit(0);
})
.catch(err => {
    console.error(err);
    process.exit(1);
});
