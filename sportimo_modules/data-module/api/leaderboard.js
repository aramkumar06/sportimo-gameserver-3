// Module dependencies.
var express = require('express'),
    router = express.Router(),
    entity = require('../apiObjects/leaderboard'),
    logger = require('winston');







router.get('/v1/data/leaderboards', (req, res) => {

    var skip = null, limit = null;

    if (req.query.skip !== undefined)
        skip = req.query.skip;

    if (req.query.limit !== undefined)
        limit = req.query.limit;

    entity.getAll(req.query.client, req.query.tournament, req.query.match, skip, limit, function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});



router.post('/v1/data/leaderboards', (req, res) => {

    entity.add(req.body, function (err, data) {
        if (err) {
            res.status(500).json(err);
            logger.log('error', err.stack, req.body);
        }
        else {
            res.status(201).json(data);
        }
    });
});


router.put('/v1/data/leaderboards/:id', (req, res) => {

    return entity.edit(req.params.id, req.body, function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
});


router.delete('/v1/data/leaderboards/:id', (req, res) => {

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
