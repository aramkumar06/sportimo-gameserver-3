'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

if (mongoose.models.trn_leaderboard_defs)
    module.exports = mongoose.models.trn_leaderboard_defs;
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

        tournament_match: { type: ObjectId, ref: 'trn_matches' },   // optional if bound to one specific match (not on a whole tournament)
        match: { type: Schema.Types.ObjectId, ref: 'matches' },     // optional if bound to one specific match (not on a whole tournament)

        title: { type: Schema.Types.Mixed },
        info: { type: Schema.Types.Mixed },

        active: { type: Boolean, default: true },

        // The number of best scores per user. If null leaderboard is comprised by all user scores.  
        bestscores: Number,

        prizes: [{ type: leaderboardPrizeSchema }],

        // conditions: [{ condition: "Country", value:["GR","UK","SA"]}, {condition: "Age", value:["17"]}]
        country: [{ type: String }],

        starsProcessed: { type: Boolean, default: false },  // used in the automated stars update method to denote whether this document is already taken into account

        created: { type: Date, default: Date.now }
    };

    var leaderboardDefSchema = new Schema(leaderboarddef);

    module.exports = mongoose.model('trn_leaderboard_defs', leaderboardDefSchema);
}
