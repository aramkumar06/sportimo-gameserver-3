'use strict';

// Module dependencies.
var mongoose = require('mongoose'),
  moment = require('moment'),
  Team = mongoose.models.trn_teams,
  TeamStats = mongoose.models.trn_teamstats,
  api = {},
  parserName = 'Statscore';



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllTeams = function (skip, limit, cb) {
    var q = Team.find();

    if (skip !== undefined)
        q.skip(skip * 1);

    if (limit !== undefined)
        q.limit(limit * 1);

    return q.exec(function (err, teams) {
        cbf(cb, err, teams);
    });
};

// GET
api.getTeam = function (id, cb) {
    var q = Team.findById(id);

    //q.populate('nextmatch.home_team', 'name logo');
    //q.populate('nextmatch.away_team', 'name logo');
    //q.populate('lastmatch.home_team', 'name logo');
    //q.populate('lastmatch.away_team', 'name logo');
    //q.populate('topscorer', 'name uniformNumber pic stats lastActiveSeason')


    q.exec(function (err, team) {
        cbf(cb, err, team);
    });
};

api.getTeamFull = function (id, cb) {


    async.parallel([

        (cbk) => {
            Team.findById(id).populate('players').exec(cbk);
        },
        (cbk) => {
            TeamStats.find({ team: id }, cbk);
        }
    ], (parallelErr, results) => {

        const team = results[0];
        const stats = results[1];

        if (!team)
            return cb(null);

        team.players = _.sortBy(team.players, function (element) {

            var rank = {
                "Goalkeeper": 1,
                "Defender": 2,
                "Midfielder": 3,
                "Forward": 4
            };

            return rank[element.position];
        });

        if (stats)
            team.stats = stats;

        cbf(cb, parallelErr, team);
    });
};


// Returns results matching the searchTerm
api.searchTeams = function (searchTerm, competitionId, cb) {
    var query = { $or: [{ 'name.en': new RegExp(searchTerm, 'i') }, { $text: { $search: searchTerm } }] };
    if (competitionId)
        query.competitionid = competitionId;

    Team.find(query)
        .exec(function (err, teams) {
            return cbf(cb, err, teams);
        });
};


api.teamFavoriteData = function (id, cb) {

    var q = Team.findOne({ _id: id });
    ////q.populate('nextmatch.home_team', 'name logo');
    ////q.populate('nextmatch.away_team', 'name logo');
    ////q.populate('lastmatch.home_team', 'name logo');
    ////q.populate('lastmatch.away_team', 'name logo');
    //q.populate('competitionid', 'name parserids');
    //q.populate('topscorer', 'name uniformNumber pic stats.season.goalsTotal');
    //q.populate('topassister', 'name uniformNumber pic stats.season.assistsTotal');


    q.exec(function (err, team) {
        //if (!team.nextmatch || moment.utc(team.nextmatch.eventdate).isBefore(moment.utc().subtract(150, 'm'))) {

        //    var leagueId = (team.competitionid.parserids[parserName] || team.league || team.leagueids[0]);
        //    var parser = require('../../offline_data/parsers/' + parserName);

        //    parser.UpdateTeamStatsFull(leagueId, team.parserids[parserName], null, function (error, response) {
        //        if (!error && response) {
        //            response.topassister = team.topassister;
        //            response.topscorer = team.topscorer;
        //            response.competitionid = team.competitionid;
        //        }
        //        cbf(cb, error, response);
        //    }, id);
        //}
        //else {
        //    team = team.toObject();
        //    if (team.topscorer) {
        //        if (!team.topscorer.stats || !team.topscorer.stats.season || !team.topscorer.stats.season.goalsTotal)
        //            delete team.topscorer;
        //    }

        //    if (team.topassister) {
        //        if (!team.topassister.stats || !team.topassister.stats.season || !team.topassister.stats.season.assistsTotal)
        //            delete team.topassister;
        //    }

            cbf(cb, err, team);
        //}
    });
};


// POST
api.addTeam = function (team, cb) {

    if (!team) {
        cb('No Team Provided. Please provide valid team data.');
    }

    team = new Team(team);

    team.save(function (err) {
        cbf(cb, err, team.toObject());
    });
};


// PUT
api.editTeam = function (id, updateData, cb) {

    return Team.findOneAndUpdate({ _id: id }, { $set: updateData }, function (err, res) {
        cbf(cb, err, res);
    });
};


// DELETE
api.deleteTeam = function (id, cb) {

    return Team.findById(id).remove().exec(function (err, team) {
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


api.deleteAllTeams = function (cb) {
    return Team.remove({}, function (err) {
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
