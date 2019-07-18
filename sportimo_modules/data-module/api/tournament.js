// Module dependencies.
var express = require('express'),
    router = express.Router(),
    entity = require('../apiObjects/tournament'),
    logger = require('winston');



router.post('/v1/data/tournaments/:id/leaderboard', (req, res) => {

    var id = req.params.id;

    return entity.addLeaderboardDef(req.query.client, id, req.body, function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
});


router.put('/v1/data/tournaments/:id/leaderboard', (req, res) => {

    var id = req.params.id;

    return entity.editLeaderboardDef(req.query.client, id, req.body, function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
});


router.delete('/v1/data/tournaments/:id/leaderboard', (req, res) => {

    var id = req.params.id;

    return entity.deleteLeaderboardDef(req.query.client, id, function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
});



router.get('/v1/data/tournaments/search/:searchTerm', (req, res) => {

    var searchTerm = req.params.searchTerm;
    var competitionId = req.query.competitionId;

    entity.search(req.query.client, searchTerm, competitionId, function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});

// find and return all unscheduled matches for a tournament from the future not completed ones
router.get('/v1/data/tournaments/:id/unscheduled_matches', (req, res) => {

    var id = req.params.id;

    entity.getUnscheduledMatches(req.query ? req.query.client : null, id, (err, data) => {
        if (err) {
            logger.log('error', err.stack);
            res.status(404).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});


router.get('/v1/data/tournaments/:id/', (req, res) => {

    var id = req.params.id;

    entity.getById(req.query.client, id, function (err, data) {
        if (err) {
            logger.log('error', err.stack);
            res.status(404).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});


router.get('/v1/data/tournaments', (req, res) => {

    var skip = null, limit = null;

    if (req.query.skip !== undefined)
        skip = req.query.skip;

    if (req.query.limit !== undefined)
        limit = req.query.limit;

    entity.getAll(req.query.client, skip, limit, function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});





router.post('/v1/data/tournaments', (req, res) => {

    entity.add(req.query.client, req.body, function (err, data) {
        if (err) {
            res.status(500).json(err);
            logger.log('error', err.stack, req.body);
        }
        else {
            res.status(201).json(data);
        }
    });
});


router.put('/v1/data/tournaments/:id', (req, res) => {

    var id = req.params.id;

    return entity.edit(req.query.client, id, req.body, function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
});


router.delete('/v1/data/client/:clientId/tournaments/:id', (req, res) => {

    var id = req.params.id;

    return entity.delete(req.query.client, id, function (err, data) {
        if (!err) {
            return res.status(204).send();
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
});



module.exports = router;
