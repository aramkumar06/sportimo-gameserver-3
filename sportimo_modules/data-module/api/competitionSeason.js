// Module dependencies.
var express = require('express'),
router = express.Router(),
Entity = require('../apiObjects/competitionSeason'),
logger = require('winston'),
l=require('../config/lib');

var api = {};
// ALL
api.getInstances = function (req, res) {
	var skip = null, limit = 10, status = null;

	if(req.query.skip !== undefined)
		skip = req.query.skip;

	if(req.query.limit !== undefined)
        limit = req.query.limit;

    if (req.query.status !== undefined)
        status = req.query.status;

    Entity.getAllInstances(skip, limit, status, function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// POST
api.addInstance = function (req, res) {
    Entity.addInstance(req.body.competition,function	(err,data){
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
api.getInstance = function (req, res) {
	var id = req.params.id;
    Entity.getInstance(id,function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};

// PUT
api.editInstance = function (req, res) {
	var id = req.params.id;  
    return Entity.editInstance(id,req.body, function (err, data) {
		if (!err) {
			l.p("updated competition");        
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}	
	});

};

// DELETE
api.deleteInstance = function (req, res) {
	var id = req.params.id;
    return Entity.deleteInstance(id, function (err, data) {
		if (!err) {
			l.p("removed competition");
			return res.status(204).send();
		} else {
            l.p(err);
            logger.log('error', err.stack, req.body);
			return res.status(500).json(err);
		}
	});
};

// DELETE All
api.deleteAllInstances = function (req, res) {
    return Entity.deleteAllInstances( function (err, data) {
		if (!err) {
			l.p("removed All competition");
			return res.status(204).send();
		} else {
			l.p(err);
			return res.status(500).json(err);
		}
	});
};

/*
=====================  ROUTES  =====================
*/


router.post('/v1/data/competition-seasons',api.addInstance);

router.route('/v1/data/competition-seasons/:id')
    .get(api.getInstance)
    .put(api.editInstance)
    .delete(api.deleteInstance);


router.route('/v1/data/competition-seasons')
    .get(api.getInstances)
    .delete(api.deleteAllInstances);


router.get('/competition-seasons/test',function(req,res){
    return Entity.test(function (err, data) {
		res.status(200).json(data);
	});
});

module.exports = router;
