'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;


if (mongoose.models.trn_teamstats)
    module.exports = mongoose.models.trn_teamstats;
else {
    var teamStats = {
        team: { type: ObjectId, ref: 'trn_teams' },
        competition: { type: ObjectId, ref: 'trn_competitions' },
        season: { type: ObjectId, ref: 'trn_competition_seasons' },

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
        stats: {
            type: Schema.Types.Mixed,
            default: {
                "Own_Goal": 0,
                "gamesPlayed": 0,
                "Goal": 0,
                "Shot_On_Goal": 0,
                "Crosses": 0,
                "Penalty": 0,
                "Foul": 0,
                "Yellow": 0,
                "Red": 0,
                "Offside": 0,
                "Corner": 0,
                "Clear": 0
            }
        },
        topscorer: { type: ObjectId, ref: 'trn_players' },
        topassister: { type: ObjectId, ref: 'trn_players' },

        created: { type: Date, default: Date.now },
        updated: { type: Date }
    };
    
    var teamStatsSchema = new Schema(teamStats);
    
    module.exports = mongoose.model('trn_teamstats', teamStatsSchema);
}