﻿'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId;

if (mongoose.models.trn_scores)
    module.exports = mongoose.models.trn_scores;
else {
    var fields = {
        client: { type: ObjectId, ref: 'trn_clients' },
        tournament: { type: ObjectId, ref: 'tournaments' },
        tournamentMatch: { type: ObjectId, ref: 'trn_matches' },
        competitionSeason: { type: ObjectId, ref: 'trn_competition_seasons' },

        game_id: { type: String, ref: 'matches' },
        match_date: { type: Date },

        // Existing fields
        user_id: { type: String, ref: 'users' },
        pic: { type: String },
        user_name: { type: String },
        country: { type: String },
        level: { type: Number, default: 0 },

        score: { type: Number, default: 0 },
        scoreDate: { type: Date },
        //isPrizeEligible: 
        //prize_eligible: { type: Boolean, default: false },,

        created: { type: Date, default: Date.now },
        lastActive: { type: Date }
    };

    var scoreSchema = new Schema(fields,
        {
            timestamps: { updatedAt: 'lastActive', createdAt: 'created' }
        });


    //scoreSchema.index({ lastActive: -1 });
    scoreSchema.index({ user: 1, tournamentMatch: 1 });

    scoreSchema.statics.AddPoints = function (uid, room, points, m_date, cb) {

        return mongoose.model('trn_scores').findOneAndUpdate({ tournamentMatch: room, user_id: uid },
            { $inc: { score: points }, match_date: m_date },
            { upsert: true, new: true },
            function (err, result) {
                if (err) {
                    console.log(err);
                    if (cb)
                        return cb(err, result);
                }

                // Safe guard empty leaderboard [SPI-282]
                if (!result.user_name) {

                    mongoose.model('users').findById(uid, function (err, user) {
                        if (err) {
                            console.error(err.stack);
                            if (cb)
                                return cb(err, result);
                        }
                        else
                            if (!user) {
                                console.error('Failed to locate user ' + uid + ' in order to update its score in match id ' + room);
                                if (cb)
                                    return cb(err, result);
                            }
                            else {
                                var score = {
                                    user_name: user.username
                                };

                                if (user) {
                                    mongoose.model('scores').findOneAndUpdate({ tournamentMatch: room, user_id: uid },
                                        score,
                                        { upsert: true, safe: true, new: true },
                                        function (err, result) {
                                            console.log("Updated erroneus leaderboard entry for: " + uid);
                                            if (cb)
                                                return cb(err, result);
                                        }
                                    );
                                }
                            }

                    });
                }
                else {
                    if (cb)
                        return cb(err, result);
                }

            });
    };

    // Internal method used by sockets subscribe
    scoreSchema.statics.AddLeaderboardEntry = function (uid, room) {
        mongoose.model('users').findById(uid, function (err, user) {
            if (user) {
                mongoose.model('trn_scores').findOneAndUpdate({ tournamentMatch: room, user_id: uid },
                    {
                        user_id: user.id,
                        tournamentMatch: room
                    },
                    { upsert: true },
                    function (err, result) {
                        if (err)
                            console.log(err);
                    });
            }
        });
    };

    module.exports = mongoose.model('trn_scores', scoreSchema);
}