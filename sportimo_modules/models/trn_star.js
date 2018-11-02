'use strict';

const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

if (mongoose.models.trn_stars)
    module.exports = mongoose.models.trn_stars;
else {

    const titleSchema = new mongoose.Schema({
        iconUrl: { type: String },
        date: { type: String },
        text: { type: Schema.Types.Mixed }
    });


    const userSchema = new mongoose.Schema({
        rank: { type: Number },
        user: { type: String, ref: 'users', required: true },
        titles: [titleSchema]
    });

    const starSchema = new Schema({
        // New fields
        client: { type: String, ref: 'clients' },
        tournament: { type: String, ref: 'tournaments' },

        users: [userSchema]
    });

    module.exports = mongoose.model('trn_stars', starSchema);
}