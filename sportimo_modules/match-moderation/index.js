/*
 *  Moderation Module
 *  Created by MasterBug on 28/11/15.
 *
 *  Module usage:
 *  This is a core module tha handles all things related to matches that are going to be live in the game.
 */

/*  Libraries   */

'use strict';


var path = require('path'),
    fs = require('fs'),
    _ = require('lodash'),
    bodyParser = require('body-parser'),
    log = require('winston'),
    mongoose = require('mongoose'),
    async = require('async');

var scheduler = require('node-schedule');
var moment = require('moment');

var MessagingTools = require('../messaging-tools');
const Gamecards = require('../gamecards');

//var memwatch = require('memwatch-next');
//memwatch.on('leak', function (info) {
//    console.log('Leak detected: ' + JSON.stringify(info));
//});
//memwatch.on('stats', function (stats) { console.log('Heap stats: ' + JSON.stringify(stats, null, '\t')); });

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

// Sportimo Moderation sub-Modules
var match_module = require('./lib/match-module.js');

var team = null,
    matches = null,
    tournaments = null,
    tournamentMatches = null,
    feedstatuses = null,
    users = null;

/**
 * Redis Pub/Sub Channels
 */
var RedisClientPub;
var RedisClientSub;


/** 
 * CORE MODERATION SERVICE
 * Handles outside interaction and hold the list
 * of active matches schedule.
 */

// Use for local instances in order to not interfere with live server
var shouldInitAutoFeed = true;

var ModerationModule = {
    // MatchTimers: {
    //     Timers: {},
    //     get: function (id){
    //         var timer = Timers[id];
    //         if(!timer) {
    //             Timers[id] = null;
    //             timer = Timers[id];
    //         }
    //         return timer;
    //     }
    // },
    ModeratedMatchLookup: {},
    ModeratedTmatchLookup: {},
    //ModeratedMatches: [],

    testing: false,
    mongoose: null,
    count: function () {
        return _.size(ModerationModule.ModeratedMatchLookup);
    },
    init: function (done) {
        initModule(done);
    },
    SetupMongoDB: function (mongooseConnection) {

        if (!shouldInitAutoFeed) {
            console.log("---------------------------------------------------------------------------------------------");
            console.log("---- Warning: This server instance does not initialize the feed auto moderation feature -----");
            console.log("---------------------------------------------------------------------------------------------");
        }

        /* Bootstrap models */
        this.mongoose = mongooseConnection;
        var modelsPath = path.join(__dirname, '../models');
        fs.readdirSync(modelsPath).forEach(function (file) {
            require(modelsPath + '/' + file);
        });

        team = this.mongoose.models.trn_team;
        matches = this.mongoose.models.matches;
        tournaments = this.mongoose.models.tournaments;
        tournamentMatches = this.mongoose.models.trn_matches;
        feedstatuses = this.mongoose.models.feedmatchstatuses;
        users = this.mongoose.models.users;
        // log.info("Connected to MongoDB");
    },
    SetupRedis: function (Pub, Sub, Channel) {

        // Initialize and connect to the Redis datastore
        RedisClientPub = Pub;
        RedisClientSub = Sub;

        setInterval(function () {

            RedisClientPub.publish("socketServers", JSON.stringify({
                server: "[Moderation] Active matches: " + ModerationModule.count()
            }));

        }, 30000);

        RedisClientPub.on("error", function (err) {
            console.log("{''Error'': ''" + err + "''}");

            console.error(err.stack);
        });

        RedisClientSub.on("error", function (err) {
            log.error("{''Error'': ''" + err + "''}");
        });

        var countConnections = 0;
        RedisClientSub.on("subscribe", function (channel, count) {
            countConnections++;
            // log.info("[Moderation] Subscribed to Sportimo Events PUB/SUB channel - connections: " + countConnections);
        });

        RedisClientSub.on("unsubscribe", function (channel, count) {
            // log.info("[Moderation] Unsubscribed from Sportimo Events PUB/SUB channel");
        });

        RedisClientSub.on("end", function () {
            log.error("{Connection ended}");
        });

        // RedisClientSub.subscribe(Channel);

        RedisClientSub.on("message", function (channel, message) {
            if (JSON.parse(message).server)
                return;

            // log.info("[Redis] : Event has come through the channel.");
            // log.info("[Redis] :" + message);
        });
    },
    SetupAPIRoutes: function (server) {
        // Load up the Rest-API routes
        server.use(bodyParser.json());
        server.use(bodyParser.urlencoded({
            extended: true
        }));
        server.use(function (req, res, next) {

            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
            res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
            next();

        });


        // log.info("Setting up [Manual] moderation routes");
        var apiPath = path.join(__dirname, 'api');
        fs.readdirSync(apiPath).forEach(function (file) {
            server.use('/', require(apiPath + '/' + file)(ModerationModule));
        });
    },
    create: function (mongoMatchID) {
        if (!mongoMatchID)
            return new Error("Match ID cannot be empty");

        var oldMatch = ModerationModule.GetTournamentMatch(mongoMatchID);
        // safeguard for duplicates
        if (oldMatch) {
            log.info("Match with the same ID already exists. Hooking.");

            return oldMatch;
        } else {
            return ModerationModule.LoadMatchFromDB(mongoMatchID);
        }
    },
    ResetMatch: function (matchid, cbk) {
        matches.findOne({
            _id: matchid
        }).exec(function (err, match) {
            match.stats = [];
            match.timeline = _.take(match.timeline);
            match.timeline[0].events = [];
            match.state = 0;
            match.time = 1;
            match.completed = false;
            match.away_score = 0;
            match.home_score = 0;
            match.save(function (err, result) {
                feedstatuses.find({ matchid: matchid }).remove().exec(function (err, opResult) {
                    cbk(opResult);
                });
            });
        });
    },
    ToggleMatchComplete: function (matchid, cbk) {
        matches.findOne({
            _id: matchid
        }).exec(function (err, match) {
            match.completed = !match.completed;
            match.save(function (err, result) {
                cbk(result);
                // feedstatuses.find({ matchid: matchid }).remove().exec(function (err, opResult) {
                //     cbk(opResult);
                // });
            });
        });
    },
    ReleaseMatch: function (matchid, cbk) {
        MessagingTools.sendPushToUsers({}, { en: "A new match has been scheduled. Go play your preset cards now!" }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
        if (cbk)
            cbk("OK");
    },
    LoadMatchFromDB: function (tmatchid, cbk) {

        tournamentMatches
        .findOne({
            _id: tmatchid
        })
        .populate({ path: 'match', populate: [{ path: 'home_team', select: 'name abbr logo color' }, { path: 'away_team', select: 'name abbr logo color' }, { path: 'season' }] })
        .exec(function (err, tournamentMatch) {
            if (err)
                return cbk ? cbk(err) : err;

            if (!tournamentMatch) {
                log.info(ModerationModule.count);
                const errMessage = "No match with this ID could be found in the database. There must be a match in the database already in order for it to be transfered to the Active matches";
                return cbk ? cbk(errMessage) : errMessage;
            }

            var foundMatch = ModerationModule.ModeratedTmatchLookup[tournamentMatch.id];

            if (foundMatch) {
                // Terminate the active services on the match
                ModerationModule.RemoveFromLookup(foundMatch.id, (err) => {

                    const hookedMatch = ModerationModule.InsertInLookup(tournamentMatch);
                    return cbk ? cbk(null, hookedMatch) : hookedMatch;
                });
            }
            else {
                const hookedMatch = ModerationModule.InsertInLookup(tournamentMatch);
                return cbk ? cbk(null, hookedMatch) : hookedMatch;
            }
        });
    },
    GetTournamentMatch: function (tmatchId, cbk) {
        var match = ModerationModule.ModeratedTmatchLookup[tmatchId];

        if (match) {
            return cbk ? cbk(null, match) : match;
        } else {
            ModerationModule.LoadMatchFromDB(tmatchId, cbk);
        }
    },
    GetMatch: function (matchId, cbk) {
        const tMatchIds = ModerationModule.ModeratedMatchLookup[matchId];

        if (!tMatchIds || tMatchIds.length === 0) {
            if (!cbk)
                return null;

            tournamentMatches.findOne({ match: matchId }, '_id', (err, tMatch) => {
                if (err)
                    return cbk(err);

                return ModerationModule.GetTournamentMatch(tMatch.id, cbk);
            });
        }
        else {
            if (!cbk)
                return ModerationModule.GetTournamentMatch(tMatchIds[0].id);

            return ModerationModule.GetTournamentMatch(tMatchIds[0].id, cbk);
        }
    },
    GetTournamentMatches: function (matchId, client, cbk) {
        const tMatches = ModerationModule.ModeratedMatchLookup[matchId];

        if (!tMatches || tMatches.length === 0) {
            return cbk ? cbk(null, tMatches) : tMatches;
        }
        else {
            const query = { match: matchId };
            if (client)
                query.client = client;

            tournamentMatches.find(query)
                .populate('client')
                .populate('tournament')
                .exec((err, tMatches) => {
                    if (err) {
                        return cbk ? cbk(err) : err;
                    }

                    return cbk ? cbk(null, tMatches) : tMatches;
                });
        }
    },
    // the tournamentMatch includes both tournament refs and the match in its match property, while the hookedMatch includes in its data property the match only
    InsertInLookup: function (tournamentMatch) {

        // Check tmatch existence in lookups, Validate tmatch
        const tmatchId = tournamentMatch.id;
        if (!tmatchId || ModerationModule.ModeratedTmatchLookup[tmatchId] || !tournamentMatch.match)
            return;

        const matchId = tournamentMatch.match.id;

        let hookedMatch = ModerationModule.ModeratedTmatchLookup[tmatchId];

        if (hookedMatch) {
            // terminate and remove existing match ...
        }


        if (!ModerationModule.ModeratedMatchLookup[matchId]) {
            hookedMatch = new match_module(tournamentMatch.match, shouldInitAutoFeed);
            ModerationModule.ModeratedMatchLookup[hookedMatch.id] = [tournamentMatch];
            log.info(`[Moderation] Found match with ID [${tmatchId}] ([${matchId}]). Creating match instance.`);

            // Initiate gamecards logic, if not already, and create card definitions for the match, if not already created
            Gamecards.init(tournamentMatch);
        }
        else {
            ModerationModule.ModeratedMatchLookup[matchId].push(tournamentMatch);
            hookedMatch = _.find(ModerationModule.ModeratedTmatchLookup, { 'id': matchId });
            log.info(`[Moderation] Found match with ID [${tmatchId}] ([${matchId}]). Hooking on it.`);
        }
        ModerationModule.ModeratedTmatchLookup[tmatchId] = hookedMatch;

        return hookedMatch;
    },
    RemoveFromLookup: function (tmatchId, cbk) {


        var foundMatch = ModerationModule.ModeratedTmatchLookup[tmatchId];

        if (foundMatch) {
            // Terminate the active services on the match
            foundMatch.Terminate(() => {
                // Clear all timers that might be active
                foundMatch.Timers.clear();
                // remove match in case it already exists
                const matchId = foundMatch.id;
                delete ModerationModule.ModeratedTmatchLookup[tmatchId];

                const tournamentMatches = ModerationModule.ModeratedMatchLookup[matchId];
                if (tournamentMatches.length === 1)
                    delete ModerationModule.ModeratedMatchLookup[matchId];
                else {
                    _.remove(ModerationModule.ModeratedMatchLookup[matchId], { 'id': tmatchId });
                }

                return cbk ? cbk(null, foundMatch) : foundMatch;
            });
        }
        else
            return cbk ? cbk(null) : null;

    }
    //    InjectEvent: function (evnt, res) {
    //        ModerationModule.GetTournamentMatch(evnt.id).AddEvent(evnt.data, res);
    //    },
};

ModerationModule.GetSchedule = function (matchid, cbk) {
    tournamentMatches
        .findOne({
            _id: matchid
        })
        .populate({ path: 'match', populate: [{ path: 'home_team' }, { path: 'away_team' }, { path: 'competition' }] })
        .exec(function (err, match) {
            if (err) {
                log.error(err);
                return cbk(err);
            }

            cbk(null, match);
        });
};

/**
 * Adds a new match to the schedule.
 */

var objectAssign = require('object-assign');

ModerationModule.AddScheduleMatch = function (match, tournamentId, cbk) {
    var matchTemplate = require('./mocks/empty-match');

    matchTemplate = objectAssign(matchTemplate, match);

    tournaments.findOne({ _id: tournamentId }).populate('client').exec((err, tournament) => {
        if (err) {
            if (cbk)
                return cbk(err);
            return err.message;
        }

        if (!tournament) {
            const errMsg = `Add tournament match: Not found tournament id ${tournamentId}`;
            if (cbk)
                return cbk(new Error(errMsg));
            return errMsg;
        }


        var newMatch = new matches(matchTemplate);
        newMatch.client = tournament.client;
        newMatch.tournament = tournament;
        var tournamentMatch = new tournamentMatches();
        tournamentMatch.match = newMatch;
        tournamentMatch.client = tournament.client;
        tournamentMatch.tournament = tournament;

        async.parallel([
            (icbk) => tournamentMatch.save(icbk),
            (icbk) => newMatch.save(icbk)
        ], function (er, saveResults) {

            if (er) {
                if (cbk)
                    return cbk(er);
                return er.message;
            }

            ModerationModule.LoadMatchFromDB(saveResults[0]._id, function (err, match) {
                if (err)
                    return cbk(err);

                cbk(null, match);
            });

        });
    });
};



ModerationModule.ActivateMatch = function (id, state, cbk) {
    // Delete from database
    var match = ModerationModule.GetTournamentMatch(id);
    match.data.disabled = state;
    matches.findOneAndUpdate({ _id: id }, { $set: { disabled: state } }, cbk);
};

/**
 * Adds a new match to the schedule.
 */
ModerationModule.UpdateScheduleMatch = function (match, cbk) {
    matches.findOneAndUpdate({ _id: match._id }, match, { upsert: true }, cbk);
};

/**
 * Adds a new match to the schedule.
 */
ModerationModule.RemoveScheduleMatch = function (id, cbk) {
    // Delete from database
    const tmatch = ModerationModule.GetTournamentMatch(id);
    
    if (tmatch) {
        tmatch.data.remove();
        // Remove from list in memory
        ModerationModule.RemoveFromLookup(id);
    }
    cbk();
};

/**
 * Matches cronjobs update info
 */
ModerationModule.updateMatchcronJobsInfo = function () {
    var itsNow = moment.utc();

    async.waterfall([
        (cbk) => {
            matches
                .find({
                    state: { $gt: -1 },
                    completed: { $ne: true },
                    $or: [{ 'moderation.0.type': 'rss-feed', 'moderation.0.active': true }, { 'moderation.1.type': 'rss-feed', 'moderation.1.active': true }]
                })
                .select('_id')
                .exec(cbk);
        },
        (matches, cbk) => {
            const matchObjectIds = _.map(matches, '_id');
            tournamentMatches
                .find({ match: { $in: matchObjectIds } })
                .populate({ path: 'match', populate: [{ path: 'home_team', select: '-players' }, { path: 'away_team', select: '-players' }, { path: 'season' }] })
                .exec(cbk);
        }
    ], function (err, trnMatches) {
        async.each(trnMatches, function (trnMatch, cbk) {
            const match = trnMatch.match;
            const jobs = _.filter(scheduler.scheduledJobs, { name: match.id });
            const matchInMemory = ModerationModule.GetTournamentMatch(trnMatch.id);

            jobs.forEach(job => {
                if (job && job.nextInvocation()) {
                    var duration = moment.duration(moment(job.nextInvocation()).diff(itsNow));
                    var durationAsHours = duration.asMinutes();
                    if (match.moderation[0].active) {
                        match.moderation[0].start = "in " + durationAsHours.toFixed(2) + " minutes";
                        match.moderation[0].scheduled = true;
                    }
                    if (match.moderation[1] && match.moderation[1].active) {
                        match.moderation[1].start = "in " + durationAsHours.toFixed(2) + " minutes";
                        match.moderation[1].scheduled = true;
                    }
                    log.info(`Match tick for ${matchInMemory ? matchInMemory.name + ' (' + match.id + ')' : match.id} will start in ${durationAsHours.toFixed(2)} minutes`);
                } else {
                    // log.info("Match has not been picked up from scheduler");
                    match.moderation[0].start = "";
                    match.moderation[0].scheduled = false;
                    if (match.moderation[1]) {
                        match.moderation[1].start = "";
                        match.moderation[1].scheduled = false;
                    }
                }
            });
            match.save(function (er, re) {
                if (matchInMemory) {
                    matchInMemory.data.moderation[0].start = re.moderation[0].start;
                    matchInMemory.data.moderation[0].scheduled = re.moderation[0].scheduled;
                    // console.log("changed " +matchInMemory.data.moderation[0].start);       
                }
                return cbk(null);
            });
        }, (asyncErr) => {
            if (asyncErr)
                log.error(`[ModerationModule] Error while updating match schedules in updateMatchcronJobsInfo: ${asyncErr.stack}`);
        });
    });


}


ModerationModule.matchStartWatcher = function () {
    try {
        var now = moment.utc();
        var fifteenMinsAfterNow = now.clone().add(16, 'm').toDate();

        const PushNotifications = require('../messaging-tools/PushNotifications');

        matches
            .find({
                state: { $gt: -1 },
                completed: { $ne: true },
                disabled: { $ne: true },
                start: { $lte: fifteenMinsAfterNow, $gt: now.toDate() }
            }, '_id start home_team away_team')
            .populate('_id home_team away_team', 'name')
            .exec(function (err, matches) {
                if (err) {
                    log.error(err);
                    return;
                }

                var matchesStartingInNext15 = _.filter(matches, function (m) {
                    var mStart = moment.utc(m.start);
                    return now.isAfter(mStart.clone().subtract(16, 'm')) && now.isBefore(mStart.clone().subtract(15, 'm')) ? true : false;
                });
                if (matchesStartingInNext15.length === 0)
                    return;

                return PushNotifications.Reactivation(matchesStartingInNext15, () => { });
            });
    }
    catch (err) {
        log.error(err);
    }
};

function initModule(callback) {

    /* We load all scheduled/active matches from DB on server initialization */

    async.waterfall([
        (cbk) => {
            matches
                .find({
                    state: { $gt: -1 },
                    completed: { $ne: true }
                })
                .select('_id')
                .exec(cbk);
        },
        (matches, cbk) => {
            const matchObjectIds = _.map(matches, '_id');
            tournamentMatches
                .find({ match: { $in: matchObjectIds } })
                .populate({ path: 'match', populate: [{ path: 'home_team', select: '-players' }, { path: 'away_team', select: '-players' }, { path: 'season' }] })
                .exec(cbk);
        }
    ], function (err, trnMatches) {
        if (err)
            return callback ? callback(err) : log.error(err);

        if (trnMatches) {

            // Adding wait index of 1sec in order to bypass the limitation of STATS that prevents overload of calls
            var waitIndex = 0;

            /*For each match found we hook platform specific functionality and add it to the main list*/
            _.forEach(trnMatches, function (tournamentMatch) {
                setTimeout(function () {

                    const hookedMatch = ModerationModule.InsertInLookup(tournamentMatch);
                }, 2000 * waitIndex);
                waitIndex++;
            });
        } else {
            log.warn("No scheduled matches could be found in the database.");
        }

        // Callback we are done for whomever needs it
        if (callback !== null)
            callback();
    });

    // Here we will create a job in interval where we check for feed matches, if theit timers are set and update accordingly the time until initiation
    ModerationModule.cronJobsUpdateInterval = setInterval(ModerationModule.updateMatchcronJobsInfo, 60000);

    // Here we create a job executed in 5min intervals, that will send the notifications: 
    // The match is about to start 15 mins before the start, and 2 reactivation motivations 5 mins before the start
    ModerationModule.matchStartNotificationInterval = setInterval(ModerationModule.matchStartWatcher, 60 * 1000);
}

// A Mock Match object in case we need it for testing
var mockMatch = require('./mocks/mock-match');


module.exports = ModerationModule;
