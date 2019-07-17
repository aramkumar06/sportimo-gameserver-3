'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

if (mongoose.models.trn_leaderboard_defs)
    module.exports = mongoose.models.trn_leaderboard_defs;
else {

    var leaderboardPrizeSchema = require('./trn_leaderboard_prize');
    
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

    module.exports = mongoose.model('trn_leaderboard_defs', leaderboardDefSchema);
}
