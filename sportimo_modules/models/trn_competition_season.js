'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;


if (mongoose.models.trn_competition_seasons)
    module.exports = mongoose.models.trn_competition_seasons;
else {
    var competitionSeason = {

        competition: { type: ObjectId, ref: 'trn_competitions' },
        //visiblein: [String],
        name: { type: Schema.Types.Mixed },

        startDate: { type: Date },
        startYear: { type: Number },
        endYear: { type: Number },
        status: { type: String, enum: ['Active', 'Disabled'] },

        teams: [{ type: ObjectId, ref: 'trn_teams' }],
        parserids: { type: Schema.Types.Mixed },

        created: { type: Date, default: Date.now }
    };

    var competitionSeasonSchema = new Schema(competitionSeason);

    module.exports = mongoose.model('trn_competition_seasons', competitionSeasonSchema);
}