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
        settings: {
            goldTicketRewards: [goldTicketRewardSchema],
            pushNotifications: {
                E1: Boolean,
                E2: Boolean,
                R1: Boolean,
                R2: Boolean,
                R3: Boolean,
                R4: Boolean,
                E6: Boolean,
                G1: Boolean,
                G2: Boolean,
                G3: Boolean,
                G4: Boolean,
                G5: Boolean,
                G6: Boolean,
                G7: Boolean,
                G8: Boolean
            }
        },
        created: { type: Date, default: Date.now },
        updated: { type: Date, default: Date.now }
    };

    var clientSchema = new Schema(client);

    module.exports = mongoose.model('trn_clients', clientSchema);
}