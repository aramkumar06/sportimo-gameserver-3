// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    item = mongoose.models.trn_team_standings,
    logger = require('winston'),
    api = {};
var knockouts = mongoose.models.knockoutStandings,
    competitions = mongoose.models.trn_competitions;


api.items = function (req, res) {

    var skip = req.query.skip, limit = req.query.limit;

    var q = item.find({});
    q.populate('competition');
    q.populate('season', '-teams');

    if (skip)
        q.skip(skip);

    if (req.body.limit > 0)
        q.limit(limit);

    q.exec(function (err, items) {
        if (err) {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
        return res.send(items);
    });

};


// ALL
api.itemsSearch = function (req, res) {

    var skip = req.query.skip, limit = req.query.limit;
    var queries = {};

    var q = item.find(queries);
    q.populate('competition');
    q.populate('season', '-teams');

    if (skip)
        q.skip(skip);

    if (req.body.limit > 0)
        q.limit(limit);

    q.exec(function (err, items) {
        if (err) {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }

        return res.send(items);
    });
};

// POST
api.additem = function (req, res) {

    if (req.body == 'undefined') {
        return res.status(500).json('No item Provided. Please provide valid team data.');
    }

    var newItem = new item(req.body);

    return newItem.save(function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });

};


// GET
api.item = function (req, res) {
    // var id = req.params.id;
    // console.log(item);
    var season;
    if (req.params.season) {
        season = req.params.season;
        api.getCompetition(req, req.params.id, season, res);
    }
    else {
        competitions.findById(req.params.id, (err, competition) => {
            if (err) {
                logger.log('error', err.stack, req.body);
                return res.status(500).json(err);
            } else {
                if (!competition || !competition.season)
                    return res.status(404).json({});

                api.getCompetition(req, req.params.id, competition.season, res);
            }
        });
    }
    

};

api.getCompetition = function (req, competitionid, season, res) {

    item
        .findOne({ competition: competitionid, season: season })
        .populate('competition')
        .populate('season', '-teams')
        .exec(function (err, returnedItem) {

            if (!err) {
                if (returnedItem || season == 2016) {
                    knockouts.findOne({ competitionid: competitionid, season: season }, function (err, standingKnockouts) {
                        if (!err) {
                            if (returnedItem) {
                                returnedItem = returnedItem.toObject();
                                returnedItem.knockouts = standingKnockouts;
                            }
                            return res.status(200).json(returnedItem);
                        } else {
                            logger.log('error', err.stack, req.body);
                            return res.status(500).json(err);
                        }
                    });
                }
            } else {
                logger.log('error', err.stack, req.body);
                return res.status(500).json(err);
            }
        });
};

// PUT
api.edititem = function (req, res) {
    var id = req.params.id;
    var updateData = req.body;
    item
        .findById(id)
        .populate('competition')
        .populate('season', '-teams')
        .exec(function (err, returnedItem) {

            if (!updateData) {
                return res.status(400).json({ error: 'Data is not correct.' });
            }

            if (updateData.groups) {
                returnedItem.groups = updateData.groups;
                returnedItem.markModified('groups');
            }
            if (updateData.teams) {
                returnedItem.teams = updateData.teams;
                returnedItem.markModified('teams');
            }
            if (updateData.name) {
                returnedItem.name = updateData.name;
                returnedItem.markModified('name');
            }
            updateData.lastupdate = new Date();

            return returnedItem.save(function (err, data) {
                if (!err) {
                    return res.status(200).json(data);
                } else {
                    logger.log('error', err.stack, req.body);
                    return res.status(500).json(err);
                }
            }); //eo team.save
        });// eo team.find
};

// DELETE
api.deleteitem = function (req, res) {
    var id = req.params.id;

    item.removeById(id, (err) => {
        return res.status(200).json({ success: true });
    });
};



/*
=====================  ROUTES  =====================
*/

router.route('/v1/data/standings/')
    .get(api.itemsSearch);

router.post('/v1/data/standings', api.additem);

router.route('/v1/data/standings/country/:country')
    .get(api.items);


router.route('/v1/data/standings/:id')
    .get(api.item)
    .put(api.edititem)
    .delete(api.deleteitem);

router.route('/v1/data/standings/:id/:season')
    .get(api.item);

module.exports = router;
