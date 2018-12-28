'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

if (mongoose.models.trn_prizes)
    module.exports = mongoose.models.trn_prizes;
else {
    var fields = {
        name: { type: Schema.Types.Mixed },
        text: { type: Schema.Types.Mixed },
        picture: { type: String },
        goldTickets: { type: Number, default: 0 },
        created: { type: Date, default: Date.now }
    };

    var prizeSchema = new Schema(fields);

    module.exports = mongoose.model('trn_prizes', prizeSchema);
}
