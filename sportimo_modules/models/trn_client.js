'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema;


if (mongoose.models.trn_clients)
    module.exports = mongoose.models.trn_clients;
else {
    var client = {
        name: { type: Schema.Types.Mixed },
        description: { type: Schema.Types.Mixed },
        contactAddress: { type: String },
        logo: { type: String },
        promoText: { type: Schema.Types.Mixed },
        created: { type: Date, default: Date.now },
        updated: { type: Date, default: Date.now }
    };

    var clientSchema = new Schema(client);

    module.exports = mongoose.model('trn_clients', clientSchema);
}