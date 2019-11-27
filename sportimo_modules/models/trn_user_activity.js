'use strict';
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId,
    async = require('async'),
    log = require('winston');

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
    schema.statics.IncrementStat = function (userId, matchId, stat, byvalue, cb) {
        var statIncr = {};

        var stats = _.split(stat, ' ');
        _.each(stats, function (word) {
            statIncr[word] = byvalue;
        });

        let tournamentsInvolved = 0;

        async.waterfall([
            (cbk) => {
                async.parallel([
                    (innerCbk) => mongoose.models.users.findById(userId, 'client', innerCbk),
                    (innerCbk) => mongoose.models.trn_subscriptions.find({ user: userId, state: 'active' }, innerCbk)
                ], cbk);
            },
            (parallelResults, cbk) => {
                const user = parallelResults[0];
                const subscriptions = parallelResults[1];

                if (!user || subscriptions.length === 0) {
                    log.error(`Failed to add user activity to user ${userId} for match ${matchId}. No such user is found.`);
                    return cbk(null, []);
                }

                const tournamentIds = _.map(subscriptions, 'tournament');
                mongoose.model('trn_matches').find({ client: user.client, tournament: { $in: tournamentIds }, match: matchId }, cbk);
            },
            (trnMatches, cbk) => {
                if (!trnMatches || trnMatches.length === 0)
                    return cbk(null);

                tournamentsInvolved = trnMatches.length;

                async.each(trnMatches, (trnMatch, matchCbk) => {
                    mongoose.model('trn_user_activities').findOneAndUpdate({
                        user: userId,
                        client: trnMatch.client,
                        tournament: trnMatch.tournament,
                        tournamentMatch: trnMatch.id,
                        room: matchId
                    }, {
                            $inc: statIncr,
                            $set: {
                                user: userId,
                                client: trnMatch.client,
                                tournament: trnMatch.tournament,
                                tournamentMatch: trnMatch.id,
                                room: matchId
                            }
                        }, { upsert: true, new: true }, matchCbk);
                }, cbk);
            },
            (activityUpdateResult, cbk) => {
                var statsPath = {};

                _.each(stats, function (word) {
                    statsPath['stats.' + word] = tournamentsInvolved * byvalue;
                });

                mongoose.model('users').findByIdAndUpdate(userId, { $inc: statsPath }, cbk);
            }
        ], cb);
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
            }, { upsert: true }, function (err, result) {
                if (err) {
                    console.error(err);

                    return !cb ? null : cb(err, null);
                }

                if (!result) 
                    return !cb ? null : cb(null, null);


                if (!result.matchesPlayed) {
                    mongoose.model('users').findByIdAndUpdate(userId, { $inc: { 'stats.matchesPlayed': 1 } }, { new: true }, function (err, result) {
                        if (err)
                            console.error(err);

                        return !cb ? result : cb(err, result);
                    });
                } else {
                    result.matchesPlayed = 1;
                    return !cb ? result : cb(null, result);
                }
            });
    };




    module.exports = mongoose.model('trn_user_activities', schema);
}


