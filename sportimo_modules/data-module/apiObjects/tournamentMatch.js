'use strict';

// Module dependencies.
var mongoose = require('mongoose'),
    moment = require('moment'),
    ObjectId = mongoose.Schema.Types.ObjectId,
    async = require('async'),
    Entity = mongoose.models.trn_matches,
    Match = mongoose.models.matches,
    EmptyMatch = require('../config/empty-match'),
    api = {};


/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAll = function (tournamentId, skip, limit, cb) {
    var q = Entity.find({ tournament: tournamentId });
    q.populate([{ path: 'leaderboardDefinition', populate: 'prizes.prize' }, { path: 'match', populate: [{ path: 'competition', select: 'name logo graphics' }, { path: 'home_team', select: 'name abbr logo' }, { path: 'away_team', select: 'name abbr logo' }] }]);

    if (skip !== undefined)
        q.skip(skip * 1);

    if (limit !== undefined)
        q.limit(limit * 1);

    return q.exec(function (err, entities) {
        cbf(cb, err, entities);
    });
};




// GET
api.getById = function (tournamentId, id, cb) {
    Entity
        .findOne({ _id: id, tournament: tournamentId })
        .populate([{ path: 'leaderboardDefinition', populate: 'prizes.prize' }, { path: 'match', populate: [{ path: 'competition', select: 'name logo graphics' }, { path: 'home_team', select: 'name abbr logo' }, { path: 'away_team', select: 'name abbr logo' }] }])
        .exec(function (err, entity) {
            if (entity && tournamentId !== entity.tournament)
                err = new Error(`Conflict between the path-provided tournamentId and tournament's referred tournament id`);

            cbf(cb, err, entity);
        });
};


// Returns results matching the searchTerm
api.search = function (tournamentId, searchExp, cb) {

    const searchTerm = new RegExp(searchExp, 'i');

    async.waterfall([
        (cbk) => {
            let query = {
                $or: [
                    { name: searchTerm },
                    { home_team: searchTerm },
                    { away_team: searchTerm },
                    { competition: searchTerm },
                    { headtohead: searchTerm },
                    { 'moderation.parsername': searchTerm },
                    { 'moderation.parserid': searchTerm }
                ]
            };
            mongoose.models.matches(query, cbk);
        },
        (matches, cbk) => {
            const matchIds = _.map(matches, '_id');
            let query = {
                tournament: tournamentId,
                match: { $in: matchIds }
            };
            Entity.find(query)
            .populate([{ path: 'leaderboardDefinition', populate: 'prizes.prize' }, { path: 'match', populate: [{ path: 'competition', select: 'name logo graphics' }, { path: 'home_team', select: 'name abbr logo' }, { path: 'away_team', select: 'name abbr logo' }] }])
            .exec(cbk);
        }
    ], (parallelErr, results) => {
        cbf(cb, parallelErr, results);
    });

};


// POST
api.add = function (entity, cb) {


    if (!entity || !entity.client || !entity.tournament || !entity.home_team || !entity.away_team || !entity.start || !entity.season) {
        return cb('No (valid) entity provided. Please provide valid data to insert.');
    }

    if (!entity.name) {
        entity.name = `${entity.home_team.name && entity.home_team.name.en ? entity.home_team.name.en : 'home_team'} - ${entity.away_team.name && entity.away_team.name.en ? entity.away_team.name.en : 'away_team'}`;
    }

    // Rectify id refs
    if (entity.home_team._id)
        entity.home_team = entity.home_team._id;
    if (entity.away_team._id)
        entity.away_team = entity.away_team._id;

    if (!entity.disabled)
        entity.disabled = false;

    let leaderboardTemplate = null;

    async.waterfall([
        (cbk) => mongoose.models.trn_leaderboard_templates.find({ $or: [{ client: entity.client, tournament: entity.tournament }, { client: entity.client, tourmanent: null }] }, cbk),
        (templates, cbk) => {
            // Try finding the referrenced match, if existing already in the matches collection, that is not completed

            const matchQuery = {
                completed: { $ne: true }
            };
            if (templates && templates.length > 0)
                leaderboardTemplate = templates[0];

            if (entity.moderation && entity.moderation.length > 0) {
                matchQuery.$or = [];
                entity.moderation.forEach((m) => {
                    matchQuery.$or.push({
                        moderation: {
                            $elemMatch: {
                                parsername: m.parsername,
                                parserid: m.parserid
                            }
                        }
                    });
                });
            }
            else
                return cbk(null, []);

            return Match.find(matchQuery, '_id moderation name', cbk);
        },
        (matches, cbk) => {
            if (matches && matches.length > 0) {
                entity.match = matches[0];

                return cbk(null, entity.match, 0);
            }
            else {

                const mergedData = _.merge(_.cloneDeep(defaultMatch), entity);
                const newMatch = new Match(mergedData);
                newMatch.timeline = [{
                    timed: false,
                    text: { en: "Pre Game", ar: "ماقبل المباراة" }
                }];
                newMatch.markModified('settings');

                return newMatch.save(cbk);
            }
        },
        (savedMatch, savedQuantity, cbk) => {

           if (!entity.match)
                entity.match = savedMatch;

            const tMatch = new Entity(entity);

            if (leaderboardTemplate) {
                // Create a leaderboardDefinition as well
                const leaderboardDef = new mongoose.models.trn_leaderboard_defs({
                    client: tMatch.client,
                    tournament: tMatch.tournament,
                    tournament_match: tMatch,
                    match: tMatch.match,
                    title: leaderboardTemplate.title,
                    info: leaderboardTemplate.info,
                    active: true,
                    bestscores: leaderboardTemplate.bestscores,
                    prizes: leaderboardTemplate.prizes
                });
                tMatch.leaderboardDefinition = leaderboardDef;
            }

            return async.parallel([
                (icbk) => tMatch.save(icbk),
                (icbk) => {
                    if (leaderboardTemplate && tMatch.leaderboardDefinition) {
                        return tMatch.leaderboardDefinition.save(icbk);
                    }
                    else
                        return async.setImmediate(() => icbk(null));
                }],
                cbk);
        }
    ], (waterfallErr, parallelResults) => {
        if (waterfallErr)
            return cb(waterfallErr);

        const savedMatch = parallelResults[0][0];

        const MatchModeration = require('../../match-moderation');
        MatchModeration.LoadMatchFromDB(savedMatch.id, function (err) {
            return savedMatch.populate('match', cb);
        });
    });




    //if (!entity || !entity.client || !entity.match || !entity.match.start) {
    //    cb('No (valid) entity provided. Please provide valid data to insert.');
    //}

    //entity = new Entity(entity);
    //entity.tournament = tournamentId;
    //let matchFound = false;

    //async.waterfall([
    //    (cbk) => {
    //        // Try finding the referrenced match, if existing already in the matches collection
    //        let ref, searchFrom, searchTo = new Date();
    //        searchFrom.setUTCHours(ref.getUTCHours() - 1);
    //        searchTo.setHours(ref.getUTCHours() + 1);

    //        return Match.findOne({ start: { $gt: searchFrom, $lt: searchTo }, name: entity.match.name }, cbk);
    //    },
    //    (match, cbk) => {
    //        if (match) {
    //            entity.match = match;
    //            matchFound = true;

    //            return entity.save(cbk);
    //        }
    //        else {
    //            const newMatch = new Match(entity.match);
    //            Match.insert(newMatch, cbk);
    //        }
    //    },
    //    (savedMatch, cbk) => {
    //        if (matchFound)
    //            return cbk(null, savedMatch);

    //        entity.match = savedMatch;
    //        return entity.save(cbk);
    //    }
    //], (waterfallErr, savedMatch) => {
    //    if (waterfallErr)
    //        return cb(waterfallErr);

    //    return Entity.populate('match', cb);
    //});
};


// PUT
api.edit = function (tournamentId, id, updateData, cb) {

    async.waterfall([
        (cbk) => {
            Entity.findOneAndUpdate({ _id: id, tournament: tournamentId }, { $set: updateData }, cbk);
        },
        (result, cbk) => {
            let matchId = updateData.id;
            Match.findOneAndUpdate({ _id: matchId }, { $set: updateData.match }, cbk);
        },
        (result, cbk) => {
            Entity.findOne({ _id: id, tournament: tournamentId }).populate('match').exec(cbk);
        }
    ], (err, result) => {
        cbf(cb, err, result);
    });
};


// DELETE
api.delete = function (tournamentId, id, cb) {

    let matchId = null;

    async.waterfall([
        (cbk) => { return Entity.findOneAndRemove({ _id: id, tournament: tournamentId }).exec(cbk); },
        (trnMatch, cbk) => {
            if (!trnMatch)
                return cbk(null);

            matchId = trnMatch.match.toHexString();
            return Entity.find({ match: matchId }, cbk);
        },
        // Try removing the referenced match if no other trn_matches document reffers to it
        (otherTrnMatches, cbk) => {
            if (otherTrnMatches && otherTrnMatches.length > 0)
                return cbk(null);

            Match.remove({ _id: matchId }, cbk);
        }
    ], (err, results) => {

        const MatchModeration = require('../../match-moderation');

        MatchModeration.RemoveFromLookup(id, function () {
            return cbf(cb, err, true);
        });

    });

};



/*
========= [ UTILITY METHODS ] =========
*/

/** Callback Helper
 * @param  {Function} - Callback Function
 * @param  {Object} - The Error Object
 * @param  {Object} - Data Object
 * @return {Function} - Callback
 */

var cbf = function (cb, err, data) {
    if (cb && typeof (cb) == 'function') {
        if (err) cb(err);
        else cb(false, data);
    }
};



module.exports = api;
