'use strict';

// Module dependencies.
var mongoose = require('mongoose'),
    moment = require('moment'),
    ObjectId = mongoose.Types.ObjectId,
    _ = require('lodash'),
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

        if (!err && entities)
            entities = _.orderBy(entities, [ e => e.match.start ], ['desc'] );

        cbf(cb, err, entities);
    });
};




// GET
api.getById = function (tournamentId, id, cb) {

    const query = { _id: new ObjectId(id) };
    if (tournamentId)
        query.tournament = new ObjectId(tournamentId);

    Entity
        .findOne(query)
        .populate([{ path: 'leaderboardDefinition', populate: 'prizes.prize' }, { path: 'match', populate: [{ path: 'competition', select: 'name logo graphics' }, { path: 'home_team', select: 'name abbr logo' }, { path: 'away_team', select: 'name abbr logo' }] }])
        .exec(function (err, entity) {
            if (entity && tournamentId && tournamentId !== entity.tournament)
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

    //const clientExclusiveMatch = !entity.moderation || entity.moderation.length === 0;
    const simulationMatch = entity.moderation && _.some(entity.moderation, m => m.simulatedfeed);

    let leaderboardTemplate = null;

    async.waterfall([
        (cbk) => mongoose.models.trn_leaderboard_templates.find({ $or: [{ client: entity.client, tournament: entity.tournament }, { client: entity.client, tourmanent: null }] }).limit(1).exec(cbk),
        (templates, cbk) => {
            // Try finding the referrenced match, if existing already in the matches collection, that is not completed

            const matchQuery = {
                completed: { $ne: true }
            };
            if (templates && templates.length > 0)
                leaderboardTemplate = templates[0];

            if (!simulationMatch && entity.moderation && entity.moderation.length > 0) {
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

            return Match.find(matchQuery, '_id moderation name').limit(1).exec(cbk);
        },
        (matches, cbk) => {
            if (matches && matches.length > 0) {
                entity.match = matches[0];

                return cbk(null, entity.match);
            }
            else {
                const mergedData = _.merge(_.cloneDeep(EmptyMatch), entity);
                const newMatch = new Match(mergedData);
                newMatch.exclusiveClient = entity.client;
                newMatch.timeline = [{
                    timed: false,
                    text: { en: "Pre Game", ar: "ماقبل المباراة" }
                }];
                newMatch.markModified('settings');

                return newMatch.save(cbk);
            }
        },
        (savedMatch, cbk) => {

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

        const savedTournamentMatch = parallelResults[0];

        const MatchModeration = require('../../match-moderation');
        MatchModeration.LoadMatchFromDB(savedTournamentMatch.id, function (err) {
            return savedTournamentMatch.populate('match', cb);
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
    let clientId = null;

    async.waterfall([
        cbk => Entity.findOneAndRemove({ _id: id, tournament: tournamentId }).exec(cbk),
        (trnMatch, cbk) => {
            if (!trnMatch)
                return cbk(null);

            matchId = trnMatch.match.toHexString();
            clientId = trnMatch.client;
            return Entity.find({ match: matchId }, cbk);
        },
        // Try removing the referenced match if it is exclusive to this client
        (otherTrnMatches, cbk) => {
            if (otherTrnMatches && otherTrnMatches.length > 0)
                return cbk(null);

            Match.remove({ _id: matchId, exclusiveClient: clientId }, cbk);
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
