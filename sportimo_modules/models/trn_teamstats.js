'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.trn_teamstats)
    module.exports = mongoose.models.trn_teamstats;
else {
    var teamStats = {
        team: { type: Schema.Types.ObjectId, ref: 'trn_teams' },
        competition: { type: Schema.Types.ObjectId, ref: 'competitions' },

        recentform: [String], // an array of String of type "W","L","D"
        nextmatch: Schema.Types.Mixed,
        lastmatch: Schema.Types.Mixed,
        standing: {
            type: Schema.Types.Mixed, default: {
                "rank": 0,
                "points": 0,
                "pointsPerGame": "0",
                "penaltyPoints": 0,
                "wins": 0,
                "losses": 0,
                "ties": 0,
                "gamesPlayed": 0,
                "goalsFor": 0,
                "goalsAgainst": 0
            }
        },
        topscorer: { type: Schema.Types.ObjectId, ref: 'trn_players' },
        topassister: { type: Schema.Types.ObjectId, ref: 'trn_players' },

        created: { type: Date, default: Date.now },
        updated: { type: Date }
    };
    
    var teamStatsSchema = new Schema(teamStats);
    
    module.exports = mongoose.model('trn_teamstats', teamStatsSchema);
}