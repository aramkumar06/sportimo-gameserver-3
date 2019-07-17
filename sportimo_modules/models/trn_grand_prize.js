'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

if (mongoose.models.trn_grand_prizes)
    module.exports = mongoose.models.trn_grand_prizes;
else {

    var prizeSchema = require('./trn_leaderboard_prize');

    var grandPrizeDef = {

        // New fields
        client: { type: ObjectId, ref: 'trn_clients', required: true },

        titleText: { type: Schema.Types.Mixed },
        infoText: { type: Schema.Types.Mixed },

        promoImage: { type: String },

        startFromDate: { type: Date },
        endToDate: { type: Date },


        active: { type: Boolean, default: true },

        // The number of best scores per user. If null leaderboard is comprised by all user scores.  
        bestscores: { type: Number, default: 0 },

        prizes: [prizeSchema],

        starsProcessed: { type: Boolean, default: false },  // used in the automated stars update method to denote whether this document is already taken into account

        created: { type: Date, default: Date.now }
    };

    var grandPrizeDefSchema = new Schema(grandPrizeDef);

    module.exports = mongoose.model('trn_grand_prizes', grandPrizeDefSchema);
}
