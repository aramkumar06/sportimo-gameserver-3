'use strict';

// Module dependencies.
const mongoose = require('mongoose'),
    moment = require('moment'),
    ObjectId = mongoose.Types.ObjectId,
    Entity = mongoose.models.tournaments,
    LeaderboardDef = mongoose.models.trn_leaderboard_defs,
    async = require('async'),
    _ = require('lodash'),
    api = {};



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAll = function (clientId, skip, limit, cb) {
    var q = Entity.find({ client: clientId });
    q.populate({ path: 'leaderboardDefinition', populate: { path: 'prizes.prize' } });

    if (skip !== undefined)
        q.skip(skip * 1);

    if (limit !== undefined)
        q.limit(limit * 1);

    return q.exec(function (err, entities) {
        cbf(cb, err, entities);
    });
};


// GET
api.getById = function (clientId, id, cb) {
    Entity
        .findById(id)
        .populate({ path: 'leaderboardDefinition', populate: { path: 'prizes.prize' } })
        .exec(function (err, entity) {
            if (!err && entity && (clientId !== entity.client.toHexString()))
                err = new Error(`Conflict between provided clientId and tournament's referred client id`);

            cbf(cb, err, entity);
        });
};


// Returns results matching the searchTerm
api.search = function (clientId, searchTerm, competitionId, cb) {
    const searchExp = new RegExp(searchTerm, 'i');
    const query = {
        client: clientId,
        $or: [
            { 'aboutText.en': searchExp },
            { 'aboutText.ar': searchExp },
            { 'howToParticipateText.en': searchExp },
            { 'howToParticipateText.ar': searchExp },
            { 'howToPlayText.en': searchExp },
            { 'howToPlayText.ar': searchExp }
            //{ $text: { $search: searchTerm } }
        ]
    };
    if (competitionId)
        query.competitionid = competitionId;

    Entity.find(query)
        .populate({ path: 'leaderboardDefinition', populate: { path: 'prizes.prize' } })
        .exec(function (err, entities) {
            return cbf(cb, err, entities);
        });
};


api.getUnscheduledMatches = function (clientId, tournamentId, cb) {

    async.waterfall([
        (cbk) => {
            const query = { tournament: tournamentId };
            if (clientId)
                query.client = clientId;

            mongoose.models.trn_matches.find(query, cbk);
        },
        (tMatches, cbk) => {
            const tMatchIds = _.map(tMatches, 'match');
            const now = new Date();
            mongoose.models.matches.find({
                completed: { $ne: true },
                start: { $gt: now },
                _id: { $nin: tMatchIds }
            })
            .populate([{ path: 'home_team', select: 'name logo abbr' }, { path: 'away_team', select: 'name logo abbr' }, { path: 'competition', select: 'name logo' }])
            .select('-timeline -stats')
            .exec(cbk);
        }
    ], cb);
};


// POST
api.add = function (clientId, entity, cb) {

    if (entity === undefined) {
        cb('No entity provided. Please provide valid data to update.');
    }

    entity = new Entity(entity);
    entity.client = clientId;

    entity.save(function (err) {
        cbf(cb, err, entity.toObject());
    });
};


// PUT
api.edit = function (clientId, id, updateData, cb) {

    return Entity.findOneAndUpdate({ client: clientId, _id: id }, { $set: updateData })
    .populate({ path: 'leaderboardDefinition', populate: { path: 'prizes.prize' } })
    .exec(function (err, entity) {
        cbf(cb, err, entity);
    });
};


// DELETE
api.delete = function (clientId, id, cb) {
    return Entity.remove({ _id: id, client: clientId }).exec(function (err, entity) {
        return cbf(cb, err, true);
    });
};


// POST a new tournament leaderboard
api.addLeaderboardDef = function (clientId, id, entity, cb) {

    if (entity === undefined) {
        cb('No entity provided. Please provide valid data to update.');
    }

    entity = new LeaderboardDef(entity);
    entity.client = clientId;

    async.waterfall([
        cbk => entity.save(cbk),
        (savedDef, cbk) => Entity
            .findOneAndUpdate({ _id: new ObjectId(id), client: clientId }, { $set: { leaderboardDefinition: savedDef.id } })
            .populate({ path: 'leaderboardDefinition', populate: { path: 'prizes.prize' } })
            .exec(cbk)
    ], function (err, updatedEntity) {
        cbf(cb, err, updatedEntity.toObject());
    });
};


// PUT - update an existing tournament leaderboard
api.editLeaderboardDef = function (clientId, id, updateData, cb) {

    return LeaderboardDef.findOneAndUpdate({ _id: updateData._id, client: clientId }, {
        $set: {
            title: updateData.title,
            info: updateData.info,
            active: updateData.active,
            country: updateData.country,
            besstcores: updateData.bestscores,
            prizes: updateData.prizes
        }
    }, cb);
};


// DELETE an existing tournament leaderboard
api.deleteLeaderboardDef = function (clientId, id, cb) {

    async.waterfall([
        cbk => Entity.findOneAndUpdate({ _id: new ObjectId(id), client: clientId }, { $set: { leaderboardDefinition: null } }, cbk),
        (updated, cbk) => LeaderboardDef.remove({ _id: updated.leaderboardDefinition }, cbk)
    ], (err) => {
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
