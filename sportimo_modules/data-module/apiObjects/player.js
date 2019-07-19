'use strict';


// Module dependencies.
var mongoose = require('mongoose'),
    _ = require('lodash'),
  Player = mongoose.models.trn_players,
  Team = mongoose.models.trn_teams,
  api = {},
  l = require('../config/lib');



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAll = function (skip, limit, cb) {
  var q = Player.find();

  if (skip != undefined)
    q.skip(skip * 1);

  if (limit != undefined)
    q.limit(limit * 1);

  return q.exec(function (err, players) {
    cbf(cb, err, players);
  });
};


// Returns results matching the searchTerm
api.search = function (searchTerm, teamId, cb) {

    const searchExp = new RegExp(searchTerm, 'i');
    let playersDto = [];

    var query = {
        $or: [
            { 'name.en': searchExp },
            { 'name.ar': searchExp },
            { 'shortName.en': searchExp },
            { 'shortName.ar': searchExp },
            { 'abbr': searchExp },
            { 'position': searchExp }
            //{ $text: { $search: searchTerm } }
        ]
    };
    if (teamId) {
        Team
            .findOne({ _id: teamId })
            .populate({ path: 'players', match: query })
            .exec((err, team) => {
                if (err)
                    return cb(err);

                if (!team)
                    return cb(null, []);

                const teamName = team.name && team.name.en ? team.name.en : null;

                const players = team.players;
                _.forEach(players, (player) => {
                    var playerDto = player.toObject();
                    if (teamName)
                        playerDto.team = teamName;
                    playerDto.type = 'player';
                    playersDto.push(playerDto);
                });
                return cbf(cb, err, playersDto);

            });
    }
    else {
        Player
            .find(query)
            .limit(100)
            .exec(function (err, players) {
                _.forEach(players, (player) => {
                    var playerDto = player.toObject();
                    playerDto.type = 'player';
                    playersDto.push(playerDto);
                });
                return cbf(cb, err, playersDto);
            });
    }

};

api.getByTeam = function (teamId, cb) {

    Team
        .findOne({ _id: teamId })
        .populate({ path: 'players', select: 'name position' })
        .exec((err, team) => {
            if (err)
                return cb(err);

            if (!team)
                return cb(null, []);

            const teamName = team.name && team.name.en ? team.name.en : null;

            const players = team.players;
            return cbf(cb, err, players);

        });

};

// GET
api.getById = function (id, cb) {

    var q = Player.findOne({ '_id': id });

    return q.exec(function (err, player) {
        cbf(cb, err, player);
    });
};


api.getTeams = function (id, cb) {
    Team
        .findOne({ players: id })
        .exec((err, teams) => {
            cbf(cb, err, teams);
        });
};


// POST
api.add = function (player, cb) {

    if (!player) {
        cb('No Player Provided. Please provide valid player data.');
    }

    player = new Player(player);
    player.save(function (err) {
        cbf(cb, err, player);
    });
};

// PUT
api.edit = function (id, updateData, cb) {

    return Player.findByIdAndUpdate(id, { $set: updateData }, function (err, player) {
        cbf(cb, err, player);
    });
};

// DELETE
api.delete = function (id, cb) {

    return Player.findById(id).remove().exec(function (err, player) {
        return cbf(cb, err, true);
    });
};


/*
========= [ SPECIAL METHODS ] =========
*/


//TEST
api.test = function (cb) {
    cbf(cb, false, { result: 'ok' });
};


api.deleteAll = function (cb) {
    return Player.remove({}, function (err) {
        cbf(cb, err, true);
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
