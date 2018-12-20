'use strict';
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;
var _ = require('lodash');


if (mongoose.models.trn_user_activities)
    module.exports = mongoose.models.trn_user_activities;
else {

    var fields = {
        // New fields
        client: { type: ObjectId, ref: 'trn_clients' },
        tournament: { type: ObjectId, ref: 'tournaments', required: true },
        tournamentMatch: { type: ObjectId, ref: 'trn_matches', required: true },

        // Existing fields
        user: {
            type: String,
            ref: 'users'
        },
        room: {
            type: String,
            ref: 'matches'
        },   // scheduled match id
        matchesPlayed: Number,
        cardsPlayed: Number,
        cardsWon: Number,
        instantCardsPlayed: Number,
        instantCardsWon: Number,
        presetinstantCardsPlayed: Number,
        presetinstantCardsWon: Number,
        overallCardsPlayed: Number,
        overallCardsWon: Number,

        lastActive: Date,
        isPresent: Boolean
    };

    var schema = new Schema(fields,
        {
            timestamps: { updatedAt: 'lastActive' }
        });

    schema.index({ tournament: 1, lastActive: -1 });
    schema.index({ user: 1, tournamentMatch: 1 });




    /***
     * A method to create and increment (multiple, space-delimited) stats
     * @param {String} userId the user id
     * @param {String} clientId the client id
     * @param {String} tournamentId the tournament id
     * @param {Object} tournamentMatch the tournament match document instance, with its match populated
     * @param {String} stat multiple stats to be increased, delimited by space
     * @param {Number} byvalue the value by which the stat(s) are to be incerased
     * @param {Function} cb a function callback
     * @returns The trn_user_activities document update result
     */
    schema.statics.IncrementStat = function (userId, clientId, tournamentId, tournamentMatch, stat, byvalue, cb) {
        var statIncr = {};

        var stats = _.split(stat, ' ');
        _.each(stats, function (word) {
            statIncr[word] = byvalue;
        });

        mongoose.model('trn_user_activities').findOneAndUpdate({
            user: userId,
            client: clientId,
            tournament: tournamentId,
            tournamentMatch: tournamentMatch.id,
            room: tournamentMatch.match.id
        }, {
                $inc: statIncr,
                $set: {
                    user: userId,
                    client: clientId,
                    tournament: tournamentId,
                    tournamentMatch: tournamentMatch.id,
                    room: tournamentMatch.match.id
                }
            }, { upsert: true, new: true }, function (err, activityUpdateResult) {

                var statsPath = {};

                _.each(stats, function (word) {
                    statsPath['stats.' + word] = byvalue;
                });

                mongoose.model('users').findByIdAndUpdate(userId, { $inc: statsPath }, function (err, userUpdateResult) {
                    if (err)
                        console.log(err);
                    if (cb)
                        return cb(err, userUpdateResult);
                });

            });
    };


    /**
     * This method increases the matches played stat on the related user activities and user collection documents
     * @param {String} userId the user id
     * @param {String} clientId the client id
     * @param {String} tournamentId the tournament id
     * @param {String} tournamentMatchId the tournament match id
     * @param {Function} cb a function callback
     */
    schema.statics.SetMatchPlayed = function (userId, clientId, tournamentId, tournamentMatch, cb) {

        mongoose.model('trn_user_activities').findOneAndUpdate({
            user: userId,
            client: clientId,
            tournament: tournamentId,
            tournamentMatch: tournamentMatch.id,
            room: tournamentMatch.match.id
        }, {
                $set: {
                    matchesPlayed: 1,
                    user: userId,
                    client: clientId,
                    tournament: tournamentId,
                    tournamentMatch: tournamentMatch.id,
                    room: tournamentMatch.match.id
                }
            }, { upsert: true, new: true }, function (err, result) {
                if (err) {
                    console.error(err);

                    if (cb)
                        return cb(err, null);
                }

                if (result && !result.matchesPlayed) {
                    mongoose.model('users').findByIdAndUpdate(userId, { $inc: { 'stats.matchesPlayed': 1 } }, function (err, result) {
                        if (err)
                            console.error(err);

                        if (cb)
                            return cb(err, result);
                    });
                } else {
                    if (cb)
                        return cb(null, result);
                }
            });
    };




    module.exports = mongoose.model('trn_user_activities', schema);
}


