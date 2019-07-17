// Module dependencies.
var express = require('express'),
    router = express.Router(),
    prize = require('../apiObjects/prize'),
    logger = require('winston'),
    _ = require('lodash'),
    l=require('../config/lib');

var api = {};
// ALL
api.prizes = function (req, res) {
    var skip = null;
    var limit = null;
    var client = null;

    if (req.query.skip && _.isNumber(req.query.skip))
		skip = req.query.skip;

    if (req.query.limit && _.isNumber(req.query.limit))
        limit = req.query.limit;

    if (req.query.client)
		client = req.query.client;

	prize.getAllPrizes(client, skip, limit, function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// POST
api.addprize = function (req, res) {

    if (!req.body || !req.body.client)
        return res.status(400).json({ error: 'Invalid client' });

	prize.addPrize(req.body,function(err,data){
        if (err) {
            logger.log('error', err.stack, req.body);
            res.status(500).json(err);
        }
		else {
			res.status(201).json(data);
		}
	});	
};

// GET
api.prize = function (req, res) {
	var id = req.params.id;
	prize.getPrize(id,function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// PUT
api.editPrize = function (req, res) {
	var id = req.params.id;

	return prize.editPrize(id,req.body, function (err, data) {
		if (!err) {
			l.p("updated prize");
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
		
	});

};

// DELETE
api.deletePrize = function (req, res) {
	var id = req.params.id;
	return prize.deletePrize(id, function (err, data) {
		if (!err) {
			l.p("removed prize");
			return res.status(204).send();
		} else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

// DELETE All
api.deleteAllPrizes = function (req, res) {
	return prize.deleteAllPrizes( function (err, data) {
		if (!err) {
			l.p("removed All prize");
			return res.status(204).send();
		} else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

/*
=====================  ROUTES  =====================
*/


router.post('/v1/data/prizes',api.addprize);

router.route('/v1/data/prizes/:id')
.get(api.prize)
.put(api.editPrize)
.delete(api.deletePrize);


router.route('/v1/data/prizes')
    .get(api.prizes);
//.delete(api.deleteAllPrizes);

module.exports = router;
