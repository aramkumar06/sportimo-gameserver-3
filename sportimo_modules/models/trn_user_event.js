'use strict';
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    MessagingTools = require('../messaging-tools'),
    _ = require('lodash'),
    ObjectId = Schema.Types.ObjectId;


if (mongoose.models.trn_user_events)
    module.exports = mongoose.models.trn_user_events;
else {

    var fields = {
        // New fields
        client: { type: String, ref: 'trn_clients' },
        user: { type: String, ref: 'users' },
        eventTime: Date,
        eventName: String,
        eventObject: Schema.Types.Mixed
    };

    var UserEventSchema = new Schema(fields);

    UserEventSchema.statics.StoreUserEvent = function (clientId, userId, eventName, eventObject) {
        if (!clientId || !userId) {
            if (!eventObject)
                return;
            else if (!eventObject.client || !eventObject._id)
                return;
            else {
                clientId = eventObject.client;
                userId = eventObject._id;

                eventObject = _.pick(eventObject, ['client', '_id', 'username', 'email', 'createdAt', 'level', 'country', 'subscriptionEnd', 'wallet']);
            }
        }
        return MessagingTools.storeUserEvent(clientId, userId, eventName, eventObject);
    };

    module.exports = mongoose.model('trn_user_events', UserEventSchema);
}


