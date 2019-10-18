'use strict';

// Module dependencies.
const mongoose = require('mongoose'),
    moment = require('moment'),
    ObjectId = mongoose.Types.ObjectId,
    Entity = require('../../models/tournament'),
    TournamentMatch = require('../../models/trn_match'),
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
            { 'titleText.en': searchExp },
            { 'v.ar': searchExp },
            { 'infoText.en': searchExp },
            { 'infoText.ar': searchExp },
            { 'detailText.en': searchExp },
            { 'detailText.ar': searchExp }
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
            .populate([{ path: 'home_team', select: 'name shortName logo abbr' }, { path: 'away_team', select: 'name shortName logo abbr' }, { path: 'competition', select: 'name logo' }])
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

    if (!updateData)
        return Entity.findById(id, cb);

    updateData.updated = new Date();
    let tmatchSettings = _.pick(updateData.settings, ['sendPushes', 'pushNotifications', 'gameCards', 'displayContestParticipations']);
    let entity = null;

    async.waterfall([

        cbk => Entity
            .findOneAndUpdate({ client: clientId, _id: id }, { $set: updateData }, {  })
            .populate({ path: 'leaderboardDefinition', populate: { path: 'prizes.prize' } })
            .exec(cbk),

        (updatedEntity, cbk) => {
            entity = updatedEntity;

            if (_.isEqual(entity.settings, updateData.settings))
                return cbk(null, []);

            TournamentMatch
                .find({ tournament: id })
                .populate({ path: 'match', match: { completed: { $ne: true }, state: 0 }, select: 'state' })
                .exec(cbk);
        },

        (tmatches, cbk) => {
            const futureTournamentMatches = _.filter(tmatches, t => !!t.match);
            const futureTournamentMatchIds = _.map(futureTournamentMatches, '_id');

            TournamentMatch.updateMany({ _id: { $in: futureTournamentMatchIds } }, { $set: { settings: tmatchSettings } }, cbk);
        },

        (updateResult, cbk) => async.nextTick(() => cbk(null, entity))

    ], cb);
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
            .findOneAndUpdate({ _id: new ObjectId(id), client: clientId }, { $set: { leaderboardDefinition: savedDef.id } }, { new: true })
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
    },
    { new: true },
    cb);
};


// DELETE an existing tournament leaderboard
api.deleteLeaderboardDef = function (clientId, id, cb) {

    async.waterfall([
        cbk => Entity.findOneAndUpdate({ _id: new ObjectId(id), client: clientId }, { $set: { leaderboardDefinition: null } }, { new: true }, cbk),
        (updated, cbk) => LeaderboardDef.remove({ _id: updated.leaderboardDefinition }, cbk)
    ], (err) => {
        return cbf(cb, err, true);
    });
};


/*
========= [ CACHE REGENERATION METHODS ] =========
*/

api.regenerateTournamentCache = function (cb) {

    const Clients = require('../../models/trn_client');
    const Scores = require('../../models/trn_score');
    const Subscriptions = require('../../models/trn_subscription');
    const Tournaments = Entity;
    const TournamentMatch = require('../../models/trn_match');
    let clients = [];
    let tournaments = [];

    async.waterfall([
        cbk => Clients.find({}, cbk),
        (allClients, cbk) => {

            clients = allClients;
            const clientIds = _.map(clients, c => c._id);

            return Tournaments.find({ client: { $in: clientIds }, state: { $ne: 'deleted' } }, cbk);
        },
        (allTournaments, cbk) => {

            tournaments = allTournaments;
            const tournamentIds = _.map(tournaments, t => t._id);

            //cbk => TournamentMatch.count({ tournament: id, isHidden: { $ne: true } }, cbk),
            //cbk => Scores.count({ tournament: id }, cbk),
            async.parallel([
                icbk => TournamentMatch.aggregate([
                    { $match: { tournament: { $in: tournamentIds }, isHidden: { $ne: true } } },
                    {
                        $group: {
                            _id: '$tournament',
                            //id: { $toString: '$tournament' },
                            count: { $sum: 1 }
                        }
                    }
                ], icbk),
                icbk => Subscriptions.aggregate([
                    { $match: { state: 'active', tournament: { $in: tournamentIds } } },
                    {
                        $group: {
                            _id: '$tournament',
                            //id: { $toString: '$tournament' },
                            count: { $sum: 1 }
                        }
                    }
                ], icbk)
            ], cbk);
        }
    ], (err, results) => {
        const allMatches = results[0] || {};
        const allParticipations = results[1] || {};

        _.forEach(tournaments, t => {

            const foundInMatches = _.find(allMatches, m => m._id.toHexString() === t.id);
            if (foundInMatches)
                t.matches = foundInMatches.count;

            const foundInParticipations = _.find(allParticipations, p => p._id.toHexString() === t.id);
            if (foundInParticipations)
                t.participations = foundInParticipations.count;
        });

        return async.eachLimit(tournaments, 100,
            (t, cbk) => t.save(cbk),
            cb);
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
