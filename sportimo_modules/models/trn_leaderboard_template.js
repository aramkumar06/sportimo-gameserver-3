'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

if (mongoose.models.trn_leaderboard_templates)
    module.exports = mongoose.models.trn_leaderboard_templates;
else {

    var positionType = new Schema({
        from: { type: Number, default: 1, required: true },
        to: { type: Number, default: null, required: false }
    });

    var leaderboardPrizeSchema = new Schema({
        position: { type: positionType },
        prize: { type: ObjectId, ref: 'trn_prizes', required: true }
    });

    var leaderboarddef = {

        // New fields
        client: { type: ObjectId, ref: 'trn_clients' },
        tournament: { type: ObjectId, ref: 'tournaments' },

        title: { type: Schema.Types.Mixed },
        info: { type: Schema.Types.Mixed },

        // The number of best scores per user. If null leaderboard is comprised by all user scores.  
        bestscores: Number,

        prizes: [{ type: leaderboardPrizeSchema }],

        created: { type: Date, default: Date.now }
    };

    var leaderboardDefSchema = new Schema(leaderboarddef);

    module.exports = mongoose.model('trn_leaderboard_templates', leaderboardDefSchema);
}
