'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;


if (mongoose.models.trn_playerstats)
    module.exports = mongoose.models.trn_playerstats;
else {
    var playerStats = {
        competition: { type: ObjectId, ref: 'competitions' },
        season: { type: Schema.Types.Mixed },
        team: { type: ObjectId, ref: 'trn_teams' },
        player: { type: ObjectId, ref: 'trn_players' },

        stats: {
            type: Schema.Types.Mixed,
            default: {
                "suspensions": 0,
                "overtimeAssists": 0,
                "overtimeGoals": 0,
                "overtimeShots": 0,
                "attacks": 0,
                "tackles": 0,
                "touchesBlocks": 0,
                "touchesInterceptions": 0,
                "touchesPasses": 0,
                "touchesTotal": 0,
                "goalMouthBlocks": 0,
                "clears": 0,
                "cornerKicks": 0,
                "offsides": 0,
                "redCards": 0,
                "yellowCards": 0,
                "foulsSuffered": 0,
                "foulsCommitted": 0,
                "penaltyKicksGoals": 0,
                "penaltyKicksShots": 0,
                "crosses": 0,
                "shotsOnGoal": 0,
                "shots": 0,
                "assistsGameWinning": 0,
                "assistsTotal": 0,
                "goalsKicked": 0,
                "goalsHeaded": 0,
                "goalsOwn": 0,
                "goalsGameWinning": 0,
                "goalsTotal": 0,
                "minutesPlayed": 0,
                "gamesStarted": 0,
                "gamesPlayed": 0
            }
        },

        created: { type: Date, default: Date.now },
        updated: { type: Date }
    };
    
    var playerStatsSchema = new Schema(playerStats);
    
    module.exports = mongoose.model('trn_playerstats', playerStatsSchema);
}