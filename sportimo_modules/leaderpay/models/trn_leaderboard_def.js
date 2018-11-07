'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

if (mongoose.models.trn_leaderboard_defs)
    module.exports = mongoose.models.trn_leaderboard_defs;
else {

    var prizeSchema = new Schema({
        rank: { type: Number, min: 0 },
        rank_from: { type: Number, min: 0 },
        rank_to: { type: Number, min: 0 },
        prize: { type: Schema.Types.ObjectId, ref: 'prizes' }
    });

    var leaderboarddef = {

        // New fields
        client: { type: ObjectId, ref: 'trn_clients' },
        tournament: { type: ObjectId, ref: 'tournaments' },
        tournament_match: { type: ObjectId, ref: 'trn_matches' },  // optional if bound to one specific match (not on a whole tournament)

        title: { type: Schema.Types.Mixed },
        info: { type: Schema.Types.Mixed },

        active: { type: Boolean, default: true },

        // The number of best scores per user. If null leaderboard is comprised by all user scores.  
        bestscores: Number,

        prizes: [{ type: prizeSchema }],

        // conditions: [{ condition: "Country", value:["GR","UK","SA"]}, {condition: "Age", value:["17"]}]
        country: [{ type: String }],

        created: { type: Date, default: Date.now }
    };

    var leaderboardDefSchema = new Schema(leaderboarddef);

    module.exports = mongoose.model('trn_leaderboard_defs', leaderboardDefSchema);
}
