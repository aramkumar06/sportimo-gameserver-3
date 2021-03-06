﻿'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;


if (mongoose.models.tournaments)
    module.exports = mongoose.models.tournaments;
else {
    var tournament = {
        client: { type: ObjectId, ref: 'trn_clients', required: true },
        promoImage: { type: String },
        promoDetailImage: { type: String },
        infoImage: { type: String },
        //aboutText: { type: Schema.Types.Mixed },
        //howToParticipateText: { type: Schema.Types.Mixed },
        //howToPlayText: { type: Schema.Types.Mixed },
        //termsAndConditionsText: { type: Schema.Types.Mixed },
        titleText: { type: Schema.Types.Mixed },
        infoText: { type: Schema.Types.Mixed },
        detailText: { type: Schema.Types.Mixed },
        discountText: { type: String },
        startFromDate: { type: Date },
        endToDate: { type: Date },
        state: { type: String, enum: ['deleted', 'scheduled', 'active', 'completed'] },
        subscriptionPrice: { type: Number },    // in Golden Tickets
        //subscriptionPolicy: { type: String, enum: ['free', 'goldTickets'] },
        leaderboardDefinition: { type: ObjectId, ref: 'trn_leaderboard_defs' },
        settings: { type: Schema.Types.Mixed },
        // Cached numeric Properties
        matches: { type: Number, default: 0 },  // tournament matches under the tournament
        participations: { type: Number, default: 0 },   // number of user participations (having played at least 1 card) in tournament matches
        // Audit properties (timestamps)
        created: { type: Date, default: Date.now },
        updated: { type: Date, default: Date.now }
    };

    var tournamentSchema = new Schema(tournament);

    module.exports = mongoose.model('tournaments', tournamentSchema);
}