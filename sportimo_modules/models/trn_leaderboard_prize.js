'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

if (mongoose.models.trn_leaderboard_prizes)
    module.exports = mongoose.models.trn_leaderboard_prizes;
else {
    var positionType = new Schema({
        from: { type: Number, default: 1, required: true },
        to: { type: Number, default: null, required: false }
    });

    var leaderboardPrizeSchema = new Schema({
        position: { type: positionType },
        prize: { type: ObjectId, ref: 'trn_prizes', required: true }
    });

    module.exports = leaderboardPrizeSchema;
}
