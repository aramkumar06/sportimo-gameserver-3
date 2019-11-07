'use strict';

const mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

if (mongoose.models.trnKnockoutStandings)
    module.exports = mongoose.models.trnKnockoutStandings;
else {

    const matchEvent = new mongoose.Schema({
        home_team: {
            _id: { type: String, required: false },
            name: { type: Schema.Types.Mixed, required: true },
            logo: { type: String }
        },
        away_team: {
            _id: { type: String, required: false },
            name: { type: Schema.Types.Mixed, required: true },
            logo: { type: String }
        },
        start: Date,
        name: String,   // a match name generated from team names, mainly for tracing and debugging reasons
        home_score: { type: Number, default: 0 },
        away_score: { type: Number, default: 0 },
        venue: { type: Schema.Types.Mixed }
    });


    const knockoutStandingRound = new mongoose.Schema({
        name: { type: Schema.Types.Mixed, required: true },
        parserids: { type: Schema.Types.Mixed },
        events: [matchEvent]
    });


    const trnKnockoutStanding = new Schema({
        parser: { type: String, required: false },
        season: { type: ObjectId, ref: 'trn_competition_seasons', required: true },
        competition: { type: ObjectId, ref: 'trn_competitions' },
        rounds: [knockoutStandingRound]
    });

    module.exports = mongoose.model('trn_team_standing_knockouts', trnKnockoutStanding);
}