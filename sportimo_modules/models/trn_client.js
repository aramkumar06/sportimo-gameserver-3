'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.trn_clients)
    module.exports = mongoose.models.trn_clients;
else {
    const goldTicketRewardSchema = new Schema({
        position: {
            from: Number,
            to: Number
        },
        goldTickets: Number
    });

    var client = {
        name: { type: Schema.Types.Mixed },
        description: { type: Schema.Types.Mixed },
        contactAddress: { type: String },
        logo: { type: String },
        promoText: { type: Schema.Types.Mixed },
        settings: { type: Schema.Types.Mixed },
        //settings: {
        //    goldTicketRewards: [goldTicketRewardSchema],
        //    sendPushes: { type: Boolean, default: true },
        //    pushNotifications: {
        //        E1: { type: Boolean, default: true },
        //        E2: { type: Boolean, default: true },
        //        R1: { type: Boolean, default: true },
        //        R2: { type: Boolean, default: true },
        //        R3: { type: Boolean, default: true },
        //        R4: { type: Boolean, default: true },
        //        E6: { type: Boolean, default: true },
        //        G1: { type: Boolean, default: true },
        //        G2: { type: Boolean, default: true },
        //        G3: { type: Boolean, default: true },
        //        G4: { type: Boolean, default: true },
        //        G5: { type: Boolean, default: true },
        //        G6: { type: Boolean, default: true },
        //        G7: { type: Boolean, default: true },
        //        G8: { type: Boolean, default: true }
        //    },
        //    matchRules: {
        //        freeUserCardsLimit: { type: Number },
        //        freeUserCardsCap: { type: Boolean },
        //        freeUserAdsToGetCards: { type: Boolean },
        //        freeUserLiveTimeWindow: { type: Number },
        //        freeUserPregameTimeWindow: { type: Number },
        //        freeUserHasPlayTimeWindow: { type: Boolean },
        //        freeUserPlaySegments: [Number]
        //    },
        //    gameCards: {
        //        totalcards: { type: Number },
        //        specials: { type: Number },
        //        overall: { type: Number },
        //        instant: { type: Number }
        //    }
        //},
        created: { type: Date, default: Date.now },
        updated: { type: Date, default: Date.now }
    };

    var clientSchema = new Schema(client);

    module.exports = mongoose.model('trn_clients', clientSchema);
}