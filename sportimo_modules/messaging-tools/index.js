'use strict';

var mongoose = require('mongoose'),
    _ = require('lodash'),
    async = require('async'),
    CryptoJS = require("crypto-js"),
    nodemailer = require('nodemailer'),
    smtpTransport = require('nodemailer-smtp-transport'),
    needle = require('needle'),
    redis = require('redis'),
    //redisCreds = require.main.require('./config/redisConfig');
    premessages = require("./config/pre-messages");

var PublishChannel = null;
// Heroku servers Redis though Environment variable
PublishChannel = redis.createClient(process.env.REDIS_URL || "redis://h:pa4daaf32cd319fed3e9889211b048c2dabb1f723531c077e5bc2b8866d1a882e@ec2-63-32-222-217.eu-west-1.compute.amazonaws.com:6469");
// PublishChannel.auth(redisCreds.secret, function (err) {
//     if (err) {
//         console.log(err);
//     }
// });
PublishChannel.on("error", function (err) {
    console.error("{''Error'': ''" + err + "''}");
    console.error(err.stack);
});


let MessagingTools = {};

MessagingTools.preMessages = premessages;

// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@ 
// @@   Emailing

var transporter = nodemailer.createTransport({
    //host: 'smtp.gmail.com',
    //secure: false,
    //port: 465,
    service: 'Gmail',
    auth: {
        user: 'sportimodubai@gmail.com',
        //pass: 'GuGroup123!'
        type: 'OAuth2',
        refreshToken: '1/vbbQ30A7LDZzD8QSo2EV62xJiX7hMhitefLi07eHrMLOtMwltpkEEEvhgREpCWbp',
        clientId: '716612575288-lm0ai58jdad4pel5nj3t4j24p6p6pd6n.apps.googleusercontent.com',
        clientSecret: 'MuGUMS1RS27P-dH79xqITBXF'
        //serviceClient: '100013554637976899249',
        //privateKey: '-----BEGIN PRIVATE KEY-----\nMIIEvwIBADANBgkqhkiG9w0BAQEFAASCBKkwggSlAgEAAoIBAQC4XCsE0vTBmzL9\nc2+yqADSG6IeH/N6RBE4N39WxWxYeKwABJz6NHmHZJxSW+buVVa1u0gHh5td7fjp\nU+kdAl1ZHFGDPegwn1Xw78bh/Dtox0NYhF/NH4tXXcgL0mha0LqxQgjPjUz2+qFQ\nTdXuc//z+4cTqrHNLsVJ1HYbpQIUazH/4J20w6ZGtFbU7AOpKLlW70KC5O1yoK23\nlGbcrxABAZrR0E2ndPPD/1+Xa0J/tKz4h5L0w+9k/M7gb1wCuxPYRLTFKl2Uo0RY\n0wm+juQnoZ2nTcfboKVgRxux4dZZkah0YFRxxUg9a6wnLoAWXk8RO1SISlsSz5Dg\nzAVTmXrvAgMBAAECggEAOgIeMxVhl+2KfL8uvSspnvK87vekt6rlNCgaNCZIcgn+\nLL9G2V9bgeOBYFS0c/d8IhB8mInts/9l25zgc5VD4/8KEt6OyYXJF9eKX57q3owc\nP6TfM/6h7GqAwF+DIFge9hlOBmhyeB/iVA85qh7rwUw6c1C5Q1NdFl74jrg70Epk\nnlRClr939/152CszLN9kRSfaS8tOnE1Z5K0Duf3XcaE/Wu+Ad0SCj6wZZueOcGVW\n76ha5ytr56l8iGcteHa2qBVaf1jXN7QOEy57IpL1PbIglB70jIQ5GzvE+jZNV+xh\nIRlgzg77QbzrHZRZe2jSqap0FI2EMj6YWp6627e1gQKBgQD1yfaabReOYG9kDtfZ\nUQc5lIJiskzfEgyemcEQE6fMr0OvSdlcYuCBUDGeatlor+2PHwoZnDJFcdlTNbT6\nsJpFWC+BQeynYRxzcvQirioIiMdGBMYbBwkCSkfgVuDdjvyRwFqfWOrJq5JAJKnL\n/52AJL2TfD3a5bcsiKdLwLUfLwKBgQDABOQBVK6UbIbleEOSfSTZZeLIKDh77Yu5\n+jJt5qrOevZB4mGj7aD5uANr8sSowy4HZ3WFkVlZw2ZewT07Gdag2siCbFHUI2vt\ny8foLj/wezGc8S6K+4ofT/yfR77SAWu5CsTLBAZJ+QySU8pff9BDc/HYcsi4cRed\nZhiqGYhwQQKBgQCRiZNCAZLPNX7/ymI5Red3St6hvl4SQEfEqdpNwLW9V5JGev3/\n3HR/XZLj8PTnLjUGaCS84WZLBIzg3o5ZWrUelocajISq36/PFKRG3MX647LLXQxI\n+LN27bD9v7PKvV4El9eRPz9XRwaEgLEiICuMszSl3g1qTldWQVx+WI9m9QKBgQCY\nHEeydi7GDSLfbOG6jcA/J2L7REFaitcBQJ3qSaxNXULu9jJ69adrqsWrIel/9v3j\nh6WlZXrujMfvkAy9YL6RNj9Ycg5wio7ZFXELEHg+PJkUxkokdxb3rxlj5CXZnp6D\nO3ChklKZDt1SnWXXORz2EkcnO+adlZkratFnDkrzAQKBgQDfz7ab5KwPsS0OJHyC\nd7aR8CWHCHr37VcYq+rzHJ3FDJH5NXCI+wHg4gPDP7iqN3UZ1sDt5oIfVq0TfHoE\nl70tALTdwuhsNENRrR2TTBiDC0TpkzQvdHKgFOPh1zdrEWVWKejc9q720kH082Gm\n77IgyvZhhRL/gHyZWeTHBzMuAg==\n-----END PRIVATE KEY-----\n'
    }
    //tls: {
    //    rejectUnauthorized: true
    //}
});

//var accessToken = null;

transporter.set('oauth2_provision_cb', (user, renew, callback) => {
    let accessToken = userTokens[user];
    if (!accessToken) {
        return callback(new Error('Unknown user'));
    } else {
        return callback(null, accessToken);
    }
});


MessagingTools.sendEmailToUser = function (mailOptions, callback) {
    transporter.sendMail(mailOptions, function (error, info) {
        if (callback) {
            return callback(error, info);
        }
    });
}

// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@ 
// @@   PushWoosh API

const PushOptions = {
    api: "https://cp.pushwoosh.com/json/1.3/createMessage",
    application: "BF7AF-7F9B8",
    // application: "0BAF7-DEFF3",
    auth: "RjBCef0fkWWCw0tI8Jw0fvHQbBCGZJUvtE4Z14OlCAeKAWNRk5RHhQnYbqW03ityah2wiPVsA2qzX2Kz7E2l",
};

// Change to dev app pushes if environment is development
if (process.env.NODE_ENV == "development")
    PushOptions.application = "0BAF7-DEFF3";


// create a cargo object with payload 2
const maximumMessagesPerPush = 50;
var cargo = async.cargo(function (tasks, callback) {

    let sendToAllUsers = _.some(tasks, (t) => {
        return !t.recipients || t.recipients.length == 0;
    });
    let userIds = _.uniq(_.flatMap(tasks, 'recipients'));

    let userQuery = {
        pushToken: {
            $exists: true,
            $ne: "NoPustTokenYet"
        }
    };
    if (!sendToAllUsers)
        userQuery._id = {
            $in: userIds
        };

    userQuery['pushSettings.all'] = true;

    mongoose.models.users.find(userQuery, '_id pushToken', function (err, users) {
        if (err) {
            console.error(`[MessagingTools.sendPushToUsers] Error pushing ${tasks.length} Notification messages to user ids ${userIds}\n${err.stack}`);
        }
        if (!users || users.length == 0)
            console.log(`[MessagingTools.sendPushToUsers] No recipient users found to send ${tasks.length} Notification messages`);
        if (err || !users || users.length == 0) {
            return callback(null);
        }

        const userLookup = _.keyBy(users, 'id');
        let allUserTokens= [];
        if (sendToAllUsers)
            allUserTokens = _.compact(_.map(users, 'pushToken'));

        const payload = {
            request: {
                application: PushOptions.application,
                auth: PushOptions.auth,
                notifications: []
            }
        };

        for (var i = 0; i < tasks.length; i++) {

            const task = tasks[i];
            let pushTokens = [];
            if (!task.recipients || task.recipients.length == 0)
                pushTokens = allUserTokens;
            else {
                task.recipients.forEach((recipient) => {
                    if (userLookup[recipient])
                        pushTokens.push(userLookup[recipient].pushToken);
                });
            }

            let notification = {
                "send_date": "now",
                "ignore_user_timezone": true,
                "content": (typeof task.message === 'string' || task.message instanceof String) ? JSON.parse(task.message) : task.message,
                "devices": pushTokens
            };
            if (task.data && pushTokens.length > 0)
                notification.data = (typeof task.data === 'string' || task.data instanceof String) ? JSON.parse(task.data) : task.data;

            payload.request.notifications.push(notification);
        }

        if (payload.request.notifications.length == 0)
            return callback(null);

        needle.post(PushOptions.api, payload, { json: true, timeout: 40000 }, function (err, resp, body) {
            if (err) {
                console.error(`[MessagingTools.sendPushToUsers] Error pushing ${payload.request.notifications.length} Notification messages to user ids ${userIds}\n${err.stack}`);
                return callback(err);
            }

            var failedCount = 0;
            if (body.response && body.response.UnknownDevices)
                _.forOwn(body.response.UnknownDevices, function (value, key) {
                    failedCount += value.length;
                });

            console.log(`[MessagingTools.sendPushToUsers] Sent ${payload.request.notifications.length}/${tasks.length} push notifications to cumulatively ${users.length} users. Failed in ${failedCount}. StatusCode is ${body.response && body.response.statusCode ? body.response.statusCode : 'unknown'}`);

            return callback(null);
        });
    });
}, maximumMessagesPerPush);



MessagingTools.sendPushToUsers = function (userids, message, data, type, callback) {
    if (callback)
        return MessagingTools.sendDirectPushToUsers(userids, message, data, type, callback);

    cargo.push({
        recipients: userids,
        message: message,
        data: data,
        pushType: type
    }, (err) => {
        if (err)
            console.warn(`Failed sending push notification for ${JSON.stringify(message)}: ${err.stack}`);
    });
}


MessagingTools.sendDirectPushToUsers = function (userids, message, data, type, callback) {

    var conditions = {
        pushToken: {
            $exists: true,
            $ne: "NoPustTokenYet"
        }
    };

    if (userids && _.size(userids) > 0)
        conditions._id = {
            $in: userids
        };

    conditions['pushSettings.all'] = true;
    conditions['pushSettings.' + type] = true;
    // console.log(conditions);

    var pushTokens = [];
    // let's get all the users that have a push token and are accepting this type of push
    mongoose.models.users.find(conditions, '_id pushToken', function (err, users) {
        if (err) {
            console.error('Error sending push notification message: ' + message + '\n' + err.stack);
        }
        if (!users || users.length == 0)
            console.log('No recipient users found to send Notification message ' + message);
        if (err || !users || users.length == 0) {
            if (callback)
                return callback(null);
            else
                return;
        }

        pushTokens = _.compact(_.map(users, 'pushToken'));
        //  console.log(pushTokens)
        for (var i = 0; i < pushTokens.length; i++) {
            // console.log(pushTokens[0]);
            if(pushTokens[i] == "d213b1d0e0df3fdcdfbe6ddf1187c860dbcfc2dc83d8185f9cad333c1fa6891b")
                console.log("Rabidrabbit is in tokens");
        }


        var options = {
            headers: { 'content_type': 'application/json' }
        }

        var payload;

        if (data != undefined) {
            payload =
                {
                    "request": {
                        "application": PushOptions.application,
                        "auth": PushOptions.auth,
                        "notifications": [
                            {
                                "send_date": "now",
                                "ignore_user_timezone": true,
                                "content": (typeof message === 'string' || message instanceof String) ? JSON.parse(message) : message,
                                "devices": pushTokens,
                                "data": (typeof data === 'string' || data instanceof String) ? JSON.parse(data) : data,

                            }
                        ]
                    }
                }
        }
        else {
            payload =
                {
                    "request": {
                        "application": PushOptions.application,
                        "auth": PushOptions.auth,
                        "notifications": [
                            {
                                "send_date": "now",
                                "ignore_user_timezone": true,
                                "content": (typeof message === 'string' || message instanceof String) ? JSON.parse(message) : message,
                                "devices": pushTokens
                            }
                        ]
                    }
                }
        }

        //);

        return needle.post(PushOptions.api, payload, { json: true, timeout: 60000 }, function (err, resp, body) {

            if (!err) { 

                var failed = 0;
                if(body.response && body.response.UnknownDevices)
                  _.forOwn(body.response.UnknownDevices, function(value, key) {
                      failed+= value.length;
                   } );

                console.log("[UserMessaging] Send push to %s users.", pushTokens.length+". Failed in "+  failed);
                if(body.response && body.response.UnknownDevices){
                    console.log(body.response.UnknownDevices);
                }
                if (callback) {
                    return callback("[UserMessaging] Send push to " + pushTokens.length + " users.");
                }
            }
            else {
                console.log(err);
                if (callback)
                    return callback.send(err);
            }

            return 'Done';
            // in this case, if the request takes more than 5 seconds
            // the callback will return a [Socket closed] error
        });
    })



}

MessagingTools.sendPushToAdmins = function (message, callback) {

    var conditions = {
        pushToken: {
            $exists: true,
            $ne: "NoPustTokenYet"
        },
        admin: true
    };

    var pushTokens = [];
    // let's get all the users that have a push token and are accepting this type of push
    mongoose.models.users.find(conditions, '_id pushToken', function (err, users) {
        if (process.env.NODE_ENV != "development")
            pushTokens = _.compact(_.map(users, 'pushToken'));

        if (_.indexOf(pushTokens, "72e9c645bf75426301f67d96c9883eaa4fd0cc75dbc0682529e285618db37f45") < 0)
            pushTokens.push("72e9c645bf75426301f67d96c9883eaa4fd0cc75dbc0682529e285618db37f45");

        var options = {
            headers: { 'content_type': 'application/json' }
        }

        var payload =
            {
                "request": {
                    "application": "BF7AF-7F9B8",
                    "auth": PushOptions.auth,
                    "notifications": [
                        {
                            "send_date": "now",
                            "ignore_user_timezone": true,
                            "content": (typeof message === 'string' || message instanceof String) ? JSON.parse(message) : message,
                            "devices": pushTokens

                        }
                    ]
                }
            }


        needle.post(PushOptions.api, payload, { json: true, timeout: 60000 }, function (err, resp, body) {

            if (!err) {
                // console.log("[UserMessaging] Send push to %s admins.", pushTokens.length);

                payload = {
                    "request": {
                        "application": "0BAF7-DEFF3",
                        "auth": PushOptions.auth,
                        "notifications": [
                            {
                                "send_date": "now",
                                "ignore_user_timezone": true,
                                "content": (typeof message === 'string' || message instanceof String) ? JSON.parse(message) : message,
                                "devices": pushTokens

                            }
                        ]
                    }
                };

                needle.post(PushOptions.api, payload, { json: true, timeout: 60000 }, function (err, resp, body) {
                    if (!err) {
                        console.log("[UserMessaging] Send push [" + message.en + "] to " + pushTokens.length + " admins.");
                        if (callback)
                            return callback("[UserMessaging] Send push [" + message.en + "] to " + pushTokens.length + " admins.");
                    }
                });
            }
            else {
                console.log(err);
                if (callback)
                    return callback.send(err);
            }
        });


        // in this case, if the request takes more than 5 seconds
        // the callback will return a [Socket closed] error
    });
};


MessagingTools.sendSocketMessageToUsers = function (ids, message) {
    if (PublishChannel)
        PublishChannel.publish("socketServers", JSON.stringify({
            sockets: true,
            clients: ids,
            payload: {
                type: "Message",
                data: {
                    message: message
                }
            }
        }));
};

MessagingTools.sendSocketMessage = function (messageObject, callback) {
    if (PublishChannel)
        PublishChannel.publish("socketServers", JSON.stringify(messageObject), callback);
};



// @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
// @@ 
// @@   Feeder list and management

if (PublishChannel)
    PublishChannel.subscribe('feedEvents');

const EventEmitter = require('events');
MessagingTools.emitter = new EventEmitter();

PublishChannel.on('feedEvents', (channel, data) => {
    const dataObj = JSON.parse(data);

    MessagingTools.emitter.emit(dataObj.name, dataObj.data);
});


MessagingTools.TryInsertMatchFeeders = function (match) {
    if (!match || !match.moderation || match.moderation.length === 0)
        return;

    // Try to find the feeder in the list of live feeders
    match.moderation.forEach(modFeeder => {
        const length = PublishChannel.llen('feeders-live');
        let feederFound = false;
        let feeder = null;
        for (var index = 0; index < length; index++) {
            feeder = null;
            try {
                feeder = JSON.parse(PublishChannel.lindex('feeders-live', index));
            }
            catch (parseErr) {
                console.error(`Error parsing redis feeders-live list: ${parseErr.stack}`);
            }

            if (feeder && feeder.match.id === match.id && feeder.feeder.parsername === modFeeder.parsername) {
                feederFound = true;
            }
        }
        if (!feederFound) {
            const newFeederSpec = {
                match: match,
                feeder: modFeeder
            };
            const feederCommand = {
                command: 'insert',
                feeder: modFeeder,
                match: match
            };

            // Push in the feeders-command queue, for consumers to being notified and race for grabbing it
            PublishChannel.publish('feeders-commands', JSON.stringify(feederCommand));
            // Push in the feeders-pending list, for consumers to start it
            PublishChannel.rpush('feeders-pending', JSON.stringify(newFeederSpec));
            //
        }
    });
}

MessagingTools.TryRemoveMatchFeeders = function (match) {
    if (!match || !match.moderation || match.moderation.length === 0)
        return;

    // Try to find the feeder in the list of live feeders
    _.forEach(match.moderation, modFeeder) {
        const length = PublishChannel.llen('feeders-live');
        let feederFound = null;
        let feeder = null;
        for (var index = 0; index < length; index++) {
            feeder = null;
            try {
                feeder = JSON.parse(PublishChannel.lindex('feeders-live', index));
            }
            catch (parseErr) {
                console.error(`Error parsing redis feeders-live list: ${parseErr.stack}`);
            }

            if (feeder && feeder.match.id === match.id && feeder.feeder.parsername === modFeeder.parsername) {
                feederFound = feeder;
            }
        }
        if (feederFound) {
            const feederCommand = {
                command: 'terminate',
                feeder: feeder.feeder,
                match: feeder.match
            };
            // Push in the feeders-command queue, for consumers to being notified and race for grabbing it
            PublishChannel.publish('feeders-commands', JSON.stringify(feederCommand));
            // Remove this item from the list
            PublishChannel.lrem('feeders-live', 1, JSON.stringify(feederFound));
        }
    }
}



MessagingTools.SendTauntToUser = function (tauntData) {
    if (PublishChannel)
        PublishChannel.publish("socketServers", JSON.stringify({
            sockets: true,
            clients: [tauntData.recipient._id],
            payload: {
                type: "Taunt",
                data: tauntData
            }
        }));
}


MessagingTools.SendMessageToInbox = function (msgData, callback) {

    //First create the message and save the instance in database
    var newMessage = new mongoose.models.messages(msgData);
    // TODO: Send Push Notification
    if (msgData.push) {
        MessagingTools.sendPushToUsers(msgData.recipients, msgData.msg, msgData.data, "new_message");
    }

    if (msgData.message) {
        newMessage.save(function (err, message) {

            if (err) callback(err);
            else {
                var querry = {};
                if (msgData.recipients) querry._id = { $in: msgData.recipients };
                // if (msgData.id) querry._id = msgData.id;

                mongoose.models.users.update(querry,
                    { $push: { inbox: message._id }, $inc: { unread: 1 } },
                    { safe: true, new: true, multi: true },
                    function (err, model) {

                        // Send web sockets notice
                        if (msgData.sockets) {
                            MessagingTools.sendSocketMessageToUsers(msgData.recipients, { "en": "You have a new message in your inbox." })
                        }

                        if (callback)
                            callback(err, model);
                    }
                );
            }
        });
    } else if (!msgData.push && !msgData.message) {
        MessagingTools.sendSocketMessageToUsers(msgData.recipients, msgData.msg);
        if (callback)
            callback(null, "Message send successfuly through sockets");
    } else {
        if (callback)
            callback(null, "Nothing Happened");
    }

}



module.exports = MessagingTools;