'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.Types.ObjectId,
    async = require('async'),
    log = require('winston');

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

    scoreSchema.statics.AddPoints = function (userId, tournamentId, tournamentMatchId, matchId, points, m_date, cb) {

        let user = null;

        async.waterfall([
            (cbk) => {
                async.parallel([
                    (innerCbk) => mongoose.models.users.findById(userId, 'client username level country picture', innerCbk),
                    (innerCbk) => mongoose.models.trn_subscriptions.find({ user: userId, state: 'active' }, innerCbk)
                ], cbk);
            },
            (parallelResults, cbk) => {
                user = parallelResults[0];
                const subscriptions = parallelResults[1];

                //if (!user || subscriptions.length === 0) {
                if (!user) {
                    log.error(`Failed to add score of ${points} to user ${userId} for match ${matchId}. No such user is found or no valid subscriptions exist.`);
                    return cbk(null, []);
                }

                //const tournamentIds = _.map(subscriptions, 'tournament');
                //mongoose.model('trn_matches').find({ client: user.client, tournament: { $in: tournamentIds }, match: matchId }, cbk);
                mongoose.model('trn_matches').find({ _id: tournamentMatchId, client: user.client, tournament: tournamentId, match: matchId }, { settings: 0 }, cbk);
            },
            (trnMatches, cbk) => {
                if (!trnMatches || trnMatches.length === 0)
                    return cbk(null);

                const trnMatch = trnMatches[0];

                mongoose.model('trn_scores').findOneAndUpdate(
                    {
                        user_id: userId,
                        client: trnMatch.client,
                        tournament: trnMatch.tournament,
                        tournamentMatch: trnMatch.id,
                        game_id: matchId
                    },
                    {
                        $set: {
                            user_id: userId,
                            client: trnMatch.client,
                            tournament: trnMatch.tournament,
                            tournamentMatch: trnMatch.id,
                            game_id: matchId,
                            pic: user.picture,
                            user_name: user.username,
                            country: user.country,
                            level: user.level,
                            match_date: m_date
                        },
                        $inc: {
                            score: points
                        }
                    },
                    { upsert: true, new: true },
                    cbk);
            }
        ], cb);
    };

    // Internal method used by sockets subscribe
    scoreSchema.statics.AddLeaderboardEntry = function (userId, matchId, cb) {

        let tournamentsInvolved = 0;
        let user = null;

        async.waterfall([
            (cbk) => {
                async.parallel([
                    (innerCbk) => mongoose.models.users.findById(userId, 'client username level country picture', innerCbk),
                    (innerCbk) => mongoose.models.trn_subscriptions.find({ user: userId, state: 'active' }, innerCbk)
                ], cbk);
            },
            (parallelResults, cbk) => {
                user = parallelResults[0];
                const subscriptions = parallelResults[1];

                if (!user || subscriptions.length === 0) {
                    log.error(`Failed to add leaderboard entry to user ${userId} for match ${matchId}. No such user is found or no valid subscriptions exist.`);
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
                    mongoose.model('trn_scores').findOneAndUpdate(
                        {
                            user_id: userId,
                            client: trnMatch.client,
                            tournament: trnMatch.tournament,
                            tournamentMatch: trnMatch.id,
                            game_id: matchId
                        },
                        {
                            user_id: userId,
                            client: trnMatch.client,
                            tournament: trnMatch.tournament,
                            tournamentMatch: trnMatch.id,
                            game_id: matchId,
                            pic: user.picture,
                            user_name: user.username,
                            country: user.country,
                            level: user.level
                        },
                        { upsert: true },
                        matchCbk);
                }, cbk);
            }
        ], cb);
    };

    module.exports = mongoose.model('trn_scores', scoreSchema);
}