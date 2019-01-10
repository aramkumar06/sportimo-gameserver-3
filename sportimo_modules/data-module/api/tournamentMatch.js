// Module dependencies.
var express = require('express'),
    router = express.Router(),
    entity = require('../apiObjects/tournamentMatch'),
    logger = require('winston');





router.get('/v1/data/matches', (req, res) => {

    var skip = null, limit = null;

    if (req.query.skip !== undefined)
        skip = req.query.skip;

    if (req.query.limit !== undefined)
        limit = req.query.limit;

    if (!req.query.client)
        return res.status(400).jon({ errorCode: 10116, statusCode: 400 });
    if (!req.query.tournament)
        return res.status(400).jon({ errorCode: 10116, statusCode: 400 });

    entity.getAll(req.query.tournament, skip, limit, function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});


router.get('/v1/data/matches/search/:searchTerm', (req, res) => {

    var searchTerm = req.params.searchTerm;

    entity.search(req.query.tournament, skipsearchTerm, function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});


router.post('/v1/data/matches', (req, res) => {

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


router.get('/v1/data/matches/:id', (req, res) => {

    var id = req.params.id;

    entity.getById(req.query.tournament, id, function (err, data) {
        if (err) {
            logger.log('error', err.stack);
            res.status(404).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});


router.put('/v1/data/matches/:id', (req, res) => {

    var id = req.params.id;

    return entity.edit(req.query.tournament, id, req.body, function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
});


router.delete('/v1/data/matches/:id', (req, res) => {

    var id = req.params.id;

    return entity.delete(req.query.tournament, id, function (err, data) {
        if (!err) {
            return res.status(204).send();
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
});



module.exports = router;
