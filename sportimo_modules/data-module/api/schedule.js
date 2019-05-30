// Module dependencies.
var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    item = mongoose.models.matches,
    competition = mongoose.models.trn_competitions,
    settings = mongoose.models.settings,
    defaultMatch = require('../config/empty-match'),
    logger = require('winston'),
    api = {};


api.items = function (req, res) {

    var skip = null, limit = null;

    item
        .find({ })
        .populate({
            path: 'match',
            match: {  },
            select: 'home_team home_score away_team away_score competition time state start completed',
            populate: [{ path: 'home_team', select: 'name logo' }, { path: 'away_team', select: 'name logo' }, { path: 'competition' }]
        })
        .sort({ 'match.start': -1 })
        .limit(50)
    .exec( (err, items) => {

        return res.send(items);
    });
};


// ALL
api.itemsSearch = function (req, res) {
    var skip = null, limit = null;
    //  publishDate: { $gt: req.body.minDate, $lt: req.body.maxDate }, type: req.body.type, tags: { "$regex": req.body.tags, "$options": "i" }
    var queries = {};

    if (req.body.minDate != undefined || req.body.maxDate != undefined) {
        queries.publishDate = {};
        if (req.body.minDate == req.body.maxDate) {
            queries.publishDate.$eq = req.body.minDate;
        } else {
            if (req.body.minDated)
                queries.publishDate.$gte = req.body.minDate;
            if (req.body.maxDate)
                queries.publishDate.$lt = req.body.maxDate;
        }
    }

    if (req.body.tags)
        queries['tags.name.en'] = { "$regex": req.body.tags, "$options": "i" };

    if (req.body.related)
        queries['tags._id'] = req.body.related;

    if (req.body.type)
        queries.type = req.body.type;

    var q = item.find(queries)
        .populate( [{ path: 'home_team', select: 'name logo' }, { path: 'away_team', select: 'name logo' }, { path: 'competition' }]);
    q.select('home_team home_score away_team away_score donttouch completed competition time state start disabled');
    q.sort({ 'start': -1 });

    if (req.body.limit)
        q.limit(req.body.limit);


    q.exec(function (err, items) {

        return res.send(items);
    });

};

// POST
api.additem = function (req, res) {

    if (req.body == 'undefined') {
        return res.status(400).json('No item Provided. Please provide valid team data.');
    }

    if (!req.body.competition)
        return res.status(400).json('No competition Provided. Please provide valid competition ID.');
    if (!req.body.season)
        return res.status(400).json('No season Provided. Please provide valid season ID.');

    req.body.timeline = [];
    req.body.timeline.push({
        timed: false,
        text: { en: "Pre Game", ar: "ماقبل المباراة" }
    });

    var mergedData = _.merge(_.cloneDeep(defaultMatch), req.body);
    var newItem = new item(mergedData);
    newItem.markModified('settings');

    return newItem.save(function (err, data) {
        if (err) {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        } else {
            const MatchModeration = require('../../match-moderation');

            MatchModeration.LoadMatchFromDB(data._id, function () {
                return res.status(200).json(data);
            });
        }
    });
};

api.updateVisibility = function (req, res) {

    // console.log(req.body.competitionid);


    item.find({ competition: req.body.competitionid }, function (err, matches) {

        if (matches) {
            matches.forEach(function (match) {
                match.visiblein = req.body.visiblein;
                match.save(function (err, data) {
                    if (err) {
                        logger.log('error', err.stack, req.body);
                        return res.status(500).json(data);
                    }
                })
            })
            res.status(200).send();
        } else {
            console.log("404");
            res.status(404).send();
        }
    });


};

// GET
api.item = function (req, res) {
    var id = req.params.id;
    item.findById(id, function (err, returnedItem) {
        if (!err) {
            return res.status(200).json(returnedItem);
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
    item.findById(id, function (err, returnedItem) {

        if (updateData === undefined || returnedItem === undefined) {
            return res.status(400).json("Error: Data is not correct.");
        }

        returnedItem.photo = updateData.photo;
        returnedItem.tags = updateData.tags;
        returnedItem.publishDate = updateData.publishDate;
        returnedItem.type = updateData.type;
        returnedItem.publication = updateData.publication;
        // art.markModified('tags');

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

api.edititemsettings = function (req, res) {
    var id = req.params.id;
    var updateData = req.body;
    item.findById(id, function (err, returnedItem) {

        if (updateData === undefined || returnedItem === undefined) {
            return res.status(400).json("Error: Data is not correct.");
        }

        returnedItem.settings = updateData;

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
    item.find({ _id: id }).remove(function (err, data) {
        if (!err) {
            return res.status(200).json(data);
        } else {
            logger.log('error', err.stack, req.body);
            return res.status(500).json(err);
        }
    });
};



/*
=====================  ROUTES  =====================
*/

// Request the schedule based on user's country
router.route('/v1/data/schedule/country/:country')
    .get(api.items);

router.route('/v1/data/schedule/')
    .get(api.itemsSearch);

router.post('/v1/data/schedule', api.additem);

router.post('/v1/data/schedule/visibility', api.updateVisibility);

router.route('/v1/data/schedule/:id/settings')
    .put(api.edititemsettings);

router.route('/v1/data/schedule/:id')
    .get(api.item)
    .put(api.edititem)
    .delete(api.deleteitem);

module.exports = router;
