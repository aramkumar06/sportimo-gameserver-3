// Module dependencies.
var express = require('express'),
    router = express.Router(),
    entity = require('../apiObjects/leaderboard'),
    logger = require('winston');







router.get('/v1/data/leaderboards/tournament', (req, res) => {

    var clientId = req.query.client;

    var skip = null, limit = null;

    if (req.query.skip !== undefined)
        skip = req.query.skip;

    if (req.query.limit !== undefined)
        limit = req.query.limit;

    entity.getAllTournament(clientId, skip, limit, function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});


router.get('/v1/data/leaderboards/match', (req, res) => {

    var clientId = req.query.client;

    var skip = null, limit = null;

    if (req.query.skip !== undefined)
        skip = req.query.skip;

    if (req.query.limit !== undefined)
        limit = req.query.limit;

    entity.getAllMatch(clientId, skip, limit, function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});


router.get('/v1/data/leaderboards/:id/leaders', (req, res) => {

    var clientId = req.query.client;
    var leaderboardId = req.params.id;

    entity.getLeaders(clientId, leaderboardId,  function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});





module.exports = router;
