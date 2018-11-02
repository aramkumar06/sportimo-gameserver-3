'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.tournaments)
    module.exports = mongoose.models.tournaments;
else {
    var tournament = {
        client: { type: String, ref: 'trn_clients', required: true },
        promoImage: { type: String },
        aboutText: { type: Schema.Types.Mixed },
        howToParticipateText: { type: Schema.Types.Mixed },
        howToPlayText: { type: Schema.Types.Mixed },
        termsAndConditionsText: { type: Schema.Types.Mixed },
        joinFromDate: { type: Date },
        joinUntilDate: { type: Date },
        state: { type: String, enum: ['deleted', 'scheduled', 'active', 'completed'] },
        subscriptionPolicy: { type: String, enum: ['free', 'goldTickets'] },
        leaderboardDefinition: { type: String, ref: 'pools' },
        created: { type: Date, default: Date.now },
        updated: { type: Date, default: Date.now }
    };

    var tournamentSchema = new Schema(tournament);

    module.exports = mongoose.model('tournaments', tournamentSchema);
}