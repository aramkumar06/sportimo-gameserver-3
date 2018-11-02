'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.trn_playerstats)
    module.exports = mongoose.models.trn_playerstats;
else {
    var playerStats = {
        player: { type: Schema.Types.ObjectId, ref: 'trn_players' },
        team: { type: Schema.Types.ObjectId, ref: 'trn_teams' },
        competition: { type: Schema.Types.ObjectId, ref: 'competitions' },


        created: { type: Date, default: Date.now },
        updated: { type: Date }
    };
    
    var playerStatsSchema = new Schema(playerStats);
    
    module.exports = mongoose.model('trn_playerstats', playerStatsSchema);
}