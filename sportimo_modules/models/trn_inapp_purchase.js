'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

if (mongoose.models.trn_inapp_purchases)
    module.exports = mongoose.models.trn_inapp_purchases;
else {
    var ticket = {
        client: { type: ObjectId, ref: 'trn_clients', required: true },
        user: { type: ObjectId, ref: 'users' },
        sku: { type: String, required: true },
        status: { type: String, enum: ["Initiated", "Failed", "Completed"] },
        provider: { type: String, enum: ['Fake Store', 'GooglePlay', 'Apple'] }, // storeName
        //storeId: { type: String },
        transactionId: { type: String },
        receiptid: { type: String },
        providerMessage: { type: String },
        goldTicketPayout: { type: Number, default: 0 },       // how many gold tickets you get by bying this in-app item
        created: { type: Date, default: Date.now }
    };

    var ticketSchema = new Schema(ticket);

    module.exports = mongoose.model('trn_inapp_purchases', ticketSchema);
}
