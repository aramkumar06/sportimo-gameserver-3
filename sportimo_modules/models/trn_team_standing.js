'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

if (mongoose.models.trn_team_standings)
    module.exports = mongoose.models.trn_team_standings;
else {

    var group = new mongoose.Schema({
        name: { type: Schema.Types.Mixed, required: true },
        parserids: { type: Schema.Types.Mixed },
        teams: [{ type: Schema.Types.Mixed }]
    });


    var standing = {
        competition: { type: ObjectId, ref: 'trn_competitions' },   // part of collection identity
        season: { type: ObjectId, ref: 'trn_competition_seasons' }, // part of collection identity
        parser: { type: String },   // keeps the last parser that produced the document, not part of collection identity
        name: { type: Schema.Types.Mixed, required: true },
        teams: [{ type: Schema.Types.Mixed }],
        groups: [group],        // filled-in in the case of muti-stage competitions (cups) instead of the teams property
        visiblein: [String],
        created: {type:Date, default:Date.now},
        lastupdate: {type:Date, default:Date.now}
    };
    
    var standingSchema = new Schema(standing);
    
    standingSchema.index({ competitionid: 1, season: 1}, { unique: true });

    
    module.exports = mongoose.model('trn_team_standings', standingSchema);
}