'use strict';

// Module dependencies.
const     mongoose = require('mongoose');
const 
    Users = require('../../models/user'),
    Tournament = require('../../models/tournament'),
    TournamentMatch = require('../../models/trn_match'),
    GrandPrize = require('../../models/trn_grand_prize'),
    Scores = require('../../models/trn_score'),
    async = require('async'),
    _ = require('lodash');

const api = {};


api.getGrandPrizeLeaders = function (clientId, grandPrizeId, cb) {

    let bestscores = 50;
    async.waterfall([
        (cbk) => GrandPrize
            .findOne({ _id: grandPrizeId, client: clientId })
            .populate({ path: 'leaderboardDefinition' })
            .exec(cbk),
        (grandPrize, cbk) => {
            if (!grandPrize) {
                const err = new Error('Not Found');

                err.errorCode = 10005;
                err.statusCode = 404; // Not Found

                return cbk(err);
            }

            if (grandPrize.bestscores)
                bestscores = grandPrize.bestscores;

            Scores
                .find({ client: clientId, created: { $gte: grandPrize.startFromDate, $lt: grandPrize.endToDate } })
                .populate({ path: 'user_id', select: 'username pic level country' })
                .exec(cbk);
        },
        (scores, cbk) => {
            if (!scores)
                return cbk(null);

            return cbk(null, SortResults(scores, bestscores));
        }
    ], cb);
};


api.getTournamentLeaders = function (clientId, tournamentId, cb) {

    let bestscores = 50;
    async.waterfall([
        (cbk) => Tournament
            .findOne({ _id: tournamentId, client: clientId })
            .populate({ path: 'leaderboardDefinition' })
            .exec(cbk),
        (tournament, cbk) => {
            if (!tournament) {
                const err = new Error('Not Found');

                err.errorCode = 10005;
                err.statusCode = 404; // Not Found

                return cbk(err);
            }

            if (tournament.leaderboardDef && tournament.leaderboardDef.bestscores)
                bestscores = tournament.leaderboardDef.bestscores;

            Scores
                .find({ client: clientId, tournament: tournamentId })
                .populate({ path: 'user_id', select: 'username pic level country' })
                .exec(cbk);
        },
        (scores, cbk) => {
            if (!scores)
                return cbk(null);

            return cbk(null, SortResults(scores, bestscores));
        }
    ], cb);
};



api.getMatchLeaders = function (clientId, tournamentId, matchId, cb) {

    let bestscores = 50;
    async.waterfall([
        (cbk) => TournamentMatch
            .findOne({ _id: matchId, client: clientId, tournament: tournamentId, isHidden: { $ne: true } })
            .populate({ path: 'leaderboardDefinition' })
            .exec(cbk),
        (match, cbk) => {
            if (!match) {
                const err = new Error('Not Found');

                err.errorCode = 10005;
                err.statusCode = 404; // Not Found

                return cbk(err);
            }

            if (match.leaderboardDefinition && match.leaderboardDefinition.bestscores)
                bestscores = match.leaderboardDefinition.bestscores;

            Scores
                .find({ client: clientId, tournament: tournamentId, tournamentMatch: match.id })
                .populate({ path: 'user_id', select: 'username pic level country' })
                .exec(cbk);
        },
        (scores, cbk) => {
            if (!scores)
                return cbk(null);

            return cbk(null, SortResults(scores, bestscores));
        }
    ], cb);
};



// Helper methods


function SortResults(scores, bestscores) {

    var result =
        _.chain(scores)
            .orderBy(['user.id', 'score'], ['desc', 'desc'])
            .groupBy('user.id')
            .map(function (value, key) {
                const scores = _.chain(value).take(bestscores).map("score").value();
                const score = _.sum(scores);
                const usr = value[0].user_id;
                const leadItem = {
                    "_id": usr.id,
                    "score": score,
                    "scores": scores,
                    "name": usr.username,
                    "level": usr.level,
                    "pic": usr.pic,
                    "country": usr.country
                };
                return leadItem;
            })
            .orderBy(["score"], ["desc"])
            .value();

    return Ranked(result);
}

function Ranked(leaderboard) {

    var rank = 1;
    var rankedLeaderboard = [];

    var result =
        _.chain(leaderboard)
            .groupBy("score")
            .map(function (value, key) {
                var score_group = {
                    'score': parseInt(key),
                    'entries': _.orderBy(value, 'level', 'desc')
                };
                return score_group;
            })
            .orderBy(['score'], ['desc'])
            .value();

    _.each(result, function (s) {
        _.each(s.entries, function (e) {
            e.rank = rank;
            rank++;
            rankedLeaderboard.push(e);
        });
    });

    return rankedLeaderboard;
}


module.exports = api;