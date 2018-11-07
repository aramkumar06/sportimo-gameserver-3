'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


var eventstat = new Schema({
    home_team: { type: String, ref: 'trn_teams' },
    away_team: { type: String, ref: 'trn_teams' },
    start: { type: Date },
    homescore: 0,
    awayscore: 0
});

if (mongoose.models.trn_teams)
    module.exports = mongoose.models.trn_teams;
else {
    var team = {
        name: { type: Schema.Types.Mixed },
        abbr: { type: String },
        logo: { type: String },
        color: { type: String },
        stats: { type: Schema.Types.Mixed },
        parserids: { type: Schema.Types.Mixed },
        leagueids: { type: Schema.Types.Mixed },
        created: { type: Date, default: Date.now },
        updated: { type: Date },

        players: [{ type: Schema.Types.ObjectId, ref: 'trn_players' }],
        shortname: { type: Schema.Types.Mixed }
    };

    var teamSchema = new Schema(team);

    module.exports = mongoose.model('trn_teams', teamSchema);
}
