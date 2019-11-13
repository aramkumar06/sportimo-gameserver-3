'use strict';

// Module dependencies.
var mongoose = require('mongoose'),
    ObjectId = mongoose.Types.ObjectId,
    moment = require('moment'),
    TeamStats = require('../../models/trn_teamstats'),
    api = {};



api.getForSeason = function (teamId, seasonId, cb) {
    return TeamStats.findOne({ team: teamId, season: seasonId }, cb);
};

api.create = function (stats, cb) {
    if (
        !stats.competition
        || !stats.season
        || !stats.team
        || !stats.stats
    ) {
        const err = new Error(`Cannot add team stats, invalid or incomplete data`);
        err.statusCode = 400;
        return cb(err);
    }

    var model = new TeamStats(stats);

    return model.save(cb);
};

api.update = function (id, stats, cb) {
    if (
        !stats.competition
        || !stats.season
        || !stats.team
        || !stats.stats
        || !stats._id
    ) {
        const err = new Error(`Cannot update team stats, invalid or incomplete data`);
        err.statusCode = 400;
        return cb(err);
    }

    stats.updated = new Date();

    return TeamStats.findByIdAndUpdate(id, stats, { new: true }, cb);
};



module.exports = api;