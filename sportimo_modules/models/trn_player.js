'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.trn_players)
    module.exports = mongoose.models.trn_players;
else {
    var player = {
        name: { type: Schema.Types.Mixed },
        pic: { type: String },
        position: { type: String },
        personalData: { type: Schema.Types.Mixed },
        parserids: { type: Schema.Types.Mixed },
        created: { type: Date, default: Date.now },
        updated: { type: Date },

        // New fields in v3
        shortName: { type: Schema.Types.Mixed },
    };

    var playerSchema = new Schema(player);

    module.exports = mongoose.model('trn_players', playerSchema);
}