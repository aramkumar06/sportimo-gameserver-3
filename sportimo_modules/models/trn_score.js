'use strict';

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
        competition: { type: ObjectId, ref: 'competitions' },
        scheduledMatch: { type: ObjectId, ref: 'scheduled_matches' },

        // Existing fields
        user: { type: ObjectId, ref: 'users' },
        userName: { type: String },
        //pic: { type: String },
        //level: { type: Number, default: 0 },
        //country: { type: String },

        score: { type: Number, default: 0 },
        scoreDate: { type: Date },

        //prize_eligible: Boolean,

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

        return mongoose.model('trn_scores').findOneAndUpdate({ tournamentMatch: new ObjectId(room), user: new ObjectId(uid) },
            { $inc: { score: points }, scoreDate: m_date },
            { upsert: true, new: true },
            function (err, result) {
                if (err) {
                    console.log(err);
                    if (cb)
                        return cb(err, result);
                }

                // Safe guard empty leaderboard [SPI-282]
                if (!result.userName) {

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
                                    userName: user.username
                                    //pic: user.picture,
                                    //country: user.country
                                };
                                //if (user.level)
                                //    score.level = user.level;

                                if (user) {
                                    mongoose.model('scores').findOneAndUpdate({ tournamentMatch: new ObjectId(room), user: new ObjectId(uid) },
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
                mongoose.model('trn_scores').findOneAndUpdate({ tournamentMatch: new ObjectId(room), user: new ObjectId(uid) },
                    {
                        user: user._id,
                        //pic: user.picture,
                        //user_name: user.username,
                        tournamentMatch: new ObjectId(room)
                        //country: user.country
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