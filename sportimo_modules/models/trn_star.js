'use strict';

const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

if (mongoose.models.trn_stars)
    module.exports = mongoose.models.trn_stars;
else {

    const titleSchema = new mongoose.Schema({
        pool: { type: String, ref: 'pool' },
        iconUrl: { type: String },
        date: { type: String }, // string representation of endDate formatted as dd/MM/YYYY
        endDate: { type: Date },
        text: { type: Schema.Types.Mixed }
    });


    const userSchema = new mongoose.Schema({
        client: { type: String, ref: 'clients' },
        //tournament: { type: String, ref: 'tournaments' },
        rank: { type: Number },
        user: { type: String, ref: 'users', required: true },
        starsCount: { type: Number, default: 0 },
        lastStarDate: { type: Date },
        titles: [titleSchema]
    });

    module.exports = mongoose.model('trn_stars', userSchema);
}