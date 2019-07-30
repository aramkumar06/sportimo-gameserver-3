'use strict';


var scheduler = require('node-schedule');
var needle = require("needle");
var crypto = require("crypto-js");
var async = require('async');
var _ = require('lodash');
//var mongoose = require('../config/db.js');
var mongoose = require('mongoose');
var log = require('winston');
var objectId = mongoose.Types.ObjectId;
var moment = require('moment');
//var unidecode = require('unidecode');

// Settings for the development environment
var mongoDb = mongoose.models;
//var mongoConn = mongoose.mongoose.connections[0];

//var log = new (winston.Logger)({
//    levels: {
//        prompt: 6,
//        debug: 5,
//        info: 4,
//        core: 3,
//        warn: 1,
//        error: 0
//    },
//    colors: {
//        prompt: 'grey',
//        debug: 'blue',
//        info: 'green',
//        core: 'magenta',
//        warn: 'yellow',
//        error: 'red'
//    }
//});

//log.add(winston.transports.Console, {
//    timestamp: true,
//    level: process.env.LOG_LEVEL || 'debug',
//    prettyPrint: true,
//    colorize: 'level'
//});

// languageMapping maps Sportimo langage locale to Stats.com language Ids. For a list of ISO codes, see https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
var languageMapping = {
    //"ar": "", // arabic not supported yet
    "en": "1", // english
    //"yi": "", // yiddish (hebrew) not supported yet
    "ru": "23", // russian
    "el": "12"
    // Add all required language mappings here from Stats.com
};

var statsComConfigDevelopment = {
    // if not supportedLanguages is set in the function parameter, then set it to a default value of 1 language supported: english.
    supportedLanguages: ["en"],
    urlPrefix: "https://api.statscore.com/v2/",
    //proxy: "http://u9veqtodsf26ea:pVn7EBOR9vYXqEo9zV5Nxnfh6g@eu-west-static-01.quotaguard.com:9293",
    proxy: "http://h2aj52r6m0jjce:ZycBJpE1_u2z0OfjcxbagXj96A@eu-west-static-01.quotaguard.com:9293",
    apiKey: "132",  // actually, this is the client_id
    apiSecret: "3iqAJvFlU0Y4bjB7MNkA4tu8tDMNI4QVYkh", 
    parserIdName: "Statscore"  // the name inside GameServer data parserId object, that maps to THIS parser's data ids. This is how we map stats.com objects to Sportimo gameServer objects.
};

// Settings for the production environment
var statsComConfigProduction = {
    // if not supportedLanguages is set in the function parameter, then set it to a default value of 1 language supported: english.
    supportedLanguages: ["en"], // ['en', 'ar']
    urlPrefix: "https://api.statscore.com/v2/",
    proxy: "http://h2aj52r6m0jjce:ZycBJpE1_u2z0OfjcxbagXj96A@eu-west-static-01.quotaguard.com:9293",
    apiKey: "132",  // actually, this is the client_id
    apiSecret: "3iqAJvFlU0Y4bjB7MNkA4tu8tDMNI4QVYkh", 
    parserIdName: "Statscore"  // the name inside GameServer data parserId object, that maps to THIS parser's data ids. This is how we map stats.com objects to Sportimo gameServer objects.
};

// Assign the settings for the current environment
var configuration = process.env.NODE_ENV == "production" ? statsComConfigProduction : statsComConfigDevelopment;
let authToken = null;
let authTokenExpiration = null;
const needleOptions = { timeout: 60000 };// used to be { timeout: 60000, proxy: configuration.proxy }; under the presence of http proxy

var Parser = function () {
    // Settings properties
    //Parser.name = configuration.parserIdName;

    //update configuration settings with this object settings
    if (this.interval)
        configuration.eventsInterval = this.interval;
    if (this.parsername)
        configuration.parserIdName = this.parsername;

    // Restrict to Only call this once in the lifetime of this object
    this.init = _.once(function (feedServiceContext) {
    });

};



Parser.Configuration = configuration;
Parser.Name = configuration.parserIdName;
Parser.methodSchedules = {};

// Initialize scheduled tasks on (re)start, but wait 5 secs for the mongo connection to be established first.
setTimeout(function () {
    mongoDb.gameserversettings.findOne().exec(function (error, settings) {
        if (error)
            log.error('Failed to get the game server settings during offline_data Stats parser initialization');
        else {
            if (settings) {             
                if (settings.scheduledTasks) {
                    _.forEach(settings.scheduledTasks, function (updateTeamSchedule) {
                        // if(updateTeamSchedule.competitionId != "56f4800fe4b02f2226646297") return;
                        let competitionId = updateTeamSchedule.competitionId;
                        let season = updateTeamSchedule.season;
                        let pattern = updateTeamSchedule.cronPattern;
                        let parser = updateTeamSchedule.parser;

                        if (parser === Parser.Name && !updateTeamSchedule.isDeleted) {
                            log.info('[' + Parser.Name + ']: Scheduling UpdateCompetitionStats for league %s (%s) with the pattern %s', competitionId, season, pattern);
                            Parser.methodSchedules['UpdateCompetitionStats'] = scheduler.scheduleJob(pattern, function () {
                                log.info('[' + Parser.Name + ']: Scheduled job is running for %s (%s) : %s', updateTeamSchedule.competitionId, updateTeamSchedule.season, updateTeamSchedule.cronPattern);
                                Parser.UpdateAllCompetitionStats(competitionId, season, function (error, data) {
                                    if (error)
                                        log.error(error.message);
                                });
                            });
                        }
                    });
                }
            }
        }

    });
}, 5000);


setTimeout(function () {
    setInterval(function () {
        var cutOffTime = moment.utc().subtract(3, 'hours').toDate();
        //mongoDb.scheduled_matches.find({ completed: false, guruStats: null, start: {$gte: cutOffTime} }, function(error, matches) {
        mongoDb.matches.find({ completed: false, guruStats: null, guruStatsChecked: { $ne: true } }, '_id home_team away_team competition season state time start name', function (error, matches) {
            if (error)
                return;

            async.eachSeries(matches, function (match, cb) {
                setTimeout(function () {
                    Parser.UpdateGuruStats(match, function (err) {
                        if (err) {
                            log.error('Failed saving the Guru-stats for match %s, due to: %s', match.id, err.message);
                        }

                        log.info(`Updated match ${match.name} so we don't have to test for Guru stats anymore.`);

                        cb(null);
                    });
                }, 500);
            }, function (eachSeriesError) {

            });
        });
    }, 120000);
}, 5000);

// Helper Methods


Parser.FindCompetitionSeasonByParserid = function (parserSeasonId, injectTeams, callback) {
    var findQuery = { ['parserids.' + Parser.Name]: parserSeasonId };

    var q = mongoDb.trn_competition_seasons
        .findOne(findQuery)
        .populate('competition');

    if (injectTeams)
        q.populate('teams');

    q.exec(function (error, competitionSeason) {
        if (error)
            return callback(error);

        if (!competitionSeason)
            return callback(new Error('No competition /season found in database with this parser season Id:' + parserSeasonId));

        return callback(null, competitionSeason);
    });
};

// Helper method to retrieve a team based on the parser id
Parser.FindMongoTeamId = function (competitionId, parserTeamId, fieldProjection, callback, teamId) {

    var findConditions = { competitionid: competitionId, ['parserids.' + Parser.Name]: parserTeamId };

    if (teamId)
        findConditions._id = teamId;

    var q = mongoDb.trn_teams.findOne(findConditions);

    if (fieldProjection)
        q.select(fieldProjection);

    q.exec(function (err, team) {
        if (err)
            return callback(err);

        if (!team)
            return callback(new Error('No team found in database with this parserId:' + parserTeamId));

        return callback(null, team);
    });
};

//Parser.FindMongoTeamsInCompetition = function (competitionId, callback) {
//    mongoDb.trn_teams.find({ competitionid: competitionId, ['parserids.' + Parser.Name]: { $exists: true } }, function (error, teams) {
//        if (error)
//            return callback(error);
//        callback(null, teams);
//    });
//};


// Get team stats. Always return the season stats.
Parser.UpdateTeamStatsFull = function (parserSeasonId, teamId, season, outterCallback, mongoTeamId) {

    //if (outerCallback)
    //    return outerCallback(new Error('[Statscore parser]: Method (UpdateTeamStatsFull) not implemented'));
    const now = new Date();
    let competition = null;
    let competitionSeason = null;
    let mongoTeamsLookup = null;
    const parserIdName = 'parserids.' + Parser.Name;

    async.waterfall(
        [
            function (callback) {
                return Parser.FindCompetitionSeasonByParserid(parserSeasonId, true, callback);
            },
            function (competitionRef, callback) {
                competition = competitionRef.competition;
                competitionSeason = competitionRef;
                mongoTeamsLookup = _.keyBy(_.filter(competition.teams, (i) => { return i.parserids && i.parserids[Parser.Name]; }), parserIdName);
                const team = mongoTeamsLookup[teamId];

                if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                    Authenticate((authErr, authToken) => {
                        if (authErr) {
                            log.error(authErr.stack);
                            return cbk(authErr);
                        }

                        return cbk(null, team, authToken);
                    });
                else
                    return async.setImmediate(() => { return cbk(null, team, authToken); });
            },
            // Get a list of all standing types
            (team, authToken, cbk) => {
                if (!competition.parserids || !competition.parserids[Parser.Name] || !competition.parserids[Parser.Name].seasonid)
                    return cbk(new Error(`Missing or Invalid competition ${Parser.Name} parser season id`));
                if (!team || !team.parserids || !team.parserids[Parser.Name])
                    return cbk(new Error(`Missing or Invalid team ${Parser.Name} parser id`));

                const seasonId = competitionSeason.parserids[Parser.Name];
                const parserTeamId = team.parserids[Parser.Name];

                const url = `${configuration.urlPrefix}standings?token=${authToken}&object_type=season&object_id=${seasonId}`;

                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);

                    try {
                        if (response.body.api.error)
                            return cbk(new Error(response.body.api.error.message));

                        if (
                            !response.body
                            || !response.body.api
                            || !response.body.api.data
                            || !response.body.api.data.standings_list
                            || response.body.api.data.standings_list.length == 0
                        )
                            return cbk(new Error('Not Found'));

                        const standingTypes = response.body.api.data.standings_list;
                        const leagueStandings = _.find(standingTypes, { type_id: 2 });
                        if (!leagueStandings)
                            return cbk(new Error('Not Found'));

                        // iterate over next pages
                        return cbk(null, team, authToken, leagueStandings.id);
                    }
                    catch (err) {
                        console.error(err);
                        return cbk(err);
                    }
                });
            },
            // Get the standings of teams in the league with some team stats so far for each one. 
            // Locate the teamId of interest and propagate its stats to the next waterfall step
            (team, authToken, standingsId, cbk) => {
                const url = `${configuration.urlPrefix}standings/${standingsId}?token=${authToken}`;

                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);

                    try {
                        if (response.body.api.error)
                            return cbk(new Error(response.body.api.error.message));

                        if (
                            !response.body
                            || !response.body.api
                            || !response.body.api.data
                            || !response.body.api.data.standings
                            || !response.body.api.data.standings.groups
                            || response.body.api.data.standings.groups.length == 0
                            || !response.body.api.data.standings.groups[0].participants
                            || response.body.api.data.standings.groups[0].participants.length == 0
                        )
                            return cbk(new Error('Not Found'));

                        const leagueStandings = _.flatMap(response.body.api.data.standings.groups, 'participants');
                        const teamStats = _.find(leagueStandings, { id: teamId });

                        if (!teamStats || !teamStats.columns) {
                            return cbk(new Error('Not Found'));
                        }

                        return cbk(null, team, authToken, teamStats);
                    }
                    catch (err) {
                        console.error(err);
                        return cbk(err);
                    }
                });
            },
            // Get the list of events
            (team, authToken, teamStats, cbk) => {
                const seasonId = competitionSeason.parserids[Parser.Name];
                Parser.GetTeamSeasonEvents(seasonId, teamId, (err, teamMatches) => {
                    if (err)
                        return cbk(err);

                    return cbk(null, team, authToken, teamStats, teamMatches);
                });
            },
            // Boil all info and partial stats, aggregate stats and put each piece in place inside the team object
            function (team, authToken, teamStats, teamMatches, cbk) {
                try {
                    // last 5 matches form
                    const recentFormColumn = _.find(teamStats.columns, { id: 46 });
                    if (recentFormColumn && recentFormColumn.value) {
                        team.recentform = TranslateRecentForm(recentFormColumn.value);
                    }
                    // team standing stats
                    team.standing = TranslateTeamStanding(teamStats, team);

                    teamMatches = _.orderBy(teamMatches, (match) => {
                        return moment.utc(match.start_date);
                    });
                    const lastMatch = _.findLast(teamMatches, { status_type: 'finished' });
                    let nextMatch = null;
                    if (!lastMatch)
                        team.lastmatch = null;
                    else {
                        const lastMatchIndex = _.indexOf(teamMatches, lastMatch);
                        const lastMatchHome = _.find(lastMatch.participants, { counter: 1 });
                        const lastMatchAway = _.find(lastMatch.participants, { counter: 2 });
                        const lastMatchHomeMongoTeam = mongoTeamsLookup[lastMatchHome.id];
                        const lastMatchAwayMongoTeam = mongoTeamsLookup[lastMatchAway.id];
                        const lastMatchObj = {
                            home: _.pick(lastMatchHomeMongoTeam, ['_id', 'name', 'logo']),
                            away: _.pick(lastMatchAwayMongoTeam, ['_id', 'name', 'logo']),
                            homescore: parseInt(_.find(lastMatchHome.results, { id: 2 }).value, 10),
                            awayscore: parseInt(_.find(lastMatchAway.results, { id: 2 }).value, 10),
                            eventdate: moment.utc(lastMatch.start_date).toDate()
                        };
                        team.lastmatch = lastMatchObj;

                        // next match
                        nextMatch = lastMatchIndex + 1 < teamMatches.length ? teamMatches[lastMatchIndex + 1] : null;
                    }

                    if (!nextMatch)
                        nextMatch = _.find(teamMatches, { status_type: 'scheduled' });
                    if (nextMatch && nextMatch.status_type == 'scheduled') {
                        const nextMatchHome = _.find(nextMatch.participants, { counter: 1 });
                        const nextMatchAway = _.find(nextMatch.participants, { counter: 2 });
                        const nextMatchHomeMongoTeam = mongoTeamsLookup[nextMatchHome.id];
                        const nextMatchAwayMongoTeam = mongoTeamsLookup[nextMatchAway.id];
                        const nextMatchObj = {
                            home: _.pick(nextMatchHomeMongoTeam, ['_id', 'name', 'logo']),
                            away: _.pick(nextMatchAwayMongoTeam, ['_id', 'name', 'logo']),
                            homescore: 0,
                            awayscore: 0,
                            eventdate: moment.utc(nextMatch.start_date).toDate()
                        };
                        team.nextmatch = nextMatchObj;
                    }
                    else
                        team.nextmatch = null;

                    // Fill in with stats from league matches all teams to be updated and inserted
                    team.stats = UpdateTeamStats(teamMatches, teamId);

                    team.markModified('stats');
                    team.markModified('nextmatch');
                    team.markModified('lastmatch');

                    return cbk(null, team);
                }
                catch (err) {
                    console.error(err);
                    return cbk(err);
                }
            }
            // ToDo: put another function step here, to bring team info about last and next match opponent teams
        ], (asyncErr, team) => {
            if (asyncErr) {
                log.error(asyncErr.stack);
                return outterCallback(asyncErr);
            }
            team.save(function (saveErr) {
                if (saveErr) {
                    console.log(saveErr.stack);
                    if (outterCallback && _.isFunction(outterCallback))
                        return outterCallback(saveErr);
                    else return;
                }

                if (outterCallback && _.isFunction(outterCallback))
                    return outterCallback(null, team);
            });
        });
}



// Parser methods that other modules may call:

Parser.UpdateCompetitionTeamsStats = function (competitionId, season, callback) {
    mongoDb.competitions.findById(competitionId).populate('teams').exec(function (competitionError, competition) {
        if (competitionError)
            return callback(competitionError);

        if (!competition.parserids || !competition.parserids[Parser.Name])
            return callback(new Error('No proper parserids found in selected competition with id ' + competitionId));

        async.eachSeries(competition.teams, function (team, cbk) {
            Parser.UpdateTeamStats(competition.parserids[Parser.Name], team.parserids[Parser.Name], season, function (teamError, updateOutcome) {
                if (teamError)
                    log.error(teamError.message);
                cbk(null);
            });
        }, function (seriesErr) {
            if (seriesErr)
                log.error(seriesErr.message);

            callback(null);
        });
    });
};

Parser.GetCompetitionTeamsStatsSchedule = function (competitionId, callback) {
    var schedule = Parser.methodSchedules['UpdateCompetitionStats'];
    return callback(null, schedule);
};


Parser.CreateCompetitionTeamsStatsSchedule = function (competitionId, season, schedulePattern, callback) {
    if (Parser.methodSchedules['UpdateCompetitionStats']) {
        log.info('Deleting existing UpdateCompetitionStats schedule to replace it with a new one');
        Parser.methodSchedules['UpdateCompetitionStats'].cancel();

    }

    log.info('Scheduling UpdateCompetitionStats for season %s with the pattern %s', season, schedulePattern);
    Parser.methodSchedules['UpdateCompetitionStats'] = scheduler.scheduleJob(schedulePattern, function () {
        log.info('Scheduled job is running for %s', Parser.methodSchedules['UpdateCompetitionStats']);
        Parser.UpdateCompetitionTeamsStats(competitionId, season, function (error, data) {
            if (error)
                log.error(error.message);

        });
    });

    let newSetting = {
        competitionId: competitionId,
        season: season,
        cronPattern: schedulePattern
    };

    mongoDb.trn_server_settings.findOne({}, function (findError, settings) { //{'scheduledTasks.updateTeamStats.competitionId': competitionId, 'scheduledTasks.updateTeamStats.season': season}, {$pull: {'scheduledTasks.updateTeamStats' : { 'scheduledTasks.updateTeamStats.competitionId': competitionId, 'scheduledTasks.updateTeamStats.season': season} } }, { safe: true }, function(removeError, settings) {
        if (findError)
            return callback(findError);

        if (settings && settings.scheduledTasks)
            // let instanceToBeRemoved = _.find(settings.scheduledTasks.updateTeamStats, { competitionId: competitionId, season: season });
            // if (instanceToBeRemoved)
            _.remove(settings.scheduledTasks, { competitionId: competitionId, season: season });
        if (settings)
            settings.scheduledTasks.push(newSetting);
        if (!settings) {
            settings = new mongoDb.gameserversettings({
                scheduledTasks: []
            });
            settings.scheduledTasks.push(newSetting);
        }
        settings.markModified('scheduledTasks');

        settings.save(function (saveError) {
            if (saveError)
                return callback(saveError);

            callback(null, Parser.methodSchedules['UpdateCompetitionStats']);
        });
    });
};


Parser.DeleteCompetitionTeamsStatsSchedule = function (competitionId, season, schedulePattern, callback) {
    if (Parser.methodSchedules['UpdateCompetitionStats']) {
        log.info('Deleting existing UpdateCompetitionStats schedule');
        Parser.methodSchedules['UpdateCompetitionStats'].cancel();
    }
    callback(null);
};


const TranslateRecentForm = function (formMatches) {
    const translatedForm = _.replace(formMatches, /D/g, 'T');
    const form = _.split(translatedForm, ',');
    const recentForm = _.take(form, 5);
    const reversedForm = _.reverse(recentForm);
    return reversedForm;
};

const UpdateTeamStats = function (teamMatches, teamId) {
    // stats as the aggregation of teamMatches individual team stats
    let stats = {
        Clear: 0, //team.stats && team.stats.Clear ? team.stats.Clear : 0,
        Corner: 0, //team.stats && team.stats.Corner ? team.stats.Corner : 0,
        Offside: 0, //team.stats && team.stats.Offside ? team.stats.Offside : 0,
        Red: 0, //team.stats && team.stats.Red ? team.stats.Red : 0,
        Yellow: 0, //team.stats && team.stats.Yellow ? team.stats.Yellow : 0,
        Foul: 0, //team.stats && team.stats.Foul ? team.stats.Foul : 0,
        Penalty: 0, //team.stats && team.stats.Penalty ? team.stats.Penalty : 0,
        Crosses: 0, //team.stats && team.stats.Crosses ? team.stats.Crosses : 0,
        Shot_On_Goal: 0, //team.stats && team.stats.Shot_On_Goal ? team.stats.Shot_On_Goal : 0,
        Goal: 0, //team.stats && team.stats.Goal ? team.stats.Goal : 0,
        gamesPlayed: 0, //team.stats && team.stats.gamesPlayed ? team.stats.gamesPlayed : 0
        Own_Goal: 0
    };
    const finishedMatches = _.filter(teamMatches, { status_type: 'finished' });
    _.forEach(finishedMatches, (match) => {
        const participant = _.find(match.participants, { id: teamId });
        if (participant && participant.stats) {
            const shotsOnGoal = _.find(participant.stats, { id: 20 });
            if (shotsOnGoal && shotsOnGoal.value && _.isFinite(parseInt(shotsOnGoal.value)))
                stats.Shot_On_Goal += parseInt(shotsOnGoal.value);
            const corners = _.find(participant.stats, { id: 13 });
            if (corners && corners.value && _.isFinite(parseInt(corners.value)))
                stats.Corner += parseInt(corners.value);
            const yellows = _.find(participant.stats, { id: 8 });
            if (yellows && yellows.value && _.isFinite(parseInt(yellows.value)))
                stats.Yellow += parseInt(yellows.value);
            const reds = _.find(participant.stats, { id: 9 });
            if (reds && reds.value && _.isFinite(parseInt(reds.value)))
                stats.Red += parseInt(reds.value);
            const fouls = _.find(participant.stats, { id: 22 });
            if (fouls && fouls.value && _.isFinite(parseInt(fouls.value)))
                stats.Foul += parseInt(fouls.value);
            const offsides = _.find(participant.stats, { id: 24 });
            if (offsides && offsides.value && _.isFinite(parseInt(offsides.value)))
                stats.Offside += parseInt(offsides.value);
            const penalties = _.find(participant.stats, { id: 16 });
            if (penalties && penalties.value && _.isFinite(parseInt(penalties.value)))
                stats.Penalty += parseInt(penalties.value);
            const clears = _.find(participant.stats, { id: 29 });
            if (clears && clears.value && _.isFinite(parseInt(clears.value)))
                stats.Clear += parseInt(clears.value);
            const goals = _.find(participant.stats, { id: 40 });
            if (goals && goals.value && _.isFinite(parseInt(goals.value)))
                stats.Goal += parseInt(goals.value);
            const ownGoals = _.find(participant.stats, { id: 17 });
            if (ownGoals && ownGoals.value && _.isFinite(parseInt(ownGoals.value)))
                stats.Own_Goal += parseInt(ownGoals.value);
        }
    });
    return stats;
};



Parser.UpdateTeams = function (competitionId, seasonId, callback) {

    let mongoCompetition = null;
    let mongoSeason = null;

    let mongoTeams = [];
    let mongoTeamsLookup = {};

    let mongoPlayers = [];
    let mongoPlayersLookup = {};

    let mongoTeamStats = [];
    let mongoTeamStatsLookup = [];

    let mongoPlayerStats = [];
    let mongoPlayerStatsLookup = [];

    let parserTeams = [];
    let parserPlayers = [];

    let standingTypes = [];
    let standingsLookup = {};

    let topScorers = [];
    let leagueMatches = [];

    const parserIdName = 'parserids.' + Parser.Name;

    async.waterfall([
        // Get competition [Mongo]
        (cbk) => {

            const query = { competition: competitionId };
            if (seasonId)
                query._id = seasonId;

            return mongoDb.trn_competition_seasons
                .find(query)
                .populate([{ path: 'competition' }, { path: 'teams', populate: { path: 'players' } }])
                .sort({ startDate: -1 })
                .limit(1)
                .exec(cbk);
            //return mongoDb.competitions.findById(competitionId).populate({ path: 'teams', populate: { path: 'players' } }).exec(cbk);
        },
        // Get competition teams [Mongo]
        (competitionSeasons, cbk) => {

            if (!competitionSeasons || competitionSeasons.length === 0) 
                return cbk(new Error(`Cannot proceed to update teams and players for competition ${competitionId} does not have a valid season.`));

            mongoSeason = competitionSeasons[0];
            mongoCompetition = mongoSeason.competition;
            if (!mongoCompetition.parserids || !mongoCompetition.parserids[Parser.Name]) {
                return cbk(new Error(`Cannot proceed to update teams and players for competition ${competitionId} does not have valid ${Parser.Name} parserids.`));
            }
            if (!mongoSeason.parserids || !mongoSeason.parserids[Parser.Name]) {
                return cbk(new Error(`Cannot proceed to update teams and players for season ${season.id} does not have valid ${Parser.Name} parserids.`));
            }
            if (!mongoSeason.teams)
                mongoSeason.teams = [];

            mongoTeams = mongoSeason.teams;
            mongoTeamsLookup = _.keyBy(_.filter(mongoTeams, (i) => { return i.parserids && i.parserids[Parser.Name]; }), parserIdName);
            const mongoTeamIds = _.map(mongoTeams, 'id');

            mongoPlayers = _.flatMap(mongoTeams, 'players');
            mongoPlayersLookup = _.keyBy(_.filter(mongoPlayers, (i) => { return i.parserids && i.parserids[Parser.Name]; }), parserIdName);

            const competitionParserId = mongoCompetition.parserids[Parser.Name];
            const competitionParserSeasonId = mongoSeason.parserids[Parser.Name];
            async.parallel([
                (innerCbk) => {
                    return Parser.GetStandingTypes(competitionParserId, competitionParserSeasonId, innerCbk);
                },
                (innerCbk) => {
                    return Parser.GetLeagueTeams(competitionParserSeasonId, innerCbk);
                },
                (innerCbk) => {
                    const teamObjectIds = _.map(mongoSeason.teams, '_id');
                    return mongoDb.trn_teamstats.find({
                        competition: mongoCompetition._id,
                        season: mongoSeason._id,
                        team: { $in: teamObjectIds }
                    }).populate('team').exec(innerCbk);
                },
                (innerCbk) => {
                    async.concat(mongoCompetition.teams, (team, icbk) => {
                        const playerObjectIds = _.map(team.players, '_id');
                        return mongoDb.trn_playerstats.find({
                            competition: mongoCompetition._id,
                            season: mongoSeason._id,
                            team: team._id,
                            player: { $in: playerObjectIds }
                        }).populate('player').exec(icbk);
                    }, innerCbk);
                }
            ], (err, asyncResult) => {
                if (err) {
                    return cbk(err);
                }

                standingTypes = asyncResult[0];
                parserTeams = asyncResult[1];

                mongoTeamStats = asyncResult[2];
                mongoTeamStatsLookup = _.keyBy(_.filter(mongoTeamStats, (t) => { return t.team && t.team.parserids && t.team.parserids[Parser.Name]; }), (t) => {
                    return t.team.parserids[Parser.Name]; 
                });
                mongoPlayerStats = asyncResult[3];
                mongoPlayerStatsLookup = _.keyBy(_.filter(mongoPlayerStats, (p) => { return p.player && p.player.parserids && p.player.parserids[Parser.Name]; }), (p) => {
                    return p.player.parserids[Parser.Name];
                });


                return cbk(null, standingTypes, parserTeams);
            });
        },
        // Get each team player roaster, league standings, top scorer standings, all league events so far [Statscore API]
        (standingTypes, parserTeams, cbk) => {

            const competitionParserId = mongoCompetition.parserids[Parser.Name];
            const competitionParserSeasonId = mongoSeason.parserids[Parser.Name];
            async.parallel([
                (innerCbk) => {
                    return async.eachSeries(parserTeams, (team, eachCbk) => {
                        return Parser.GetTeamPlayers(competitionParserSeasonId, team.id, languageMapping['en'], (err, teamPlayers) => {
                            if (err)
                                return eachCbk(err);
                            team.players = teamPlayers;
                            parserPlayers = _.concat(parserPlayers, teamPlayers);
                            return eachCbk(null);
                        });
                    }, innerCbk);
                },
                (innerCbk) => {
                    return Parser.GetStandingType(standingTypes, 2, false, (standingsErr, standingResults) => {
                        if (standingsErr) {
                            log.error(standingsErr.stack);
                        }

                        return innerCbk(null, standingResults);
                    });
                },
                (innerCbk) => {
                    return Parser.GetStandingType(standingTypes, 6, false, (topScorerErr, topScorerResult) => {
                        if (topScorerErr) {
                            log.error(topScorerErr.stack);
                        }

                        return innerCbk(null, topScorerResult);
                    });
                },
                (innerCbk) => {
                    return Parser.GetLeagueSeasonEvents(competitionParserSeasonId, null, innerCbk);
                }
            ], (err, asyncResult) => {
                if (err)
                    return cbk(err);

                const leagueStanding = asyncResult[1];
                if (leagueStanding) {

                    standingsLookup = _.keyBy(leagueStanding, 'id');
                }

                topScorers = asyncResult[2];
                leagueMatches = asyncResult[3];

                return cbk(null, parserTeams);
            });
        }
    ], (waterfallErr) => {
        if (waterfallErr) {
            return callback(waterfallErr);
        }

        let teamsToAdd = [];
        let teamsToUpdate = [];
        let teamsToRemove = [];
        let playersToAdd = [];
        let playersToUpdate = [];
        let playersToRemove = [];
        let teamParserIdsToAddUpdate = {};

        const competitionParserId = mongoCompetition.parserids[Parser.Name];
        const competitionParserSeasonId = mongoSeason.parserids[Parser.Name];
        const creationDate = new Date();

        // We got all required data so far, let's start finding which teams should be inserted, updated and deleted
        _.forEach(parserTeams, (team) => {
            let mongoTeam = null;

            teamParserIdsToAddUpdate[team.id] = true;
            let playerParserIdsToAddUpdate = {};

            if (mongoTeamsLookup[team.id]) {
                // Update team

                mongoTeam = mongoTeamsLookup[team.id];
                if (!mongoTeam.name) {
                    mongoTeam.name = {};
                    mongoTeam.markModified('name');
                }
                if (!mongoTeam.name.en) {
                    mongoTeam.name.en = team.name;
                    mongoTeam.markModified('name.en');
                }
                if (!mongoTeam.shortName) {
                    mongoTeam.shortName = {};
                    mongoTeam.markModified('shortName');
                }
                if (!mongoTeam.shortName.en) {
                    mongoTeam.shortName.en = team.short_name;
                    mongoTeam.markModified('shortName.en');
                }
                if (!mongoTeam.abbr)
                    mongoTeam.abbr = team.acronym;
                mongoTeam.updated = creationDate;

                teamsToUpdate.push(mongoTeam);
            }
            else {

                var newTeam = new mongoDb.trn_teams();
                //newTeam._id = new objectId();
                newTeam.name = { "en": team.name };
                newTeam.shortName = { "en": team.short_name };
                newTeam.abbr = team.acronym;
                newTeam.logo = null;
                newTeam.parserids = {};
                newTeam.parserids[Parser.Name] = team.id;
                newTeam.markModified('parserids.' + Parser.Name);
                newTeam.created = creationDate;
                newTeam.updated = creationDate;
                newTeam.players = [];

                mongoTeam = newTeam;

                mongoSeason.teams.push(newTeam);
                mongoTeamsLookup[team.id] = newTeam;
                teamsToAdd.push(newTeam);
            }

            // Check team stats and insert or update
            if (mongoTeamStatsLookup[team.id]) {
                let mongoTeamStatsInstance = mongoTeamStatsLookup[team.id];
                const teamParserId = team.id;

                // Fill in with standings all teams to be updated and inserted
                if (standingsLookup[teamParserId]) {
                    mongoTeamStatsInstance.standing = TranslateTeamStanding(standingsLookup[teamParserId], team);
                    mongoTeamStatsInstance.markModified('standing');
                }

                // Fill in with recent form data of last 5 matches
                const teamStats = standingsLookup[teamParserId];
                if (teamStats && teamStats.columns) {
                    const recentFormColumn = _.find(teamStats.columns, { id: 46 });
                    if (recentFormColumn)
                        mongoTeamStatsInstance.recentform = TranslateRecentForm(recentFormColumn.value);
                }

                // Fill in with last and next match and stats so far for each team to be either updated or inserted
                let teamMatches = _.filter(leagueMatches, (m) => {
                    return m.participants && m.participants.length == 2 && (m.participants[0].id == teamParserId || m.participants[1].id == teamParserId);
                });
                teamMatches = _.orderBy(teamMatches, (match) => {
                    return moment.utc(match.start_date);
                });
                const lastMatch = _.findLast(teamMatches, { status_type: 'finished' });
                let nextMatch = null;
                if (!lastMatch)
                    mongoTeamStatsInstance.lastmatch = null;
                else {
                    const lastMatchIndex = _.indexOf(teamMatches, lastMatch);
                    const lastMatchHome = _.find(lastMatch.participants, { counter: 1 });
                    const lastMatchAway = _.find(lastMatch.participants, { counter: 2 });
                    const lastMatchHomeMongoTeam = mongoTeamsLookup[lastMatchHome.id];
                    const lastMatchAwayMongoTeam = mongoTeamsLookup[lastMatchAway.id];
                    const lastMatchObj = {
                        home: _.pick(lastMatchHomeMongoTeam, ['_id', 'name', 'logo']),
                        away: _.pick(lastMatchAwayMongoTeam, ['_id', 'name', 'logo']),
                        homescore: parseInt(_.find(lastMatchHome.results, { id: 2 }).value, 10),
                        awayscore: parseInt(_.find(lastMatchAway.results, { id: 2 }).value, 10),
                        eventdate: moment.utc(lastMatch.start_date).toDate()
                    };
                    mongoTeamStatsInstance.lastmatch = lastMatchObj;

                    // next match
                    nextMatch = lastMatchIndex + 1 < teamMatches.length ? teamMatches[lastMatchIndex + 1] : null;
                }
                mongoTeamStatsInstance.markModified('lastmatch');

                if (!nextMatch)
                    nextMatch = _.find(teamMatches, { status_type: 'scheduled' });
                if (nextMatch && nextMatch.status_type == 'scheduled') {
                    const nextMatchHome = _.find(nextMatch.participants, { counter: 1 });
                    const nextMatchAway = _.find(nextMatch.participants, { counter: 2 });
                    const nextMatchHomeMongoTeam = mongoTeamsLookup[nextMatchHome.id];
                    const nextMatchAwayMongoTeam = mongoTeamsLookup[nextMatchAway.id];
                    const nextMatchObj = {
                        home: _.pick(nextMatchHomeMongoTeam, ['_id', 'name', 'logo']),
                        away: _.pick(nextMatchAwayMongoTeam, ['_id', 'name', 'logo']),
                        homescore: 0,
                        awayscore: 0,
                        eventdate: moment.utc(nextMatch.start_date).toDate()
                    };
                    mongoTeamStatsInstance.nextmatch = nextMatchObj;
                }
                else
                    mongoTeamStatsInstance.nextmatch = null;
                mongoTeamStatsInstance.markModified('nextmatch');


                // Fill in with top scorers
                const topTeamScorer = _.find(topScorers, { subparticipant_id: teamParserId });
                if (topTeamScorer && mongoPlayersLookup[topTeamScorer.id])
                    mongoTeamStatsInstance.topscorer = mongoPlayersLookup[topTeamScorer.id]._id;

                // Fill in with stats from league matches all teams to be updated and inserted
                mongoTeamStatsInstance.stats = UpdateTeamStats(teamMatches, teamParserId);
                mongoTeamStatsInstance.markModified('stats');
            }
            else {
                let mongoTeamStatsInstance = new mongoDb.trn_teamstats();
                mongoTeamStatsInstance.competition = mongoCompetition;
                mongoTeamStatsInstance.season = mongoSeason;
                mongoTeamStatsInstance.team = mongoTeamsLookup[team.id];
                const teamParserId = team.id;

                // Fill in with standings all teams to be updated and inserted
                if (standingsLookup[teamParserId])
                    mongoTeamStatsInstance.standing = TranslateTeamStanding(standingsLookup[teamParserId], team);

                // Fill in with recent form data of last 5 matches
                const teamStats = standingsLookup[teamParserId];
                if (teamStats && teamStats.columns) {
                    const recentFormColumn = _.find(teamStats.columns, { id: 46 });
                    if (recentFormColumn)
                        mongoTeamStatsInstance.recentform = TranslateRecentForm(recentFormColumn.value);
                }

                // Fill in with last and next match and stats so far for each team to be either updated or inserted
                let teamMatches = _.filter(leagueMatches, (m) => {
                    return m.participants && m.participants.length === 2 && (m.participants[0].id === teamParserId || m.participants[1].id === teamParserId);
                });
                teamMatches = _.orderBy(teamMatches, (match) => {
                    return moment.utc(match.start_date);
                });
                const lastMatch = _.findLast(teamMatches, { status_type: 'finished' });
                let nextMatch = null;
                if (!lastMatch)
                    mongoTeamStatsInstance.lastmatch = null;
                else {
                    const lastMatchIndex = _.indexOf(teamMatches, lastMatch);
                    const lastMatchHome = _.find(lastMatch.participants, { counter: 1 });
                    const lastMatchAway = _.find(lastMatch.participants, { counter: 2 });
                    const lastMatchHomeMongoTeam = mongoTeamsLookup[lastMatchHome.id];
                    const lastMatchAwayMongoTeam = mongoTeamsLookup[lastMatchAway.id];
                    const lastMatchObj = {
                        home: _.pick(lastMatchHomeMongoTeam, ['_id', 'name', 'logo']),
                        away: _.pick(lastMatchAwayMongoTeam, ['_id', 'name', 'logo']),
                        homescore: parseInt(_.find(lastMatchHome.results, { id: 2 }).value, 10),
                        awayscore: parseInt(_.find(lastMatchAway.results, { id: 2 }).value, 10),
                        eventdate: moment.utc(lastMatch.start_date).toDate()
                    };
                    mongoTeamStatsInstance.lastmatch = lastMatchObj;

                    // next match
                    nextMatch = lastMatchIndex + 1 < teamMatches.length ? teamMatches[lastMatchIndex + 1] : null;
                }

                if (!nextMatch)
                    nextMatch = _.find(teamMatches, { status_type: 'scheduled' });
                if (nextMatch && nextMatch.status_type === 'scheduled') {
                    const nextMatchHome = _.find(nextMatch.participants, { counter: 1 });
                    const nextMatchAway = _.find(nextMatch.participants, { counter: 2 });
                    const nextMatchHomeMongoTeam = mongoTeamsLookup[nextMatchHome.id];
                    const nextMatchAwayMongoTeam = mongoTeamsLookup[nextMatchAway.id];
                    const nextMatchObj = {
                        home: _.pick(nextMatchHomeMongoTeam, ['_id', 'name', 'logo']),
                        away: _.pick(nextMatchAwayMongoTeam, ['_id', 'name', 'logo']),
                        homescore: 0,
                        awayscore: 0,
                        eventdate: moment.utc(nextMatch.start_date).toDate()
                    };
                    mongoTeamStatsInstance.nextmatch = nextMatchObj;
                }
                else
                    mongoTeamStatsInstance.nextmatch = null;

                // Fill in with top scorers
                const topTeamScorer = _.find(topScorers, { subparticipant_id: teamParserId });
                if (topTeamScorer && mongoPlayersLookup[topTeamScorer.id])
                    mongoTeamStatsInstance.topscorer = mongoPlayersLookup[topTeamScorer.id]._id;


                // Fill in with stats from league matches all teams to be updated and inserted
                mongoTeamStatsInstance.stats = UpdateTeamStats(teamMatches, teamParserId);
                mongoTeamStats.push(mongoTeamStatsInstance);
            }



            let teamPlayerLookup = _.keyBy(mongoTeam.players, (p) => {
                if (!p || !p.parserids || !p.parserids[Parser.Name])
                    return;

                return p.parserids[Parser.Name];
            });

            // Find which players should be inserted, updated, and deleted
            if (team.players)
                team.players.forEach((player) => {

                    playerParserIdsToAddUpdate[player.id] = true;

                    if (teamPlayerLookup[player.id]) {
                        let mongoPlayer = teamPlayerLookup[player.id];

                        // Update player
                        if (!mongoPlayer.name) {
                            mongoPlayer.name = {};
                            mongoPlayer.markModified('name');
                        }
                        if (!mongoPlayer.shortName) {
                            mongoPlayer.shortName = {};
                            mongoPlayer.markModified('shortName');
                        }
                        if (!mongoPlayer.name.en) {
                            mongoPlayer.name.en = player.name;
                            mongoPlayer.markModified('name.en');
                        }

                        if (!mongoPlayer.personalData)
                            mongoPlayer.personalData = {};
                        const shortNameParts = _.split(player.short_name, ' ');
                        const inverseNameParts = _.concat(_.takeRight(shortNameParts, shortNameParts.length - 1), _.head(shortNameParts));
                        const nameEn = _.join(inverseNameParts, ' ');
                        if (!mongoPlayer.shortName.en) {
                            mongoPlayer.shortName.en = nameEn; //player.name;
                            mongoPlayer.markModified('shortName.en');
                        }

                        if (!mongoPlayer.position)
                            mongoPlayer.position = player.details.position_name === 'Attacker' ? 'Forward' : player.details.position_name;
                        if (!mongoPlayer.personalData.height && player.details.height && player.details.height !== '')
                            mongoPlayer.personalData.height = {
                                centimeters: parseInt(player.details.height, 10)
                            };
                        if (!mongoPlayer.personalData.weight && player.details.weight && player.details.weight !== '')
                            mongoPlayer.personalData.weight = {
                                kilograms: parseInt(player.details.weight, 10)
                            };
                        const birthdateParts = player.details.birthdate ? _.split(player.details.birthdate, '-') : null;
                        if (!mongoPlayer.personalData.birth)
                            mongoPlayer.personalData.birth = {
                                city: player.details.born_place,
                                country: {
                                    name: player.area_name,
                                    abbreviation: player.area_code
                                },
                                birthDate: {
                                    full: player.details.birthdate,
                                    year: birthdateParts && birthdateParts.length === 3 ? parseInt(birthdateParts[0], 10) : null,
                                    month: birthdateParts && birthdateParts.length === 3 ? parseInt(birthdateParts[1], 10) : null,
                                    day: birthdateParts && birthdateParts.length === 3 ? parseInt(birthdateParts[2], 10) : null
                                }
                            };
                        if (!mongoPlayer.personalData.nationality)
                            mongoPlayer.nationality = {
                                name: player.area_name,
                                abbreviation: player.area_code
                            };
                        mongoPlayer.markModified('personalData');
                        mongoPlayer.updated = creationDate;

                        playersToUpdate.push(mongoPlayer);
                    }
                    else {

                        var newPlayer = new mongoDb.trn_players();
                        //newPlayer._id = new objectId();
                        const shortNameParts = _.split(player.short_name, ' ');
                        const inverseNameParts = _.concat(_.takeRight(shortNameParts, shortNameParts.length - 1), _.head(shortNameParts));
                        const nameEn = _.join(inverseNameParts, ' ');

                        newPlayer.shortName = { 'en': nameEn };
                        newPlayer.name = { en: player.name };
                        //newPlayer.uniformNumber = player.uniform;
                        newPlayer.position = player.details.position_name == 'Attacker' ? 'Forward' : player.details.position_name;
                        const birthdateParts = player.details.birthdate ? _.split(player.details.birthdate, '-') : null;
                        newPlayer.personalData = {
                            height: {
                                centimeters: player.details.height && player.details.height != '' ? parseInt(player.details.height, 10) : 0
                            },
                            weight: {
                                kilograms: player.details.weight && player.details.weight != '' ? parseInt(player.details.weight, 10) : 0
                            },
                            birth: {
                                city: player.details.born_place,
                                country: {
                                    name: player.area_name,
                                    abbreviation: player.area_code
                                },
                                birthDate: {
                                    full: player.details.birthdate,
                                    year: birthdateParts && birthdateParts.length == 3 ? parseInt(birthdateParts[0], 10) : null,
                                    month: birthdateParts && birthdateParts.length == 3 ? parseInt(birthdateParts[1], 10) : null,
                                    day: birthdateParts && birthdateParts.length == 3 ? parseInt(birthdateParts[2], 10) : null
                                }
                            },
                            nationality: {
                                name: player.area_name,
                                abbreviation: player.area_code
                            }
                        };
                        newPlayer.parserids = {};
                        newPlayer.parserids[Parser.Name] = player.id;
                        newPlayer.created = creationDate;
                        newPlayer.updated = creationDate;

                        mongoTeam.players.push(newPlayer);
                        playersToAdd.push(newPlayer);
                    }

                    // Compute player stats and accordingly insert or update trn_playerstats
                    //mongoPlayerStatsLookup 

                });

            // Detect and remove players that do not belong to the team anymore
            playersToRemove = _.concat(playersToRemove, _.remove(mongoTeam.players, (p) => {
                if (!p.parserids || !p.parserids[Parser.Name])
                    return true;

                if (!playerParserIdsToAddUpdate[p.parserids[Parser.Name]]) {
                    playersToRemove.push(p);
                    return true;
                }
                else
                    return false;
            }));
        });

        const parserTeamLookup = _.keyBy(parserTeams, 'id');
        //teamsToRemove = _.filter(mongoTeams, (team) => { return !parserTeamLookup[team.parserids[Parser.Name]]; });
        teamsToRemove = _.remove(mongoSeason.teams, (t) => {
            if (!t.parserids || !t.parserids[Parser.Name])
                return true;

            if (!parserTeamLookup[t.parserids[Parser.Name]]) {
                teamsToRemove.push(t);
                return true;
            }
            else
                return false;
        });


        // Now that we have all teams and players to be added or updated, do the appropriate MongoDB transactions and persist the documents
        async.parallel([
            (innerCallback) => mongoSeason.save(innerCallback),
            (innerCallback) => {
                async.each(mongoSeason.teams, (team, cbk) => {
                    async.waterfall([
                        (wcbk) => {
                            async.each(team.players, (p, innCbk) => {
                                p.save(innCbk);
                            }, wcbk);
                        },
                        (wcbk) => {
                            team.save(wcbk);
                        }
                    ], cbk);
                }, innerCallback);
            },
            (innerCallback) => {
                async.eachLimit(mongoTeamStats, 100, (stat, cbk) => {
                    stat.save(cbk);
                }, innerCallback);
            }
        ], function (parallelError, parallelResults) {
            if (parallelError)
                return callback(parallelError);


            log.info(`\nTeams: Added [${teamsToAdd.length}], Removed [${teamsToRemove.length}] Updated [${teamsToUpdate.length}]\nPlayers: Added [${playersToAdd.length}], Removed [${playersToRemove.length}], Updated [${playersToUpdate.length}]`);
            callback(null, teamsToAdd.length, teamsToUpdate.length, teamsToRemove.length, playersToAdd.length, playersToUpdate.length, playersToRemove.length);
        });

    });
};



Parser.UpdateTeamAndPlayerMappings = function (competitionId, callback) {
    const StatsName = 'Stats';

    // Start by fetching the specified sportimo competition by id
    mongoDb.competitions.findById(competitionId, function (err, competition) {
        if (err)
            return callback(err);

        const competitionStatscoreId = competition.parserids[Parser.Name];
        const competitionId = competition.id;

        if (!competitionStatscoreId || !competitionId)
            return callback(new Error('No league name or league Id is defined in call'));

        if (!Parser.Configuration.supportedLanguages)
            return callback(new Error('No supported languages are defined in parser&apos;s configuration'));

        if (_.indexOf(Parser.Configuration.supportedLanguages, "en") < 0)
            return callback(new Error('The default english language ("en") is NOT set amongst the supported languages in parser&apos;s configuration.'));


        // Get all teams, and then collect all teamIds and query for the related players
        mongoDb.trn_teams.find({ competitionid: competitionId }, function (teamError, existingTeams) {
            if (teamError)
                return callback(teamError);

            let existingTeamIds = _.map(existingTeams, function (team) { return team.id; });

            let existingTeamsLookup = {};
            let existingTeamNameLookup = {};
            let existingPlayerLookup = {};
            let existingPlayerNameLookup = {};
            let languageData = {};

            _.forEach(existingTeams, function (team) {
                if (team.parserids && team.parserids[Parser.Name] && !existingTeamsLookup[team.parserids[Parser.Name]])
                    existingTeamsLookup[team.parserids[Parser.Name]] = team;
                if (team.name && team.name['en'] && !existingTeamNameLookup[team.name && team.name['en']])
                    existingTeamNameLookup[team.name && team.name['en']] = team;
            });

            mongoDb.trn_players.find({ teamId: { '$in': existingTeamIds } }, function (playerError, existingPlayers) {
                if (playerError)
                    return callback(playerError);


                _.forEach(existingPlayers, function (player) {
                    if (player.parserids[Parser.Name] && !existingPlayerLookup[player.parserids[Parser.Name]])
                        existingPlayerLookup[player.parserids[Parser.Name]] = player;
                    if (player.name && player.name['en'] && !existingPlayerNameLookup[player.name && player.name['en']])
                        existingPlayerNameLookup[player.name && player.name['en']] = player;
                });


                const language = "en";

                //                async.eachSeries(Parser.Configuration.supportedLanguages, function (language, cbk) {
                if (languageMapping[language]) {
                    languageData[language] = {};

                    // Get statscore teams
                    Parser.GetLeagueTeams(competitionStatscoreId, function (teamsErr, teams) {
                        if (teamsErr)
                            return callback(teamsErr);

                        languageData[language].teams = {};
                        _.forEach(teams, function (team) {
                            if (!languageData[language].teams[team.id])
                                languageData[language].teams[team.id] = team;
                        });

                        async.eachLimit(teams, 1, function (team, teamCbk) {
                            Parser.GetTeamPlayers(competitionStatscoreId, team.id, languageMapping[language], function (error, players) {
                                if (error)
                                    return teamCbk(error);
                                if (!languageData[language].teams[team.id].players)
                                    languageData[language].teams[team.id].players = {};
                                _.forEach(players, function (player) {
                                    if (!languageData[language].teams[team.id].players[player.id])
                                        languageData[language].teams[team.id].players[player.id] = player;
                                });

                                teamCbk(null);
                            });
                        }, function (teamErr) {
                            if (teamErr)
                                return callback(teamErr);


                            let parsedTeams = {};
                            let parsedPlayers = {};
                            let teamsToAdd = [];
                            let teamsToUpdate = [];
                            let playersToAdd = [];
                            let playersToUpdate = [];
                            //let playersToRemove = [];

                            let creationDate = new Date();

                            // Find mappings



                            // Find the players that exist in existingPlayersLookup but not in languageData["en"].players and add them to playersToUpdate after unlinking them from their team
                            // Similarly find the teams that exist in existingTeamsLookup but not in languageData["en"].players and add them to teamsToUpdate after unlinking them from their competition
                            let teamsMissedFromMapping = [];
                            let playersMissedFromMapping = [];
                            _.forEach(_.keys(languageData["en"].teams), function (teamKey) {
                                const teamId = languageData["en"].teams[teamKey].id;

                                const keyExists = existingTeamsLookup[teamKey];
                                const nameExists = existingTeamNameLookup[_.deburr(languageData["en"].teams[teamKey].name)];
                                let shortNameExists = existingTeamNameLookup[_.deburr(languageData["en"].teams[teamKey].short_name)];

                                let existingTeamFound = keyExists || nameExists || shortNameExists;

                                // This tries to capture differences like 'Everton' and 'Everton F.C.'
                                if (!existingTeamFound) {
                                    shortNameExists = existingTeamNameLookup[_.deburr(_.split(languageData["en"].teams[teamKey].short_name, ' ')[0])];
                                    existingTeamFound = shortNameExists;

                                    if (!existingTeamFound) {
                                        const shortNameWithoutParenthesis = _.trim(languageData["en"].teams[teamKey].short_name.replace(/\([^()]*\)/g, ''));
                                        shortNameExists = existingTeamNameLookup[_.deburr(shortNameWithoutParenthesis)];
                                        existingTeamFound = shortNameExists;

                                        if (!existingTeamFound) {
                                            shortNameExists = existingTeamNameLookup[_.deburr(_.replace(shortNameWithoutParenthesis, ' ', '-'))];
                                            existingTeamFound = shortNameExists;
                                        }
                                    }
                                }

                                if (existingTeamFound) {
                                    existingTeamFound.parserids[Parser.Name] = teamId;
                                    teamsToUpdate.push(existingTeamFound);
                                }
                                else
                                    teamsMissedFromMapping.push(languageData["en"].teams[teamKey]);


                                _.forEach(_.keys(languageData["en"].teams[teamKey].players), function (playerKey) {
                                    const playerId = languageData["en"].teams[teamKey].players[playerKey].id;
                                    const player = languageData["en"].teams[teamKey].players[playerKey];

                                    if (!(player.details && player.details.subtype && player.details.subtype != 'athlete')) {
                                        const keyExists = existingPlayerLookup[playerKey];
                                        const nameExists = existingPlayerNameLookup[languageData["en"].teams[teamKey].players[playerKey].name];

                                        // Statscore short name is last name first, first name latter. We need to inverse this order before lookup
                                        const nameParts = _.split(languageData["en"].teams[teamKey].players[playerKey].short_name, ' ');
                                        let invertedName = nameParts[nameParts.length > 1 ? 1 : 0];
                                        if (nameParts.length > 1)
                                            invertedName += ' ' + nameParts[0]; // add last name, ignore middle names

                                        // Convert inverted name to ascii equivalent with Unidecode package
                                        // alternatively: invertedName = unidecode(invertedName);
                                        invertedName = _.deburr(invertedName);
                                        let shortNameExists = existingPlayerNameLookup[invertedName];

                                        let existingPlayerFound = keyExists || nameExists || shortNameExists;

                                        if (!existingPlayerFound && nameParts.length > 2) {
                                            invertedName = '';
                                            for (let i = 0; i < nameParts.length - 1; i++)
                                                invertedName += ' ' + _.capitalize(nameParts[i + 1]);
                                            invertedName += ' ' + _.capitalize(nameParts[0]);

                                            invertedName = _.trimStart(_.deburr(invertedName));
                                            shortNameExists = existingPlayerNameLookup[invertedName];
                                            existingPlayerFound = shortNameExists;

                                            if (!existingPlayerFound) {
                                                invertedName = _.capitalize(nameParts[2]) + ' ' + _.capitalize(nameParts[0]);
                                                shortNameExists = existingPlayerNameLookup[invertedName];
                                                existingPlayerFound = shortNameExists;
                                            }
                                        }

                                        if (existingPlayerFound) {
                                            existingPlayerFound.parserids[Parser.Name] = playerId;
                                            playersToUpdate.push(existingPlayerFound);
                                        }
                                        else
                                            playersMissedFromMapping.push(languageData["en"].teams[teamKey].players[playerKey]);
                                    }
                                });
                            });

                            // Gathering updating Stats
                            console.log(`${teamsToUpdate.length} teams mapped, ${teamsMissedFromMapping.length} teams missed mapping:`);
                            _.forEach(teamsMissedFromMapping, (team) => { console.log(`id: ${team.id}, name: ${team.name}`); });
                            console.log(`${playersToUpdate.length} players mapped, ${playersMissedFromMapping.length} players missed mapping:`);
                            _.forEach(playersMissedFromMapping, (player) => { console.log(`id: ${player.id}, name: ${player.name}`); });

                            // Update instances parserids for teams
                            if (teamsToUpdate && teamsToUpdate.length > 0) {
                                async.parallel([
                                    (cbk3) => {
                                        async.each(teamsToUpdate, function (teamToUpdate, cbk2) {
                                            return mongoDb.trn_teams.findOneAndUpdate({ _id: new objectId(teamToUpdate.id) }, { $set: { parserids: teamToUpdate.parserids } }, cbk2);
                                        }, cbk3);
                                    },
                                    (cbk3) => {
                                        async.each(playersToUpdate, function (playerToUpdate, cbk2) {
                                            return mongoDb.trn_players.findOneAndUpdate({ _id: new objectId(playerToUpdate.id) }, { $set: { parserids: playerToUpdate.parserids } }, cbk2);
                                        }, cbk3);
                                    }], (parallelErr, parallelResults) => {
                                        if (parallelErr)
                                            return callback(parallelErr);
                                        return callback(null, parallelResults);
                                    });
                            }
                            else
                                callback(null);
                        });
                    });
                }
                //else {
                //    async.setImmediate(function () {
                //        cbk(new Error('language ' + language + ' is not found amongst languageMapping dictionary.'));
                //    });
                //}
                //}, function (error) {
                //if (error && !languageData["en"])
                //    return callback(error);

            });
        });
    });
};


const GetLeagueFromMongo = function (competitionId, seasonId, populateTeams, callback) {

    let q = null;

    if (seasonId)
        q = mongoDb.trn_competition_seasons.findById(seasonId);
    else
        if (competitionId)
            q = mongoDb.trn_competition_seasons.findOne({ competition: competitionId, status: 'Active' });
        else
            return callback(new Error('No competition/ season ids are declared. Aborting.'));

    q.populate('competition');

    if (populateTeams)
        q.populate('teams');

    q.exec(function (error, competitionSeason) {
        if (error)
            return callback(error);

        if (!competitionSeason)
            return callback(new Error('The competition/ season (id:' + seasonId ? seasonId : competitionId + ') is Not Found.'));
        if (!competitionSeason.parserids || !competitionSeason.parserids[Parser.Name])
            return callback(new Error('The selected competition/ season (id:' + competitionSeason.id + ') does not have a valid ' + Parser.Name + ' parser id.'));

        callback(null, competitionSeason);
    });
};


const GetTeamStatsFromMongo = function (competitionId, seasonId, teamIds, callback) {
    return mongoDb.trn_teamstats.find({ team: { $in: teamIds }, competition: competitionId, season: seasonId }, callback);
};

const GetPlayerStatsFromMongo = function (competitionId, seasonId, playerIds, callback) {
    return mongoDb.trn_teamstats.find({ player: { $in: playerIds }, competition: competitionId, season: seasonId }, callback);
};


Parser.UpdateLeagueStandings = function (competitionDocument, leagueId, seasonId, outerCallback) {

    let hasGroups = false;
    let competitionParserId = null;
    let seasonParserId = null;

    async.waterfall([
        function (cbk) {
            console.log("Starting standings waterfall");

            const emptyOrInvalidCompetitionDocument = !competitionDocument || !competitionDocument.competition || !competitionDocument.parserids || !competitionDocument.parserids[Parser.Name] || !competitionDocument.teams || competitionDocument.teams.length === 0 || !competitionDocument.teams[0].parserids || !competitionDocument.teams[0].parserids[Parser.Name];
            if (!emptyOrInvalidCompetitionDocument)
                return async.setImmediate(() => { return cbk(null, competitionDocument); });

            return GetLeagueFromMongo( leagueId, seasonId, true, cbk);
        },
        function (competitionSeason, cbk) {

            if (competitionSeason.teams && competitionSeason.teams.count > 0 && competitionSeason.teams[0].parserids && competitionSeason.teams[0].parserids[Parser.Name]) {
                return async.setImmediate(() => {
                    const existingTeamIds = _.keyBy(competitionSeason.teams, 'parserids.' + Parser.Name);
                    cbk(null, competitionSeason, existingTeamIds);
                });
            }

            const existingTeamIds = _.keyBy(competitionSeason.teams, 'parserids.' + Parser.Name);
            //var existingTeamIds = {};
            //_.forEach(teams, function (team) {
            //    if (team.parserids[Parser.Name] && !existingTeamIds[team.parserids[Parser.Name]])
            //        existingTeamIds[team.parserids[Parser.Name]] = team;
            //});

            seasonParserId = competitionSeason.parserids[Parser.Name];

            Parser.GetStandingTypes(competitionSeason.id, seasonParserId, (err, standingTypes) => {
                if (err)
                    return cbk(err);

                // iterate over next pages
                return cbk(null, competitionSeason, existingTeamIds, standingTypes);
            });
        },
        (competitionSeason, existingTeamIds, standings, cbk) => {
            if (!standings)
                return cbk(new Error(`No standing types are found for competition season ${competitionSeason.id}`));

            const leagueStandings = _.find(standings, { type_id: 2 });
            if (leagueStandings && leagueStandings.object_type === 'stage' && leagueStandings.object_name === 'Group Stage')
                hasGroups = true;

            Parser.GetStandingType(standings, 2, hasGroups, (error, leagueStandings) => {
                if (error)
                    return cbk(error);

                return cbk(null, competitionSeason, existingTeamIds, leagueStandings);
            });
        },
        function (competitionSeason, existingTeamIds, standings, cbk) {

            if (!standings || standings.length === 0)
                return cbk(new Error(`No team standings are found for competition season ${competitionSeason.id}`));

            if (hasGroups) {
                mongoDb.trn_team_standings
                    .where('season', competitionSeason.id)
                    .where('competition', competitionSeason.competition.id)
                    .exec(function (error, standing) {
                    if (error)
                        return cbk(error);

                    return cbk(null, competitionSeason, existingTeamIds, standings, standing ? standing[0] : null);
                });
            } else {
                // Delete old document
                mongoDb.trn_team_standings
                    .where('season', competitionSeason.id)
                    .where('competition', competitionSeason.competition.id)
                    .remove()
                    .exec(function (error, removeResult) {
                    if (error)
                        return cbk(error);

                    return cbk(null, competitionSeason, existingTeamIds, standings, null);
                });
            }
        }
    ], (asyncErr, competitionSeason, existingTeamIds, standings, standing) => {
        if (asyncErr) {
            log.error(asyncErr.stack);
            if (outerCallback)
                return outerCallback(asyncErr);
            else
                return;
        }

        // Translate the global properties and then iterate over the team properties inside the teams array.
        var newStandings = null;
        if (standing)
            newStandings = standing;
        else
            newStandings = new mongoDb.trn_team_standings();

        newStandings.competition = competitionSeason.competition.id;
        newStandings.season = competitionSeason.id;
        newStandings.parser = Parser.Name;
        newStandings.lastupdate = new Date();

        newStandings.name = competitionSeason.competition.name;
        newStandings.markModified('name');

        newStandings.teams = [];
        standings.forEach(function (teamStanding) {
            if (existingTeamIds[teamStanding.id]) {
                let team = TranslateTeamStanding(teamStanding, existingTeamIds[teamStanding.id]);
                newStandings.teams.push(team);
            }
        });
        newStandings.markModified('teams');

        newStandings.groups = [];
        if (hasGroups) {
            if (!newStandings.groups)
                newStandings.groups = [];

            standings.forEach(function (groupStanding) {
                if (groupStanding.id && groupStanding.name && groupStanding.participants) {
                    let group = null;

                    if (standing && standing.groups)
                        group = _.find(standing.groups, (g) => { return g.parserids && g.parserids[Parser.Name] && g.parserids[Parser.Name] == groupStanding.id; });

                    let isNew = false;
                    if (!group) {
                        group = {
                            parserids: {},
                            name: {}
                        };
                        group.parserids[Parser.Name] = groupStanding.id;
                        group.name.en = groupStanding.name;
                        isNew = true;
                    }

                    group.teams = [];
                    groupStanding.participants.forEach(function (teamStanding) {
                        if (existingTeamIds[teamStanding.id]) {
                            let team = TranslateTeamStanding(teamStanding, existingTeamIds[teamStanding.id]);
                            group.teams.push(team);
                        }
                    });

                    if (isNew)
                        newStandings.groups.push(group);
                }
            });

        }
        newStandings.markModified('groups');

        //if (hasGroups) {
        //    return mongoDb.standings.findOneAndUpdate({ _id: new objectId(newStandings.id) }, {
        //        $set: {
        //            name: newStandings.name,
        //            competition: newStandings.competition,
        //            season: newStandings.season,
        //            parser: newStandings.parser,
        //            lastupdate: newStandings.lastupdate,
        //            teams: newStandings.teams,
        //            groups: newStandings.groups
        //        }
        //    }, outerCallback);
        //}
        //else {
        newStandings.save(function (err, data) {
            if (err)
                return outerCallback(err);

            if (outerCallback)
                outerCallback(null, leagueId);
        });
        //}
    });
}


// Update standings for all competitions
Parser.UpdateStandings = function (season, callback) {

    let leagueStandingsUpdated = [];

    // Get all competitions from Mongo
    mongoDb.trn_competition_seasons
        .find({ status: 'Active', ['parserids.' + Parser.Name]: { $exists: true } })
        .populate('competition')
        .exec( function (competitionError, competitionSeasons) {
        if (competitionError)
            return callback(competitionError, leagueStandingsUpdated);

        async.eachLimit(competitionSeasons, 1, function (season, cbk) {
            // Get all teams foreach competition
            Throttle(1000, function () {
                console.log("Requesting UpdateLeagueStandings for " + season.id);
                Parser.UpdateLeagueStandings(season, season.competition.id, season.id, function (error, leagueid) {
                    if (error)
                        return cbk(error);
                    if (leagueid)
                        leagueStandingsUpdated.push(leagueid);
                    cbk();
                });
            });
        }, function (asyncError) {
            if (asyncError)
                return callback(asyncError, leagueStandingsUpdated);

            callback(null, leagueStandingsUpdated);
        });
    });
};



const TranslateTeamStanding = function (teamStanding, existingTeam) {
    if (!existingTeam || !teamStanding)
        return null;

    const points = teamStanding.columns && _.find(teamStanding.columns, { id: 8 });
    const matches = teamStanding.columns && _.find(teamStanding.columns, { id: 1 });
    const wins = teamStanding.columns && _.find(teamStanding.columns, { id: 2 });
    const losses = teamStanding.columns && _.find(teamStanding.columns, { id: 4 });
    const ties = teamStanding.columns && _.find(teamStanding.columns, { id: 3 });
    const goalsFor = teamStanding.columns && _.find(teamStanding.columns, { id: 6 });
    const goalsAgainst = teamStanding.columns && _.find(teamStanding.columns, { id: 7 });

    let team = {
        rank: teamStanding.rank,
        teamName: existingTeam.name,
        teamId: existingTeam.id,
        points: points ? points.value : 0,
        pointsPerGame: points && matches && points.value && matches.value ? (points.value / matches.value).toFixed(2).toString() : "0",
        penaltyPoints: 0,
        wins: wins ? wins.value : 0,
        losses: losses ? losses.value : 0,
        ties: ties ? ties.value : 0,
        gamesPlayed: matches ? matches.value : 0,
        goalsFor: goalsFor ? goalsFor.value : 0,
        goalsAgainst: goalsAgainst ? goalsAgainst.value : 0
    };

    return team;
}

Parser.GetCompetitionFixtures = function (competitionId, seasonId, outerCallback) {
    if (!competitionId)
        return outerCallback(new Error('No competition id parameter is included in the request.'));

    // Get competition from Mongo
    // Get teams from Mongo and build the team lookup dictionary
    // Get the fixtures
    // Filter the fixtures for the ones scheduled in the future, and return the results
    async.waterfall([
        function (callback) {
            return GetLeagueFromMongo(competitionId, seasonId, true, callback);
        },
        function (competitionSeason, callback) {

            const existingTeamIds = _.keyBy(competitionSeason.teams, 'parserids.' + Parser.Name);

            const competitionParserId = competitionSeason.competition.parserids[Parser.Name];
            const seasonParserId = competitionSeason.parserids[Parser.Name];

            if (!competitionParserId)
                return callback(new Error(`Missing competition id from competition\'s Statscore parserids`));
            if (!seasonParserId)
                return callback(new Error(`Missing seasonid from competition\'s Statscore parserids`));

            Parser.GetLeagueSeasonFixtures(competitionParserId, seasonParserId, function (error, fixtures) {
                if (error)
                    return callback(error);

                callback(null, competitionSeason, existingTeamIds, fixtures);
            });
        }
    ], function (asyncError, competition, existingTeamIds, fixtures) {
        if (asyncError)
            return outerCallback(asyncError);

        //const now = new Date();
        //let futureFixtures = _.filter(fixtures, function (fixture) {
        //    if (!fixture.startDate || fixture.startDate.length < 2)
        //        return false;
        //    if (fixture.eventStatus.isActive)
        //        return false;

        //    const startDateString = fixture.startDate[1].full;
        //    const startDate = Date.parse(startDateString);

        //    return startDate > moment().subtract(5, 'h');
        //});

        var futureSchedules = _.map(fixtures, (fixture) => { return TranslateMatchFixture(competition, existingTeamIds, fixture); });

        outerCallback(null, _.compact(futureSchedules));
    });
};


const TranslateMatchFixture = function (competitionSeason, existingTeamIds, fixture) {
    try {
        const homeTeam = fixture.participants[0];
        const awayTeam = fixture.participants[1];

        // If no statscore parserid is available for either home or away team found, then ignore this match since it can't be properly used for event feeding
        if (!existingTeamIds[homeTeam.id] || !existingTeamIds[awayTeam.id])
            return null;
        let homeTeamObj, awayTeamObj = null;
        if (existingTeamIds[homeTeam.id]) {
            homeTeamObj = _.pick(existingTeamIds[homeTeam.id], ['name', 'logo']);
            homeTeamObj._id = existingTeamIds[homeTeam.id].id;
        }
        if (existingTeamIds[awayTeam.id]) {
            awayTeamObj = _.pick(existingTeamIds[awayTeam.id], ['name', 'logo']);
            awayTeamObj._id = existingTeamIds[awayTeam.id].id;
        }

        let schedule = {
            sport: 'soccer',
            home_team: homeTeamObj,
            away_team: awayTeamObj,
            name: `${existingTeamIds[homeTeam.id] ? existingTeamIds[homeTeam.id].name.en : ''} - ${existingTeamIds[awayTeam.id] ? existingTeamIds[awayTeam.id].name.en : ''}`,
            competition: competitionSeason.competition.id,
            competitionName: competitionSeason.competition.name,
            season: competitionSeason.id,
            seasonName: competitionSeason.name,
            home_score: 0,
            away_score: 0,
            time: null,
            moderation: [],
            start: moment.utc(fixture.start_date).toDate(),
            state: 0
        };

        schedule.moderation.push({
            type: 'rss-feed',
            parsername: Parser.Name,
            active: true,
            parserid: fixture.id
        });
        //schedule.parserids[Parser.Name] = fixture.id;

        return schedule;
    }
    catch (err) {
        log.error(err.stack);
        return null;
    }
};


Parser.UpdateTeamPlayersCareerStats = function (teamId, seasonId, outerCallback) {
    // Schedule the following cascading callbacks:
    // 1. Get the team from Mongo by the teamId
    // 2. Get the linked competition
    // 3. Get the team's linked players in mongo and build a dictionary of their ids as keys
    // 4. Get all the finished league matches for the team in the league
    // 5. Call for each player having a valid parserids["Stats"] id, the stats endpoint for the player career stats
    // 6. Finally, update each player's document and save back in Mongo

    let competition = null;
    let parserTeamId = null;
    let seasonParserId = null;

    async.waterfall([
        function (callback) {
            return mongoDb.trn_teams
                .findById(teamId)
                .populate('players')
                .exec(callback);
        },
        function (teamObj, callback) {
            if (!teamObj || !teamObj.parserids || !teamObj.parserids[Parser.Name])
                return callback(new Error(`The team ${teamObj.id} has missing or invalid parser id.`));

            GetLeagueFromMongo(null, seasonId, false, function (error, competition) {
                if (error)
                    return callback(error);
                callback(null, competition, teamObj);
            });
        },
        function (competitionObj, teamObj, callback) {
            if (!competitionObj)
                return callback(new Error(`The competition season id ${seasonId} is not found`));
            if (!competitionObj.parserids || !competitionObj.parserids[Parser.Name])
                return callback(new Error(`The competition season id ${seasonId} does not contain a valid parser id`));

            competition = competitionObj;

            let playersLookup = {};
            _.forEach(teamObj.players, function (player) {
                if (player.parserids && player.parserids[Parser.Name] && !playersLookup[player.parserids[Parser.Name]])
                    playersLookup[player.parserids[Parser.Name]] = player;
            });

            seasonParserId = competition.parserids[Parser.Name];
            parserTeamId = teamObj.parserids[Parser.Name];
            Parser.GetTeamSeasonEvents(seasonParserId, parserTeamId, (err, teamMatches) => {
                if (err)
                    return callback(err);

                const finishedMatches = _.filter(teamMatches, { status_type: 'finished' });
                return callback(null, playersLookup, finishedMatches);
            });
        }
    ], function (error, playersLookup, finishedMatches) {
        if (error) {
            log.error(error.stack);
            return outerCallback(error);
        }

        const finishedMatchesParserIds = _.map(finishedMatches, 'id');
        let updatedPlayerStats = 0;

        // reset players stats
        const playerKeys = _.keys(playersLookup);
        playerKeys.forEach((key) => {
            if (!playersLookup[key].stats)
                playersLookup[key].stats = {};
            playersLookup[key].stats.season = {
                "suspensions": 0,
                "overtimeAssists": 0,
                "overtimeGoals": 0,
                "overtimeShots": 0,
                "attacks": 0,
                "tackles": 0,
                "touchesBlocks": 0,
                "touchesInterceptions": 0,
                "touchesPasses": 0,
                "touchesTotal": 0,
                "goalMouthBlocks": 0,
                "clears": 0,
                "cornerKicks": 0,
                "offsides": 0,
                "redCards": 0,
                "yellowCards": 0,
                "foulsSuffered": 0,
                "foulsCommitted": 0,
                "penaltyKicksGoals": 0,
                "penaltyKicksShots": 0,
                "crosses": 0,
                "shotsOnGoal": 0,
                "shots": 0,
                "assistsGameWinning": 0,
                "assistsTotal": 0,
                "goalsKicked": 0,
                "goalsHeaded": 0,
                "goalsOwn": 0,
                "goalsGameWinning": 0,
                "goalsTotal": 0,
                "minutesPlayed": 0,
                "gamesStarted": 0,
                "gamesPlayed": 0
            };
        });

        async.eachLimit(finishedMatchesParserIds, 1, (eventId, callback) => {
            Parser.GetPastEventParticipants(eventId, seasonParserId, (err, participants) => {
                if (!err) {
                    participants.forEach((team) => {
                        if (team.id === parserTeamId && team.subparticipants) {
                            team.subparticipants.forEach((player) => {
                                const mongoPlayer = playersLookup[player.participant_id];
                                if (mongoPlayer && player.stats) {
                                    player.stats.forEach((stat) => {
                                        if (stat.value) {
                                            switch (stat.id) {
                                                case 20:    // shots on target
                                                    mongoPlayer.stats.season.shotsOnGoal += _.toNumber(stat.value);
                                                    break;
                                                case 21:    // shots off target
                                                    break;
                                                case 8:     // yeallow cards
                                                    mongoPlayer.stats.season.yellowCards += _.toNumber(stat.value);
                                                    break;
                                                case 9:     // red cards
                                                    mongoPlayer.stats.season.redCards += _.toNumber(stat.value);
                                                    break;
                                                case 19:    // total shots
                                                    mongoPlayer.stats.season.shots += _.toNumber(stat.value);
                                                    break;
                                                case 22:    // fouls
                                                    mongoPlayer.stats.season.foulsCommitted += _.toNumber(stat.value);
                                                    break;
                                                case 24:    // offsides
                                                    mongoPlayer.stats.season.offsides += _.toNumber(stat.value);
                                                    break;
                                                case 14:    // penalties scored
                                                    mongoPlayer.stats.season.penaltyKicksGoals += _.toNumber(stat.value);
                                                    mongoPlayer.stats.season.penaltyKicksShots += _.toNumber(stat.value);
                                                    break;
                                                case 15:    // penalties missed
                                                    mongoPlayer.stats.season.penaltyKicksShots += _.toNumber(stat.value);
                                                    break;
                                                case 18:    // free kick goals
                                                    break;
                                                case 35:    // appearance
                                                    mongoPlayer.stats.season.gamesPlayed += _.toNumber(stat.value);
                                                    break;
                                                case 36:    // first lineup
                                                    mongoPlayer.stats.season.gamesStarted += _.toNumber(stat.value);
                                                    break;
                                                case 40:    // Goals
                                                    mongoPlayer.stats.season.goalsTotal += _.toNumber(stat.value);
                                                    break;
                                                case 41:    // assists
                                                    mongoPlayer.stats.season.assistsTotal += _.toNumber(stat.value);
                                                    break;
                                                case 34:    // minutes played
                                                    mongoPlayer.stats.season.minutesPlayed += _.toNumber(stat.value);
                                                    break;
                                                case 37:    // on bench
                                                    break;
                                                case 17:    // own goals
                                                    mongoPlayer.stats.season.goalsOwn += _.toNumber(stat.value);
                                                    break;
                                                case 33:    // aerial duels won
                                                    break;
                                                case 717:    // player's position
                                                    break;                                               
                                            }
                                        }
                                    });
                                }
                            });
                        }
                    });
                }

                return callback(null);
            });
        }, (err) => {
            if (err) {

            }

            // Save players
            const players = _.values(playersLookup);
            let playersUpdated = players.length;
            async.eachLimit(players, 100, (player, cbk) => {
                player.markModified('stats.season');
                player.save((err) => {
                    if (err) {
                        log.error(`Error saving league stats for player id ${player.id}`);
                        playersUpdated--;
                    }

                    return cbk(null);
                });
            }, (asyncErr) => {
                if (asyncErr) {
                    log.error(asyncErr.stack);
                    return outerCallback(asyncErr);
                }

                return outerCallback(null, players.length);
            });
        });

    });
};


// Execute all update functions that bring back team and player stats for a given competition and season
Parser.UpdateAllCompetitionStats = function (competitionId, season, outerCallback) {

    // TODO: We should check if next match date < Date.now and then call for stats update to team and players, otherwise it is not needed.
    var competitionTeams = [];
    var competitionSeason;
    var itsNow = moment.utc();
    async.waterfall(
        [
            function (callback) {
                GetLeagueFromMongo(competitionId, null, false, function (error, comp) {
                    if (error)
                        return callback(error);
                    competitionSeason = comp;
                    callback(null);
                });
            },
            function (callback) {
                log.info('Now on to updating teams and players for competition %s', competitionSeason.competition.name.en);
                Parser.UpdateTeams(competitionId, null, function (error, teamsAdded, playersAdded, teamsUpdated, playersUpdated) {
                    if (error)
                        return callback(error);
                    callback(null);
                });
            },
            function (callback) {
                GetTeamStatsFromMongo(competitionId, competitionSeason.id, competitionSeason.teams, function (error, teamsStats) {
                    if (error)
                        return callback(error);

                    // Filter teams for the ones that should be updated, the ones that their next match date has already passed, or those that were just updated.
                    competitionTeams = _.filter(teamsStats, function (teamStats) {
                        return (!teamStats.nextmatch || !teamStats.nextmatch.eventdate || moment.utc(teamStats.nextmatch.eventdate).isBefore(itsNow)); // || (ateam.updated && moment.utc(ateam.updated).clone().add(1, 'm') > itsNow));
                    });
                    callback(null);
                });
            },
            function (callback) {
                if (!competitionSeason.parserids || !competitionSeason.parserids[Parser.Name])
                    async.setImmediate(function () {
                        callback(null);
                    });
                else {
                    log.info('Now on to updating team standings for competition %s', competitionSeason.competition.name.en);
                    Parser.UpdateLeagueStandings(competitionSeason, competitionSeason.competition.id, competitionSeason.id, function (standingsError) {
                        if (standingsError)
                            log.error(standingsError.stack);

                        callback(null);
                    });
                }
            },
            function (callback) {
                log.info('Now on to updating player season stats for competition %s', competitionSeason.name.en);
                async.eachSeries(competitionTeams, function (team, innerCallback) {
                    return Parser.UpdateTeamPlayersCareerStats(team.id, competitionSeason.id, (playersErr, playerResults) => {
                        if (playersErr)
                            log.error(playersErr.stack);
                        innerCallback(null, playerResults);
                    });
                }, function (seriesError) {
                    if (seriesError)
                        log.error(seriesError.message);
                    //return callback(seriesError);
                    callback(null);
                });
            }
        ], function (error) {
            if (error) {
                log.error('Error while updating all stats for competition %s and season %d: %s', competitionId, season, error.message);
                return outerCallback(error);
            }
            log.info('Terminated updating teams and players statistics with success for competition %s', competitionSeason.name.en);

            outerCallback(null);
        });
};


Parser.TestGuruStats = function (callback) {
    mongoDb.scheduled_matches.findById('5a8039fabc5f3a14000efa90', 'competition parserids home_team away_team', function (err, match) {
        if (err)
            return callback(err);
        return Parser.UpdateGuruStats(match, callback);
    });
};


// Used properties from scheduledMatch: competition, home_team, away_team
Parser.UpdateGuruStats = function (scheduledMatch, outerCallback) {
    if (
        //!scheduledMatch.moderation || scheduledMatch.moderation.length == 0 || !scheduledMatch.moderation[0].parserid
        !scheduledMatch.home_team || !scheduledMatch.away_team)
        return outerCallback(null);

    //let parserid = scheduledMatch.moderation[0].parserid;
    let competitionid = scheduledMatch.competition;
    let seasonId = scheduledMatch.season;
    let homeTeamId = scheduledMatch.home_team;
    let awayTeamId = scheduledMatch.away_team;

    let homeTeamParserId, awayTeamParserId;
    let seasonParserId;
    // Get competition parser id, and the parser ids from the 2 teams
    async.parallel([
        function (callback) {
            if (scheduledMatch.season && scheduledMatch.season.parserids) {
                seasonParserId = scheduledMatch.season.parserids[Parser.Name];
                return callback(null, scheduledMatch.season.id);
            }

            mongoDb.trn_competition_seasons
                .findById(seasonId, 'parserids')
                //.populate('competition')
                .exec( (compError, season) => {
                    if (compError)
                        return callback(compError);
                    seasonParserId = season.parserids[Parser.Name];
                    callback(null, seasonId);
                });
        },
        function (callback) {
            mongoDb.trn_teams.findById(homeTeamId, 'parserids', function (teamError, team) {
                if (teamError)
                    return callback(teamError);

                if (team.parserids && team.parserids[Parser.Name])
                    homeTeamParserId = team.parserids[Parser.Name];

                callback(null, homeTeamParserId);
            });
        },
        function (callback) {
            mongoDb.trn_teams.findById(awayTeamId, 'parserids', function (teamError, team) {
                if (teamError)
                    return callback(teamError);

                if (team.parserids && team.parserids[Parser.Name])
                    awayTeamParserId = team.parserids[Parser.Name];
                callback(null, awayTeamParserId);
            });
        }
    ], function (error) {
        if (error)
            return outerCallback(error);
        if (!homeTeamParserId || !awayTeamParserId)
            return outerCallback();

        const teamIds = [homeTeamParserId, awayTeamParserId];
        Parser.GetLeagueSeasonEvents(seasonParserId, null, function (innerError, results) {
            if (innerError)
                return outerCallback(innerError);

            const matches = _.filter(results, { status_type: 'finished' });

            let homeTeamMatches = _.filter(matches, (m) => {
                return m.participants && m.participants.length === 2 && (m.participants[0].id === homeTeamParserId || m.participants[1].id === homeTeamParserId);
            });
            homeTeamMatches = _.orderBy(homeTeamMatches, (match) => {
                return moment.utc(match.start_date);
            }, ['desc']);
            let awayTeamMatches = _.filter(matches, (m) => {
                return m.participants && m.participants.length === 2 && (m.participants[0].id === awayTeamParserId || m.participants[1].id === awayTeamParserId);
            });
            awayTeamMatches = _.orderBy(awayTeamMatches, (match) => {
                return moment.utc(match.start_date);
            }, ['desc']);
            homeTeamMatches = _.take(homeTeamMatches, 10);
            awayTeamMatches = _.take(awayTeamMatches, 10);
            let homeTeamMatchParserIds = _.map(homeTeamMatches, 'id');
            let awayTeamMatchParserIds = _.map(awayTeamMatches, 'id');

            let interestingEventIds = [419, 408, 413, 405];
            //"419": "Yellow",
            //"408": "Corner",
            //"418": "Red",
            //"410": "Foul",
            //"413": "Goal",
            ////"415": "Injury",  // not supported by Sportimo yet.
            //"416": "Offside",
            //"420": "Penalty",
            //"421": "Goal",  // "Penalty-Goal"
            ////"422": "Missed-Penalty",
            ////"19": "Shot_off_Goal",   // forcing simple shot events to be registered as Shot_on_Goal as well
            //"405": "Shot_on_Goal",
            //// "414": "Substitution",
            //"423": "Own_Goal",
            ////"424": "Goal-Cancelled"

            let guruStats = {
                Yellow: {
                    homeTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    awayTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    total: [0, 0, 0, 0, 0, 0, 0, 0, 0]
                },
                Corner: {
                    homeTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    awayTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    total: [0, 0, 0, 0, 0, 0, 0, 0, 0]
                },
                Goal: {
                    homeTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    awayTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    total: [0, 0, 0, 0, 0, 0, 0, 0, 0]
                },
                Shot_On_Goal: {
                    homeTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    awayTeam: [0, 0, 0, 0, 0, 0, 0, 0, 0],
                    total: [0, 0, 0, 0, 0, 0, 0, 0, 0]
                }
            };

            let homeTeamMatchesCount = 0;
            let awayTeamMatchesCount = 0;
            // first dimension is 0 for the total stats for both teams, 1 for home team, 2 for away team.
            // second dimension is the 10 minutes match period.
            // each cell holds the average per event type (0 for Yellow, 1 for Corner, 2 for Goal, 3 for Shot on Goal)
            let index = 0;
            async.series([
                function (s1cbk) {
                    async.eachLimit(homeTeamMatchParserIds, 1, function (parserId, callback) {
                        //setTimeout(function () {
                            Parser.GetPastEventFeed(parserId, function (err, events) {
                                if (err) {
                                    log.warn(err.message + '\nError while getting match %s events while computing Guru stats. Continuing with next one...', parserId);
                                    return callback(null);
                                }

                                homeTeamMatchesCount++;
                                let interestingEvents = _.filter(events, function (event) {
                                    //return msg.data && msg.data.incident && _.indexOf(interestingEventIds, msg.data.incident.incident_id) > -1 && (msg.data.incident.participant_id == homeTeamParserId);
                                    return _.indexOf(interestingEventIds, event.incident_id) > -1 && (event.participant_id == homeTeamParserId);
                                });
                                _.forEach(interestingEvents, function (event) {
                                    if (!event.event_time)
                                        return;

                                    const eventTimeFromMatchStart = +(_.split(event.event_time, ':')[0]) + 1;
                                    const timeIndex = eventTimeFromMatchStart >= 90 ? 8 : Math.floor(eventTimeFromMatchStart / 10);

                                    switch (event.incident_id) {
                                        case 419:
                                            if (!guruStats.Yellow.homeTeam[timeIndex])
                                                guruStats.Yellow.homeTeam[timeIndex] = 1;
                                            else
                                                guruStats.Yellow.homeTeam[timeIndex]++;
                                            break;
                                        case 408:
                                            if (!guruStats.Corner.homeTeam[timeIndex])
                                                guruStats.Corner.homeTeam[timeIndex] = 1;
                                            else
                                                guruStats.Corner.homeTeam[timeIndex]++;
                                            break;
                                        case 413:
                                            if (!guruStats.Goal.homeTeam[timeIndex])
                                                guruStats.Goal.homeTeam[timeIndex] = 1;
                                            else
                                                guruStats.Goal.homeTeam[timeIndex]++;
                                            break;
                                        case 405:
                                            if (!guruStats.Shot_On_Goal.homeTeam[timeIndex])
                                                guruStats.Shot_On_Goal.homeTeam[timeIndex] = 1;
                                            else
                                                guruStats.Shot_On_Goal.homeTeam[timeIndex]++;
                                            break;
                                    }
                                });
                                callback(null);
                            });
                        //}, index++ * 200);
                    }, s1cbk);
                },
                function (s2cbk) {
                    index = 0;
                    async.eachLimit(awayTeamMatchParserIds, 1, function (parserId, callback) {
                        Parser.GetPastEventFeed(parserId, function (err, events) {
                            if (err) {
                                log.warn(err.message + '\nError while getting match %s events while computing Guru stats. Continuing with next one...', parserId);
                                return callback(null);
                            }

                            awayTeamMatchesCount++;
                            let interestingEvents = _.filter(events, function (event) {
                                //return msg.data && msg.data.incident && _.indexOf(interestingEventIds, msg.data.incident.incident_id) > -1 && (msg.data.incident.participant_id == awayTeamParserId);
                                return _.indexOf(interestingEventIds, event.incident_id) > -1 && (event.participant_id == awayTeamParserId);
                            });
                            _.forEach(interestingEvents, function (event) {
                                if (!event.event_time)
                                    return;

                                const eventTimeFromMatchStart = +(_.split(event.event_time, ':')[0]) + 1;
                                const timeIndex = eventTimeFromMatchStart >= 90 ? 8 : Math.floor(eventTimeFromMatchStart / 10);

                                switch (event.incident_id) {
                                    case 419:
                                        if (!guruStats.Yellow.awayTeam[timeIndex])
                                            guruStats.Yellow.awayTeam[timeIndex] = 1;
                                        else
                                            guruStats.Yellow.awayTeam[timeIndex]++;
                                        break;
                                    case 408:
                                        if (!guruStats.Corner.awayTeam[timeIndex])
                                            guruStats.Corner.awayTeam[timeIndex] = 1;
                                        else
                                            guruStats.Corner.awayTeam[timeIndex]++;
                                        break;
                                    case 413:
                                        if (!guruStats.Goal.awayTeam[timeIndex])
                                            guruStats.Goal.awayTeam[timeIndex] = 1;
                                        else
                                            guruStats.Goal.awayTeam[timeIndex]++;
                                        break;
                                    case 405:
                                        if (!guruStats.Shot_On_Goal.awayTeam[timeIndex])
                                            guruStats.Shot_On_Goal.awayTeam[timeIndex] = 1;
                                        else
                                            guruStats.Shot_On_Goal.awayTeam[timeIndex]++;
                                        break;
                                }
                            });
                            callback(null);
                        });
                    }, s2cbk);
                }
            ], function (seriesError) {
                if (seriesError) {
                    //log.error('Failed to save Guru stats due to: %s', seriesError.message);
                    return outerCallback(seriesError);
                }

                // Calc totals and averages
                for (let i = 0; i < 9; i++) {
                    guruStats.Yellow.total[i] = (guruStats.Yellow.homeTeam[i] + guruStats.Yellow.awayTeam[i]);
                    guruStats.Corner.total[i] = (guruStats.Corner.homeTeam[i] + guruStats.Corner.awayTeam[i]);
                    guruStats.Goal.total[i] = (guruStats.Goal.homeTeam[i] + guruStats.Goal.awayTeam[i]);
                    guruStats.Shot_On_Goal.total[i] = (guruStats.Shot_On_Goal.homeTeam[i] + guruStats.Shot_On_Goal.awayTeam[i]);
                }

                mongoDb.matches.update({ _id: scheduledMatch._id }, { guruStats: guruStats, guruStatsChecked: true }, function (updateError) {
                    if (updateError)
                        return outerCallback(updateError);

                    outerCallback(null, guruStats);
                });
            });

        });

    });
};


// find all instances of a player in other leagues/ teams and update its locale properties (names)
Parser.UpdatePlayerNamesLocale = function (competitionId, locale, callback) {

    let allPlayers = [];
    let allTeamIds = [];
    let playerLookup = {};
    let teamLookup = {};

    return async.waterfall([
        (cbk) => { return mongoDb.trn_teams.find({ competitionid: competitionId }, '_id name', cbk); },
        (teams, cbk) => {

            const teamIds = _.map(teams, 'id');
            allTeamIds = teamIds;
            teamLookup = _.keyBy(teams, 'id');
            return mongoDb.trn_players.find({ teamId: { $in: teamIds } }, '_id name firstName lastName teamId parserids', cbk);
        },
        (players, cbk) => {

            allPlayers = players;
            const parserIds = _.uniq(_.compact(_.map(players, (player) => {
                if (!player.parserids || !player.parserids[Parser.Name])
                    return null;
                return player.parserids[Parser.Name];
            })));
            playerLookup = _.keyBy(players, (player) => { return player.parserids[Parser.Name]; });

            return mongoDb.trn_players.find({ ['parserids.' + Parser.Name]: { $in: parserIds, $exists: true }, teamId: {$nin: allTeamIds} }, '_id name firstName lastName teamId parserids', cbk);
        },
        (similarPlayers, cbk) => {

            let playersToUpdate = [];
            let index = 1;

            _.forEach(similarPlayers, (player) => {
                const parserId = player.parserids[Parser.Name];
                const original = playerLookup[parserId];

                if (!original)
                    return;

                let updateThis = false;

                if (!original.name[locale] && player.name[locale]) {
                    original.name[locale] = player.name[locale];
                    original.markModified('name.' + locale);
                    updateThis = true;
                }
                if (!original.firstName[locale] && player.firstName[locale]) {
                    original.firstName[locale] = player.firstName[locale];
                    original.markModified('firstName.' + locale);
                    updateThis = true;
                }
                if (!original.lastName[locale] && player.lastName[locale]) {
                    original.lastName[locale] = player.lastName[locale];
                    original.markModified('lastName.' + locale);
                    updateThis = true;
                }

                if (updateThis) {
                    console.log(`Updating #${index++} ${teamLookup[original.teamId].name.en} player ${original.name.en} to ${locale} ${original.name[locale]}`);
                    playersToUpdate.push(original);
                }
            });

            return cbk(null, playersToUpdate);
        },
        (playersToUpdate, cbk) => {
            if (playersToUpdate.length == 0)
                return cbk(null);

            return async.eachLimit(playersToUpdate, 100, (player, innerCbk) => {
                player.save(innerCbk);
            }, cbk);
        }
    ], callback);
}


var TranslatePlayerStats = function (stats) {
    return {
        gamesPlayed: stats ? stats.gamesPlayed : 0,
        gamesStarted: stats ? stats.gamesStarted : 0,
        minutesPlayed: stats ? stats.minutesPlayed : 0,
        goalsTotal: stats && stats.goals && stats.goals.total ? stats.goals.total : 0,
        goalsGameWinning: stats && stats.goals && stats.goals.gameWinning ? stats.goals.gameWinning : 0,
        goalsOwn: stats && stats.goals && stats.goals.goalsOwn ? stats.goals.goalsOwn : 0,
        goalsHeaded: stats && stats.goals && stats.goals.headed ? stats.goals.headed : 0,
        goalsKicked: stats && stats.goals && stats.goals.kicked ? stats.goals.kicked : 0,
        assistsTotal: stats && stats.assists && stats.assists.total ? stats.assists.total : 0,
        assistsGameWinning: stats && stats.assists && stats.assists.gameWinning ? stats.assists.gameWinning : 0,
        shots: stats ? stats.shots : 0,
        shotsOnGoal: stats ? stats.shotsOnGoal : 0,
        crosses: stats ? stats.crosses : 0,
        penaltyKicksShots: stats && stats.penaltyKicks && stats.penaltyKicks.shots ? stats.penaltyKicks.shots : 0,
        penaltyKicksGoals: stats && stats.penaltyKicks && stats.penaltyKicks.goals ? stats.penaltyKicks.goals : 0,
        foulsCommitted: stats ? stats.foulsCommitted : 0,
        foulsSuffered: stats ? stats.foulsSuffered : 0,
        yellowCards: stats ? stats.yellowCards : 0,
        redCards: stats ? stats.redCards : 0,
        offsides: stats ? stats.offsides : 0,
        cornerKicks: stats ? stats.cornerKicks : 0,
        clears: stats ? stats.clears : 0,
        goalMouthBlocks: stats ? stats.goalMouthBlocks : 0,
        touchesTotal: stats && stats.touches && stats.touches.total ? stats.touches.total : 0,
        touchesPasses: stats && stats.touches && stats.touches.passes ? stats.touches.passes : 0,
        touchesInterceptions: stats && stats.touches && stats.touches.interceptions ? stats.touches.interceptions : 0,
        touchesBlocks: stats && stats.touches && stats.touches.blocks ? stats.touches.blocks : 0,
        tackles: stats ? stats.tackles : 0,
        attacks: stats ? stats.attacks : 0,
        overtimeShots: stats && stats.overtime && stats.overtime.shots ? stats.overtime.shots : 0,
        overtimeGoals: stats && stats.overtime && stats.overtime.goals ? stats.overtime.goals : 0,
        overtimeAssists: stats && stats.overtime && stats.overtime.assists ? stats.overtime.assists : 0,
        suspensions: stats ? stats.suspensions : 0
    };
};

// TODO: Team stat names should be the same as the events referenced through out the game.
var TranslateTeamStats = function (stats) {
    return {
        gamesPlayed: stats && stats.gamesPlayed ? stats.gamesPlayed : 0,
        Goal: stats && stats.goals.total ? stats.goals.total : 0,
        Shot_On_Goal: stats && stats.shotsOnGoal ? stats.shotsOnGoal : 0,
        Crosses: stats && stats.crosses ? stats.crosses : 0,
        Penalty: stats && stats.penaltyKicks && stats.penaltyKicks.shots ? stats.penaltyKicks.shots : 0,
        Foul: stats && stats.foulsCommitted ? stats.foulsCommitted : 0,
        Yellow: stats && stats.yellowCards ? stats.yellowCards : 0,
        Red: stats && stats.redCards ? stats.redCards : 0,
        Offside: stats && stats.offsides ? stats.offsides : 0,
        Corner: stats && stats.cornerKicks ? stats.cornerKicks : 0,
        Clear: stats && stats.clears ? stats.clears : 0
    };
};



// Statscore.com Endpoint invocation Methods

let lastCallTime = null;

const Throttle = function (timeout, callback) {

    if (!lastCallTime || !timeout) {
        lastCallTime = new Date();
        return callback(null);
    }

    const msDiff = moment.utc().diff(moment.utc(lastCallTime));
    if (msDiff > timeout) {
        lastCallTime = new Date();
        return callback(null);
    }

    log.debug(`throttle-wait for ${timeout - msDiff} ms`);
    lastCallTime = moment.utc().add(timeout - msDiff, 'ms').toDate();
    setTimeout(() => {
        return callback(null);
    }, timeout - msDiff);
};

const Authenticate = function (callback) {

    const url = configuration.urlPrefix + "oauth.xml?client_id=" + configuration.apiKey + "&secret_key=" + configuration.apiSecret;
    needle.get(url, needleOptions, function (error, response) {
        if (error)
            return callback(error);

        if (response.statusCode != 200) {
            if (response.statusCode === 401) {
                authToken = null;
                authTokenExpiration = null;
            }
            return callback(new Error('[Statscore]: failed to get the authorization token.'));
        }

        /* parse xml response of the type (example)

            <api ver="2.94" timestamp="1510163874">
	            <method name="oauth" details="https://softnet.atlassian.net/wiki/display/APS/oauth" total_items="" previous_page="" next_page="">
		            <parameter name="client_id" value="132"/>
		            <parameter name="secret_key" value="3iqAJvFlU0Y4bjB7MNkA4tu8tDMNI4QVYkh"/>
	            </method>
	            <data>
		            <oauth client_id="132" token="ee8f93068ed00972542d9a214ae52745" token_expiration="1510250274"/>
	            </data>
            </api>
        */

        // get the oAuth token
        authToken = response.body.api.data.oauth['$'].token.toString();
        authTokenExpiration = new Date(response.body.api.data.oauth['$'].token_expiration);
        return callback(null, authToken);
    });
};


Parser.GetTeamPlayers = function (seasonId, teamId, languageId, callback) {

    const now = new Date();
    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            Throttle(1000, () => {
                let url = configuration.urlPrefix + "participants/" + teamId + "/squad?token=" + authToken + "&sport_id=5&season_id=" + seasonId;
                // language parameter 'lang' is not properly supported as it should according to documentation. If included in the url, produces a 400 Bad Request response.
                //if (languageId !== 'undefined' || languageId != null)
                //    url += "&lang=" + languageId;

                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);
                    try {
                        if (response.statusCode != 200)
                            return cbk(new Error("Response code from " + url + " : " + response.statusCode));

                        var players = response.body.api.data.participants;
                        cbk(null, players);
                    }
                    catch (err) {
                        return cbk(err);
                    }
                });
            });
        }
    ], callback);
};


Parser.GetLeagueTeams = function (seasonId, callback) {

    const now = new Date();
    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            Throttle(1000, () => {
                const url = configuration.urlPrefix + "participants?token=" + authToken + "&type=team&sport_id=5&limit=250&season_id=" + seasonId;

                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);
                    try {
                        let teams = response.body.api.data.participants;
                        cbk(null, teams);
                    }
                    catch (err) {
                        return cbk(err);
                    }
                });
            });
        }
    ], callback);
};


Parser.GetTeamSeasonEvents = function (parserSeasonId, parserTeamId, callback) {

    const now = new Date();
    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            Throttle(1000, () => {
                const url = `${configuration.urlPrefix}events?participant_id=${parserTeamId}&season_id=${parserSeasonId}&token=${authToken}`;

                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);

                    try {
                        if (response.body.api.error)
                            return cbk(new Error(response.body.api.error.message));

                        if (
                            !response.body
                            || !response.body.api
                            || !response.body.api.data
                            || !response.body.api.data.competitions
                            || response.body.api.data.competitions.length == 0
                            || !response.body.api.data.competitions[0].seasons
                            || response.body.api.data.competitions[0].seasons.length == 0
                            || !response.body.api.data.competitions[0].seasons[0].stages
                            || response.body.api.data.competitions[0].seasons[0].stages.length == 0
                            || !response.body.api.data.competitions[0].seasons[0].stages[0].groups
                            || response.body.api.data.competitions[0].seasons[0].stages[0].groups.length == 0
                            || !response.body.api.data.competitions[0].seasons[0].stages[0].groups[0].events
                        )
                            return cbk(new Error('Not Found'));

                        const teamMatches = response.body.api.data.competitions[0].seasons[0].stages[0].groups[0].events;

                        return cbk(null, teamMatches);
                    }
                    catch (err) {
                        console.error(err);
                        return cbk(err);
                    }
                });
            });
        }
    ], callback);
}

Parser.GetLeagueSeasonEvents = function (parserSeasonId, parserTeamIds, callback) {
    if (!parserSeasonId)
        return callback(new Error(`The parserSeasonId is missing or invalid for parser ${Parser.Name}`));

    const pageLimit = 100;

    const GetLeagueSeasonEventPage = function (seasonId, page, cbk) {
        Throttle(1000, () => {
            let url = `${configuration.urlPrefix}events?sport_id=5&season_id=${seasonId}&token=${authToken}&page=${page}&limit=${pageLimit}&sort_type=start_date`;
            if (parserTeamIds) {
                let parserIdString = parserTeamIds[0];
                for (let i = 0; i < parserTeamIds.length - 1; i++)
                    parserIdString += ',' + parserTeamIds[i + 1];
                url += `&participant_id=${parserIdString}`;
            }

            needle.get(url, needleOptions, function (error, response) {
                if (error)
                    return cbk(error);

                try {
                    if (response.body.api.error)
                        return cbk(new Error(response.body.api.error.message));

                    if (
                        !response.body
                        || !response.body.api
                        || !response.body.api.data
                        || !response.body.api.data.competitions
                        || response.body.api.data.competitions.length === 0
                        || !response.body.api.data.competitions[0].seasons
                        || response.body.api.data.competitions[0].seasons.length === 0
                        || !response.body.api.data.competitions[0].seasons[0].stages
                        || response.body.api.data.competitions[0].seasons[0].stages.length === 0
                        || !response.body.api.data.competitions[0].seasons[0].stages[0].groups
                        || response.body.api.data.competitions[0].seasons[0].stages[0].groups.length === 0
                    )
                        return cbk(new Error('Not Found'));

                    let totalItems = null;
                    let totalPages = 0;

                    if (response && response.body && response.body.api && response.body.api.data && response.body.api.data.competitions && _.isArray(response.body.api.data.competitions)) {
                        if (response && response.body && response.body.api && response.body.api.method && response.body.api.method.total_items) {
                            totalItems = response.body.api.method.total_items;
                            totalPages = Math.trunc(totalItems / pageLimit) + 1;
                        }

                        const matches = _.flatMap(response.body.api.data.competitions[0].seasons[0].stages[0].groups, 'events');
                        return cbk(null, matches, totalPages);
                    }
                    else {
                        let errorMsg = `Failed fetching season events from endpoint ${url} `;
                        if (response && response.body && response.body.api && response.body.api.error && response.body.api.error.message) {
                            errorMsg += ': ' + response.body.api.error.message;
                        }

                        return cbk(new Error(errorMsg));
                    }
                }
                catch (err) {
                    console.error(err);
                    return cbk(err);
                }
            });
        });
    };

    const now = new Date();

    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            let allEvents = [];

            GetLeagueSeasonEventPage(parserSeasonId, 1, (firstPageErr, firstPageResults, totalPages) => {
                if (firstPageErr)
                    return cbk(firstPageErr);

                allEvents = allEvents.concat(firstPageResults);


                if (totalPages > 1) {
                    const pageRange = _.range(2, totalPages + 1);
                    return async.eachLimit(pageRange, 1, (page, asyncCbk) => {
                        GetLeagueSeasonEventPage(parserSeasonId, page, (pageErr, pageResults, totPages) => {
                            if (pageErr) {
                                log.error(pageErr);
                            } else {
                                allEvents = allEvents.concat(pageResults);
                            }
                            return asyncCbk(null, allEvents);
                        });
                    }, (asyncErr) => {
                        if (asyncErr)
                            return cbk(asyncErr);

                        return cbk(null, allEvents);
                    });
                }
                else
                    return cbk(null, allEvents);
            });
        }
    ], callback);
};


Parser.GetPastEventParticipants = function (parserEventId, seasonId, callback) {
    const now = new Date();
    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {

            Throttle(1000, () => {
                const url = `${configuration.urlPrefix}events/${parserEventId}/participants?token=${authToken}&sport_id=5&season_id=${seasonId}`;

                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);
                    try {
                        let participants = response.body.api.data.participants;
                        cbk(null, participants);
                    }
                    catch (err) {
                        return cbk(err);
                    }
                });
            });
        }
    ], callback);
};


Parser.GetPastEventFeedPage = function (statscoreMatchId, page, callback) {
    Throttle(1000, () => {
        const url = `${configuration.urlPrefix}events/${statscoreMatchId}?token=${authToken}&limit=500&page=${page}`;

        needle.get(url, needleOptions, function (error, response) {
            if (error) {
                log.error(error.stack);
                return callback(error);
            }

            let totalItems = null;
            let totalPages = 0;

            if (
                response
                && response.body
                && response.body.api
                && response.body.api.data
                && response.body.api.data.competition
                && response.body.api.data.competition.season
                && response.body.api.data.competition.season.stage
                && response.body.api.data.competition.season.stage.group
                && response.body.api.data.competition.season.stage.group.event
            ) {
                if (response && response.body && response.body.api && response.body.api.method && response.body.api.method.total_items) {
                    totalItems = response.body.api.method.total_items;
                    totalPages = Math.trunc(totalItems / 500) + 1;
                }

                return callback(null, response.body.api.data.competition.season.stage.group.event.events_incidents, totalPages);
            }
            else {
                let errorMsg = `Failed fetching event feed ${statscoreMatchId} `;
                if (response && response.body && response.body.api && response.body.api.error && response.body.api.error.message) {
                    errorMsg += ': ' + response.body.api.error.message;
                }

                return callback(new Error(errorMsg));
            }
        });
    });
}

Parser.GetPastEventFeed = function (statscoreMatchId, callback) {
    const now = new Date();

    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            let allEvents = [];

            Parser.GetPastEventFeedPage(statscoreMatchId, 1, (firstPageErr, firstPageResults, totalPages) => {
                if (firstPageErr)
                    return cbk(firstPageErr);

                allEvents = allEvents.concat(firstPageResults);


                if (totalPages > 1) {
                    const pageRange = _.range(2, totalPages + 1);
                    return async.eachLimit(pageRange, 1, (page, asyncCbk) => {
                        Parser.GetPastEventFeedPage(statscoreMatchId, page, (pageErr, pageResults, totPages) => {
                            if (pageErr) {
                                log.error(pageErr);
                            } else {
                                allEvents = allEvents.concat(pageResults);
                            }
                            return asyncCbk(null, allEvents);
                        });
                    }, (asyncErr) => {
                        if (asyncErr)
                            return cbk(asyncErr);

                        return cbk(null, allEvents);
                    });
                }
                else
                    return cbk(null, allEvents);
            });

        }
    ], callback);
}



Parser.GetLeagueSeasonFixtures = function (competitionId, seasonId, callback) {
    // sample call https://api.softnetsport.com/v2/events?token=aaeb65a5c63897f05fd4ed1b217fee71&competition_id=1556&season_id=29860&date_from=2017-12-07+00:00:00

    const date_from = moment.utc(new Date()).startOf('day').format('YYYY-MM-DD+HH:mm:ss');
    const date_to = moment.utc(new Date()).startOf('day').add(30, 'd').format('YYYY-MM-DD+HH:mm:ss');
    const now = new Date();


    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            Throttle(1000, () => {
                const url = `${configuration.urlPrefix}events?token=${authToken}&competition_id=${competitionId}&season_id=${seasonId}&date_from=${date_from}&date_to=${date_to}&scoutsfeed=yes`;  // &status_type=scheduled

                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);

                    try {
                        if (response.body.api.error)
                            return cbk(new Error(response.body.api.error.message));

                        if (
                            !response.body
                            || !response.body.api
                            || !response.body.api.data
                            || !response.body.api.data.competitions
                            || response.body.api.data.competitions.length === 0
                            || !response.body.api.data.competitions[0].seasons
                            || response.body.api.data.competitions[0].seasons.length === 0
                            || !response.body.api.data.competitions[0].seasons[0].stages
                            || response.body.api.data.competitions[0].seasons[0].stages.length === 0
                            || !response.body.api.data.competitions[0].seasons[0].stages[0].groups
                            || response.body.api.data.competitions[0].seasons[0].stages[0].groups.length === 0
                        )
                            return callback(null, []);


                        const stages = _.flatMap(response.body.api.data.competitions[0].seasons[0].stages, 'groups');
                        const fixtures = _.flatMap(stages, 'events');

                        // iterate over next pages
                        return cbk(null, fixtures);
                    }
                    catch (err) {
                        console.error(err);
                        if (cbk && _.isFunction(cbk))
                            return cbk(err);
                    }
                });
            });
        }
    ], callback);
};

/*
Parser.GetLeagueSeasonEvents = function (competitionId, seasonId, callback) {
    // sample call https://api.softnetsport.com/v2/events?token=aaeb65a5c63897f05fd4ed1b217fee71&competition_id=1556&season_id=29860

    const now = new Date();


    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            Throttle(1000, () => {
                const url = `${configuration.urlPrefix}events?token=${authToken}&competition_id=${competitionId}&season_id=${seasonId}&limit=100`;

                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);

                    try {
                        if (response.body.api.error)
                            return cbk(new Error(response.body.api.error.message));

                        if (
                            !response.body
                            || !response.body.api
                            || !response.body.api.data
                            || !response.body.api.data.competitions
                            || response.body.api.data.competitions.length == 0
                            || !response.body.api.data.competitions[0].seasons
                            || response.body.api.data.competitions[0].seasons.length == 0
                            || !response.body.api.data.competitions[0].seasons[0].stages
                            || response.body.api.data.competitions[0].seasons[0].stages.length == 0
                            || !response.body.api.data.competitions[0].seasons[0].stages[0].groups
                            || response.body.api.data.competitions[0].seasons[0].stages[0].groups.length == 0
                        )
                            return callback(null, []);

                        const fixtures = _.flatMap(response.body.api.data.competitions[0].seasons[0].stages[0].groups, 'events');

                        // iterate over next pages
                        return cbk(null, fixtures);
                    }
                    catch (err) {
                        console.error(err);
                        if (cbk && _.isFunction(cbk))
                            return cbk(err);
                    }
                });
            });
        }
    ], callback);
};
*/

Parser.GetStandingTypes = function(competitionId, seasonId, callback) {
    const now = new Date();

    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            Throttle(1000, () => {
                const url = `${configuration.urlPrefix}standings?token=${authToken}&object_type=season&object_id=${seasonId}`;
                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);

                    try {
                        if (response.body.api.error)
                            return cbk(new Error(response.body.api.error.message));

                        if (
                            !response.body
                            || !response.body.api
                            || !response.body.api.data
                        )
                            return cbk(new Error('Not Found'));

                        if (!response.body.api.data.standings_list
                            || response.body.api.data.standings_list.length == 0)
                            return cbk(null, []);


                        const standingTypes = response.body.api.data.standings_list;

                        // iterate over next pages
                        return cbk(null, standingTypes);
                    }
                    catch (err) {
                        console.error(err);
                        return cbk(err);
                    }
                });
            });
        }
    ], callback);
}


Parser.GetStandingType = function (standingTypes, standingTypeId, perGroup, callback) {
    const now = new Date();
    if (!standingTypes)
        return callback(new Error(`Invalid or empty standingTypes object parameter`));
    if (standingTypeId === 'undefined' || standingTypeId == null)
        return callback(new Error(`Invalid or empty standingTypeId parameter`));
    const standingTypeObj = _.find(standingTypes, { type_id: standingTypeId });
    if (!standingTypeObj)
        return callback(new Error(`Standing type id ${standingTypeId} is not found in standing types: \n${JSON.stringify(standingTypes, null, '\t')}`));

    return async.waterfall([
        (cbk) => {
            if (!authToken || !authTokenExpiration || now > authTokenExpiration)
                return Authenticate(cbk);
            else
                return async.setImmediate(() => { return cbk(null, authToken); });
        },
        (authToken, cbk) => {
            Throttle(1000, () => {
                const url = `${configuration.urlPrefix}standings/${standingTypeObj.id}?token=${authToken}`;

                needle.get(url, needleOptions, function (error, response) {
                    if (error)
                        return cbk(error);

                    try {
                        if (response.body.api.error)
                            return cbk(new Error(response.body.api.error.message));

                        if (
                            !response.body
                            || !response.body.api
                            || !response.body.api.data
                            || !response.body.api.data.standings
                            || !response.body.api.data.standings.groups
                            || response.body.api.data.standings.groups.length == 0
                            || !response.body.api.data.standings.groups[0].participants
                            || response.body.api.data.standings.groups[0].participants.length == 0
                        )
                            return cbk(new Error('Not Found'));

                        //const leagueStandings = response.body.api.data.standings.groups[0].participants;

                        const leagueStandings = !perGroup ?
                            _.flatMap(response.body.api.data.standings.groups, 'participants') :
                            _.map(response.body.api.data.standings.groups, (i) => { return _.pick(i, ['id', 'name', 'participants']); });

                        return cbk(null, leagueStandings);
                    }
                    catch (err) {
                        console.error(err);
                        return cbk(err);
                    }
                });
            });
        }
    ], callback);
};


Parser.MigrateArabicNamesAndKits = function (competitionId, seasonId, callback) {

    const parserIdName = 'parserids.' + Parser.Name;
    let mongoTeams = null;
    let mongoPlayers = null;
    let mongoCompetition = null;
    let mongoSeason = null;

    let teamsUpdated = 0;
    let playersUpdated = 0;

    async.waterfall([
        // Get competition [Mongo]
        (cbk) => {

            const query = { competition: competitionId };
            if (seasonId)
                query._id = seasonId;

            return mongoDb.trn_competition_seasons
                .find(query)
                .populate([{ path: 'competition' }, { path: 'teams', populate: { path: 'players' } }])
                .sort({ startDate: -1 })
                .limit(1)
                .exec(cbk);
            //return mongoDb.competitions.findById(competitionId).populate({ path: 'teams', populate: { path: 'players' } }).exec(cbk);
        },
        // Get competition teams [Mongo]
        (competitionSeasons, cbk) => {

            if (!competitionSeasons || competitionSeasons.length === 0)
                return cbk(new Error(`Cannot proceed to update teams and players for competition ${competitionId} does not have a valid season.`));

            mongoSeason = competitionSeasons[0];
            mongoCompetition = mongoSeason.competition;
            if (!mongoCompetition.parserids || !mongoCompetition.parserids[Parser.Name]) {
                return cbk(new Error(`Cannot proceed to update teams and players for competition ${competitionId} does not have valid ${Parser.Name} parserids.`));
            }
            if (!mongoSeason.parserids || !mongoSeason.parserids[Parser.Name]) {
                return cbk(new Error(`Cannot proceed to update teams and players for season ${season.id} does not have valid ${Parser.Name} parserids.`));
            }
            if (!mongoSeason.teams)
                mongoSeason.teams = [];

            mongoTeams = mongoSeason.teams;
            const mongoTeamsLookup = _.keyBy(_.filter(mongoTeams, (i) => { return i.parserids && i.parserids[Parser.Name]; }), parserIdName);
            const mongoTeamIds = _.map(mongoTeams, 'id');

            mongoPlayers = _.flatMap(mongoTeams, 'players');
            const mongoPlayersLookup = _.keyBy(_.filter(mongoPlayers, (i) => { return i.parserids && i.parserids[Parser.Name]; }), parserIdName);

            const parserTeamIds = Object.keys(mongoTeamsLookup);
            const parserPlayerIds = Object.keys(mongoPlayersLookup);
            const parserTeamNumberIds = _.map(parserTeamIds, (n) => parseInt(n, 10));
            const parserPlayerNumberIds = _.map(parserPlayerIds, (n) => parseInt(n, 10));

            async.parallel([
                (innerCbk) => mongoDb.teams.find({ $or: [{ ['parserids.' + Parser.Name]: { $in: parserTeamIds } }, { ['parserids.' + Parser.Name]: { $in: parserTeamNumberIds } }] }, innerCbk),
                (innerCbk) => mongoDb.players.find({ $or: [{ ['parserids.' + Parser.Name]: { $in: parserPlayerIds } }, { ['parserids.' + Parser.Name]: { $in: parserPlayerNumberIds } }] }, innerCbk)
            ], cbk);
        },
        (asyncResults, cbk) => {

            const obsoleteTeams = asyncResults[0];
            const obsoleteTeamsLookup = _.groupBy(obsoleteTeams, parserIdName);
            const obsoletePlayers = asyncResults[1];
            const obsoletePlayersLookup = _.groupBy(obsoletePlayers, parserIdName);

            // Update Teams
            _.forEach(mongoTeams, (t) => {

                const relatedTeams = obsoleteTeamsLookup[t.parserids[Parser.Name]];
                let teamUpdated = false;

                if (relatedTeams && relatedTeams.length > 0) {
                    const relatedArabic = _.find(relatedTeams, (t) => { return !!t.name.ar; });
                    if (relatedArabic && !t.name.ar) {
                        t.name.ar = relatedArabic.name.ar;
                        teamUpdated = true;
                    }

                    const relatedKit = _.find(relatedTeams, (t) => { return !!t.logo; });
                    if (relatedKit && !t.logo) {
                        t.logo = relatedKit.logo;
                        teamUpdated = true;
                    }

                    if (teamUpdated)
                        teamsUpdated++;
                }
            });

            // Update Players
            _.forEach(mongoPlayers, (p) => {
                const relatedPlayers = obsoletePlayersLookup[p.parserids[Parser.Name]];

                if (relatedPlayers && relatedPlayers.length > 0) {

                    const relatedArabic = _.find(relatedPlayers, (p) => { return !!p.name.ar; });
                    let playerUpdated = false;

                    if (relatedArabic && !p.shortName.ar) {
                        p.shortName.ar = relatedArabic.name.ar;
                        playerUpdated = true;
                    }
                    if (relatedArabic && !p.name.ar)
                        p.name.ar = relatedArabic.name.ar;

                    if (playerUpdated)
                        playersUpdated++;
                }
            });

            // Save both
            async.parallel([
                (innerCbk) => {
                    async.eachLimit(mongoTeams, 100, (t, cb) => t.save(cb), innerCbk);
                },
                (innerCbk) => {
                    async.eachLimit(mongoPlayers, 100, (p, cb) => p.save(cb), innerCbk);
                }
            ], cbk);
        }
    ], (err, saveResults) => {

        if (err)
            return callback(err);

        console.log(`Updated ${teamsUpdated} teams and ${playersUpdated} players.`);
        return callback(null, saveResults);
    });
};


const playerArabicNames =
    [
        {
            "Group": "A",
            "CountryNameEn": "Uruguay",
            "CountryNameAr": "أوروجواي",
            "PlayerNameEn": "Maximiliano Gomez Gonzalez",
            "PlayerNameAr": "ماكسيميليانو غوميز غونزاليس"
        },
        {
            "Group": "A",
            "CountryNameEn": "Uruguay",
            "CountryNameAr": "أوروجواي",
            "PlayerNameEn": "Edinson Roberto Cavani Gomez",
            "PlayerNameAr": "إدينسون روبرتو كافاني جوميز"
        },
        {
            "Group": "A",
            "CountryNameEn": "Uruguay",
            "CountryNameAr": "أوروجواي",
            "PlayerNameEn": "Luis Alberto Suarez Diaz",
            "PlayerNameAr": "لويس البرتو سواريز دياز"
        },
        // ...
    ];
const playerArNamesLookup = _.keyBy(playerArabicNames, (p) => { return p.CountryNameEn + ':' + p.PlayerNameEn; });



module.exports = Parser;

