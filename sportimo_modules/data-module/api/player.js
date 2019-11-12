// Module dependencies.
var express = require('express'),
router = express.Router(),
player = require('../apiObjects/player'),
logger = require('winston'),
l=require('../config/lib');

var api = {};
// ALL
api.players = function (req, res) {
	var skip=null,limit=null;

	if(req.query.skip!=undefined)
		skip=req.query.skip;

	if(req.query.limit!=undefined)
		limit=req.query.limit;

	player.getAll(skip,limit,function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};
router.get('/v1/data/players', api.players);


api.getByTeam = function (req, res) {

	player.getByTeam(req.params.teamid, function(err,data){
		if (err) {
			res.status(500).json(err);
		} else {
			res.status(200).json(data);
		}
	}); 
};
router.get('/v1/data/players/team/:teamid', api.getByTeam);



// GET (search)
api.searchPlayers = function (req, res) {
    var searchTerm = req.params.searchTerm;
    var teamId = req.query.teamId;

    player.search(searchTerm, teamId, function (err, data) {
        if (err) {
            res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
};
router.get('/v1/data/players/search/:searchTerm', api.searchPlayers);


// GET one by id
api.player = function (req, res) {
	var id = req.params.id;
	player.getById(id,function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json({player: data});
		}
	}); 
};
router.get('/v1/data/players/:id', api.player);


// GET all teams by id
api.playerTeams = function (req, res) {

	var id = req.params.id;
    player.getTeams(id, function(err,data){
		if (err) {
			res.status(404).json(err);
		} else {
			res.status(200).json({teams: data});
		}
	}); 
};
router.get('/v1/data/players/:id/teams', api.playerTeams);


// POST
api.addplayer = function (req, res) {
	player.add(req.body,function	(err,data){
        if (err) {
            logger.log('error', err.stack, req.body);
            return res.status(err.statusCode || 500).json({ message: err.message, statusCode: err.statusCode || 500 });
        }
		else {
			res.status(201).json(data);
		}
	});	
};
router.post('/v1/data/players', api.addplayer);

// PUT
api.editPlayer = function (req, res) {
	var id = req.params.id;

	return player.edit(id,req.body, function (err, data) {
		if (!err) {
			l.p("updated player");
			return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(err.statusCode || 500).json({ message: err.message, statusCode: err.statusCode || 500 });
		}
	});
};
router.put('/v1/data/players/:id', api.editPlayer);


// DELETE
api.deletePlayer = function (req, res) {
	var id = req.params.id;
	return player.delete(id, function (err, data) {
		if (!err) {
			l.p("removed player");
			return res.status(204).send();
		} else {
            l.p(err);
            return res.status(err.statusCode || 500).json({ message: err.message, statusCode: err.statusCode || 500 });
		}
	});
};
router.delete('/v1/data/players/:id', api.deletePlayer);


// DELETE All
api.deleteAllPlayers = function (req, res) {
	return player.deleteAll( function (err, data) {
		if (!err) {
			l.p("removed All player");
			return res.status(204).send();
		} else {
			l.p(err);
			return res.status(500).json(err);
		}
	});
};
// router.delete('/v1/data/players', api.deleteAllPlayers);

/*
=====================  ROUTES  =====================
*/




router.get('/players/test',function(req,res){
	return player.test(function (err, data) {
		res.status(200).json(data);
	});
});

module.exports = router;
