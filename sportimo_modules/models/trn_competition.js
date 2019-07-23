'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.trn_competitions)
    module.exports = mongoose.models.trn_competitions;
else {
    var competition = {

        name: { type: Schema.Types.Mixed },
        logo: { type: String },
        graphics: { type: Schema.Types.Mixed },
        parserids: { type: Schema.Types.Mixed },
        status: { type: String, enum: ['Active', 'Disabled'] },

        created: { type: Date, default: Date.now }
    };

    var competitionSchema = new Schema(competition);

    module.exports = mongoose.model('trn_competitions', competitionSchema);
}