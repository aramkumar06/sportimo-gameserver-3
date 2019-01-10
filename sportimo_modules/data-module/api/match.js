// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    TournamentMatches = mongoose.models.trn_matches,
    Matches = mongoose.models.matches,
    Scores = mongoose.models.trn_scores,
    UserGamecards = mongoose.models.trn_user_cards,
    _ = require('lodash'),
    async = require('async'),
    logger = require('winston'),
    api = {};




api.item = function (req, res) {

    const clientId = req.params.clientId;
    const tournamentId = req.params.tournamentId;
    const matchId = req.params.matchId;
    const userid = req.decoded.id;

    const trimBy = req.query.trimby;

    const game = {
        userScore: 0,
        playedCards: []
    };


    async.parallel([
        (cbk) => Scores.find({ client: clientId, tournament: tournamentId, tournamentMatch: matchId, user: userid })
            .limit(1)
            .exec(cbk),
        (cbk) => UserGamecards.find({ client: clientId, tournament: tournamentId, tournamentMatch: matchId, userid: userid }, cbk),
        (cbk) => {
            if (trimBy && trimBy === "gamecards")
                return async.setImmediate(() => cbk(null));

            TournamentMatches
                .find({ client: clientId, tournament: tournamentId, _id: matchId, isHidden: { $ne: true } })
                .populate({
                    path: 'match',
                    select: 'home_team away_team home_score away_score time isTimeCounting stats timeline start settings completed state headtohead guruStats',
                    populate: [{ path: 'home_team', select: 'name logo stats' }, { path: 'away_team', select: 'name logo stats' }]
                })
                .limit(1)
                .exec(cbk);
        }
    ], (err, parallelResults) => {

        if (err) {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }

        const userScore = !parallelResults[0][0] ? null : parallelResults[0][0];
        if (userScore) {
            game.userScore = userScore.score;
            if (userScore.isPrizeEligible)
                game.prize_eligible = userScore.isPrizeEligible;
        }

        const userCards = parallelResults[1];
        if (userCards && userCards.length > 0) {
            game.playedCards = _.map(userCards, TranslateUserGamecard);
        }

        if (!trimBy || trimBy !== "gamecards") {
            const matches = parallelResults[2];

            if (matches[0]) {
                const rawMatch = matches[0].toObject();
                const transformedMatch = _.pick(rawMatch, ['client', 'tournament', 'leaderboardDefinition', 'isHidden', 'created', 'updated']);
                transformedMatch.tournamentMatchId = rawMatch._id;
                _.merge(transformedMatch, rawMatch.match);
                game.matchData = transformedMatch;
                // Add the server time in the response
                game.matchData.server_time = Date.now();
            }
        }

        return res.status(200).json(game);
    });
};

var TranslateUserGamecard = function (userGamecard) {
    var retValue = {
        id: userGamecard.id || null,
        userid: userGamecard.userid || null,
        matchid: userGamecard.matchid || null,
        gamecardDefinitionId: userGamecard.gamecardDefinitionId || null,
        title: userGamecard.title || null,
        image: userGamecard.image || null,
        text: userGamecard.text || null,
        minute: userGamecard.minute || 0,
        segment: userGamecard.segment || 0,
        primaryStatistic: userGamecard.primaryStatistic || null,
        cardType: userGamecard.cardType || null,
        isDoubleTime: userGamecard.isDoubleTime || false,
        isDoublePoints: userGamecard.isDoublePoints || false,
        status: userGamecard.status || 0,
        specials: userGamecard.specials
    };



    if (userGamecard.startPoints)
        retValue.startPoints = userGamecard.startPoints;
    if (userGamecard.endPoints)
        retValue.endPoints = userGamecard.endPoints;
    if (userGamecard.pointsPerMinute)
        retValue.pointsPerMinute = userGamecard.pointsPerMinute;

    if (userGamecard.activationLatency)
        retValue.activationLatency = userGamecard.activationLatency;
    if (userGamecard.pointsAwarded)
        retValue.pointsAwarded = userGamecard.pointsAwarded;
    if (userGamecard.duration)
        retValue.duration = userGamecard.duration;
    if (userGamecard.optionId)
        retValue.optionId = userGamecard.optionId;
    if (userGamecard.maxUserInstances)
        retValue.maxUserInstances = userGamecard.maxUserInstances;
    if (userGamecard.creationTime)
        retValue.creationTime = userGamecard.creationTime;
    if (userGamecard.activationTime)
        retValue.activationTime = userGamecard.activationTime;
    if (userGamecard.terminationTime)
        retValue.terminationTime = userGamecard.terminationTime;
    if (userGamecard.wonTime)
        retValue.wonTime = userGamecard.wonTime;

        if (userGamecard.pauseTime)
            retValue.pauseTime = userGamecard.pauseTime;
            if (userGamecard.resumeTime)
                retValue.resumeTime = userGamecard.resumeTime;

    return retValue;
};


// POST
api.updateHeadToHead = function (req, res) {

    if (req.body === 'undefined') {
        return res.status(400).json('No item Provided. Please provide valid team data.');
    }

    return Matches.findOneAndUpdate({ _id: req.params.gameid }, { headtohead: req.body }, function (err, result) {
        if (!err) {
            return res.status(200).json(result);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
};




/*
=====================  ROUTES  =====================
*/

router.route('/v1/data/match/:gameid/user/:userid/')
    .get(api.item);

router.route('/v1/data/match/:gameid/user/:userid/:trimby')
    .get(api.item);

router.route('/v1/data/match/:gameid/headtohead')
    .post(api.updateHeadToHead);


module.exports = router;
