'use strict';

// Module dependencies.
var mongoose = require('mongoose'),
    moment = require('moment'),
    ObjectId = mongoose.Schema.Types.ObjectId,
    Entity = mongoose.models.trn_matches,
    Match = mongoose.models.matches,
    api = {};



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAll = function (tournamentId, skip, limit, cb) {
    var q = Entity.find({ tournament: tournamentId, isHidden: {$ne: true} });
    q.populate('match');

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
        .populate('match')
        .exec(function (err, entity) {
            if (entity && tournamentId !== entity.tournament)
                err = new Error(`Conflict between the path-provided tournamentId and tournament's referred tournament id`);

            cbf(cb, err, entity);
        });
};


// Returns results matching the searchTerm
api.search = function (tournamentId, searchTerm, cb) {
    const searchExp = new RegExp(searchTerm, 'i');

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
            Entity.find(query, cbk);
        }
    ], (parallelErr, results) => {
        cbf(cb, parallelErr, results);
    });

};


// POST
api.add = function (tournamentId, entity, cb) {

    if (!entity || !entity.client || !entity.match || !entity.match.start) {
        cb('No (valid) entity provided. Please provide valid data to insert.');
    }

    entity = new Entity(entity);
    entity.tournament = tournamentId;
    let matchFound = false;

    async.waterfall([
        (cbk) => {
            // Try finding the referrenced match, if existing already in the matches collection
            let ref, searchFrom, searchTo = new Date();
            searchFrom.setUTCHours(ref.getUTCHours() - 1);
            searchTo.setHours(ref.getUTCHours() + 1);

            return Match.findOne({ start: { $gt: searchFrom, $lt: searchTo }, name: entity.match.name }, cbk);
        },
        (match, cbk) => {
            if (match) {
                entity.match = match;
                matchFound = true;

                return entity.save(cbk);
            }
            else {
                const newMatch = new Match(entity.match);
                Match.insert(newMatch, cbk);
            }
        },
        (savedMatch, cbk) => {
            if (matchFound)
                return cbk(null, savedMatch);

            entity.match = savedMatch;
            return entity.save(cbk);
        }
    ], (waterfallErr, savedMatch) => {
        if (waterfallErr)
            return cb(waterfallErr);

        return Entity.populate('match', cb);
    });
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
        (cbk) => { return Entity.remove({ _id: id, tournament: tournamentId }).exec(cbk); },
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
        return cbf(cb, err, true);
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
