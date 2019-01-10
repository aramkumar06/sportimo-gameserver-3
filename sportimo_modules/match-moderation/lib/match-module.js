/**
 * Match_Module is the main Class regarding matches in the Sportimo Platform.
 * It handles all match related stuff. From match infos to actual
 * database hooks and syncing. 
 * All moderation services will have to register on this object in order to 
 * function and will call methods on this object in order to moderate it.
 */


'use strict';

const Sports = require('./sports-settings');
const StatsHelper = require('./StatsHelper');

const moment = require('moment'),
    log = require('winston'),
    _ = require('lodash'),
    mongoConnection = require('../config/db.js'),
    matchEvents = require('../../models/matchEvents'),
    matches = require('../../models/match'),
    useractivities = require('../../models/trn_user_activity'),
    serversettings = require('../../models/gameServerSettings'),
    userGamecards = require('../../models/trn_user_card'),
    scores = require('../../models/trn_score'),
    users = require('../../models/user'),
    //mongoose = require('mongoose'),
    async = require('async'),
    Achievements = require('../../bedbugAchievements');

//var MessagingTools = require.main.require('./sportimo_modules/messaging-tools');
const MessagingTools = require('../../messaging-tools');
const PushNotifications = require('../../messaging-tools/PushNotifications');
const Gamecards = require('../../gamecards');

const path = require('path'),
    fs = require('fs');

/*Bootstrap service*/
const serviceTypes = {};




const servicesPath = path.join(__dirname, '../services');
fs.readdirSync(servicesPath).forEach(function (file) {
    serviceTypes[path.basename(file, ".js")] = require(servicesPath + '/' + file);
});


var matchModule = function (match, shouldInitAutoFeed) {

    const HookedMatch = {}; // = match;

    HookedMatch.Timers = {
        Timeout: null,
        matchTimer: null,
        clear: function () {
            clearTimeout(HookedMatch.Timers.Timeout);
            clearInterval(HookedMatch.Timers.matchTimer);
        }
    };

    // Boolean that informs the service if this instance should initialize feed services. If ommitted, default is true
    HookedMatch.shouldInitAutoFeed = shouldInitAutoFeed || true;

    // Time spacing bewtween events 
    HookedMatch.queueDelay = 2000;
    HookedMatch.queueEventsSpace = 1000;
    HookedMatch.queueSegmentsSpace = 1000;

    //HookedMatch.moderationServices = [];
    HookedMatch.services = [];

    // The last time registered from event. Used to ignore add event calls that that are after the fact.
    HookedMatch.lastEventTime = 0;

    // Set ID
    HookedMatch.id = match._id.toString() || 'mockid';

    // Match data
    HookedMatch.data = match;

    // Match name used for logging purposes
    HookedMatch.name = match.name;
    if (!match.name) {
        if (match.home_team && match.home_team.name && match.home_team.name.en)
            HookedMatch.name = match.home_team.name.en;
        else
            HookedMatch.name = 'home team';
        HookedMatch.name += ' - ';
        if (match.away_team && match.away_team.name && match.away_team.name.en)
            HookedMatch.name += match.away_team.name.en;
        else
            HookedMatch.name += 'away team';
    }

    // Validations
    if (HookedMatch.data.timeline.length === 0) {
        HookedMatch.data.state = 0;
        HookedMatch.data.timeline.push({
            "events": []
        });
        // HookedMatch.data.markModified('timeline');
        HookedMatch.data.save();
    }

    // Setting the game_type ('soccer','basket') and its settings (game segments, duration, etc)
    HookedMatch.sport = Sports[match.sport];

    var queueIndex = 0;
    var eventReceiptFromCreationTimeoutSeconds = 10;
    HookedMatch.queue = async.queue(function (matchEvent, callback) {

        // --> This creates wait time
        setTimeout(function () {
            const eventName = matchEvent && matchEvent.data && matchEvent.data.type ? matchEvent.data.type : 'Unknown';
            queueIndex++;
            const now = new Date();

            if (matchEvent && matchEvent.data && matchEvent.data.type && matchEvent.data.type == 'AdvanceSegment') {
                // log.info('[Match module] %s: %s', queueIndex, eventName);
                return HookedMatch.AdvanceSegment(matchEvent, function () {
                    // --> This creates space between
                    setTimeout(function () {
                        return callback();
                    }, HookedMatch.queueSegmentsSpace);
                });
            }
            else
                if (matchEvent && matchEvent.data && matchEvent.data.type && matchEvent.data.type == 'TerminateMatch') {
                    // log.info('[Match module] %s: %s', queueIndex, eventName);
                    return HookedMatch.TerminateMatch(callback);
                }
                else {
                    if (matchEvent && matchEvent.type && matchEvent.type == 'Update') {
                        log.info('[Match module %s] %s at %s\' UPDATE %s', HookedMatch.name, queueIndex, matchEvent.data.time, eventName);
                        return HookedMatch.UpdateEvent(matchEvent, function () {
                            setTimeout(function () {
                                log.info(`Dequeuing update event for ${HookedMatch.name} at ${matchEvent.data.time}' ${matchEvent.data.type}` );
                                return callback();
                            }, matchEvent.data.timeline_event && matchEvent.data.timeline_event == true ? HookedMatch.queueEventsSpace : 100);
                        });
                    }
                    else if (matchEvent && matchEvent.type && matchEvent.type == 'Delete') {
                        log.info('[Match module %s] %s at %s\' DELETE %s', HookedMatch.name, queueIndex, matchEvent.data.time, eventName);
                        return HookedMatch.RemoveEvent(matchEvent, function () {
                            setTimeout(function () {
                                log.info(`Dequeuing remove event for ${HookedMatch.name} at ${matchEvent.data.time}' ${matchEvent.data.type}` );
                                return callback();
                            }, matchEvent.data.timeline_event && matchEvent.data.timeline_event == true ? HookedMatch.queueEventsSpace : 100);
                        });
                    }
                    else if (matchEvent && matchEvent.type && matchEvent.type == 'Add') {
                        var creationTime = matchEvent.data.created || now;
                        var parserDiffTime = moment.utc().diff(moment.utc(creationTime), 's');

                        log.info('[Match module %s] #%s at %s\' ADD %s [%s sec from its creation]', HookedMatch.name, queueIndex, matchEvent.data.time, eventName, parserDiffTime);
                        
                        if (parserDiffTime > eventReceiptFromCreationTimeoutSeconds)
                            log.warn(`[Match module ${HookedMatch.name}] ${eventName} is received DELAYED more than ${eventReceiptFromCreationTimeoutSeconds} seconds from its creation !!!`);

                        var isAfterLast = HookedMatch.lastEventTime <= matchEvent.data.time;
                        if (isAfterLast)
                            HookedMatch.lastEventTime = matchEvent.data.time;

                        return HookedMatch.AddEvent(matchEvent, isAfterLast, function () {
                            setTimeout(function () {
                                log.info(`Dequeuing add event for ${HookedMatch.name} at ${matchEvent.data.time}' ${matchEvent.data.type}` );
                                return callback();
                            }, matchEvent.data.timeline_event && matchEvent.data.timeline_event == true ? HookedMatch.queueEventsSpace : 100);
                        });
                    }
                    else if (matchEvent && matchEvent.type && matchEvent.type == 'Scoreline') {
                        return HookedMatch.CorrectScoreLine(matchEvent.homeScore, matchEvent.awayScore, callback);
                    }
                    else {
                        return callback();
                    }
                }
        }, HookedMatch.queueDelay);




        // log.info('[Match module] queued stat %s for match id %s', eventName, HookedMatch.id);
    }, 1);


    /*  -------------
     **   Methods
     **  -------------
     */


    /*  SetModerationService
        Here we set the moderation service for the game. "service" is the object of the corresponding
        service. 
        e.g. a feed service
       {
            "type": "rss-feed",
            "eventid": "15253",
            "feedurl": "http://feed-somewhere.com?event-id=",
            "interval": 500 
        } 
    */
    HookedMatch.AddModerationService = function (service, callback) {
        // Check if service of same type already exists 
        if (_.find(this.services, {
            type: service.type
        })) {
            log.info("Service already active");
            return callback(new Error("Service type already active. Please remove the old one first."));
        } else {

            HookedMatch.data.moderation.push(service);
            HookedMatch.data.save();

            HookedMatch.StartService(service, function (error, newService) {
                if (error)
                    return callback(error);

                callback(null, getServiceDTO(newService));
            });

        }
    };

    HookedMatch.StartService = function (service, callback) {
        const that = this;

        if (that.shouldInitAutoFeed == false) return callback(null);

        var foundService = _.find(that.services, { type: service.type });
        if (foundService) {
            foundService.Terminate(function () {
                that.services = _.remove(that.services, function (aservice) {
                    return (aservice.type === service.type);
                });
            });
        }

        var serviceType = serviceTypes[service.type];
        if (!serviceType)
            return callback(null);

        var newService = new serviceType(service);
        if (!newService)
            return callback(null);
        //_.merge(newService, service);

        // init the service by passing this.data as a context reference for internal communication (sending events)

        //var clonedMatch = {
        //    _id: that.data._id,
        //    id: that.data.id,
        //    home_team: that.data.home_team,
        //    away_team: that.data.away_team,
        //    home_score: that.data.home_score,
        //    away_score: that.data.away_score,
        //    completed: that.data.completed,
        //    start: that.data.start,
        //    parserids: that.data.parserids,
        //    competition: that.data.competition,
        //    state: that.data.state
        //};
        newService.init(that.data, function (error, initService) {
            if (error) {
                return PushNotifications.MatchModuleStartupFailure(HookedMatch.data, error, () => {

                    // Update match in memory of being disabled
                    HookedMatch.data.disabled = true;

                    //Terminate service
                    if (newService) {
                        try {
                            newService.Terminate(() => {
                                return callback(error);
                            });
                        }
                        catch (err) {
                            return callback(error);
                        }
                    }
                    else
                        return callback(error);
                });
            }

            // Register this match module to the events emitted by the new service, but first filter only those relative to its match id (I have to re-evaluate this filter, might be redundant). 
            initService.emitter.on('matchEvent', function (matchEvent) {
                if (matchEvent && matchEvent.data.match_id == HookedMatch.data.id)
                    if (HookedMatch.queue)
                        HookedMatch.queue.push(matchEvent);
                    else
                        HookedMatch.AddEvent(matchEvent);
            });

            initService.emitter.on('nextMatchSegment', function (state) {
                //if (matchEventId && matchEventId == HookedMatch.data.id)
                var StateEvent = { data: {} };
                StateEvent.data.type = 'AdvanceSegment';
                StateEvent.data.time = HookedMatch.data.time;
                if (state)
                    StateEvent.data.state = state;

                if (HookedMatch.queue) {
                    console.log(`[Match module ${HookedMatch.name}] --------- Advance Segment Queue: ${HookedMatch.queue.length()}`);
                    HookedMatch.queue.push(StateEvent);
                }
                else
                    HookedMatch.AdvanceSegment(StateEvent);
            });

            initService.emitter.on('endOfMatch', function () {
                // if (matchEvent && matchEvent.id == HookedMatch.data.id)
                //     console.log(HookedMatch.queue.length());

                var StateEvent = { data: {} };
                StateEvent.data.type = 'TerminateMatch';
                StateEvent.data.time = HookedMatch.data.time;

                if (HookedMatch.queue) {
                    console.log(`[Match module ${HookedMatch.name}] --------- End Segment Queue: ${HookedMatch.queue.length()}`);
                    HookedMatch.queue.push(StateEvent);
                }
                else
                    HookedMatch.TerminateMatch();
            });


            initService.emitter.on('emitStats', function (matchid, stats) {
                log.info(`[Match module ${HookedMatch.name}] Emmiter requested to send Stats_changed`);
                if (matchid == HookedMatch.data.id)
                    MessagingTools.sendSocketMessage({
                        sockets: true,
                        payload: {
                            type: "Stats_changed",
                            room: HookedMatch.data.id,
                            data: stats
                        }
                    });
            });

            that.services.push(initService);
            callback(null, initService);
        });
    };



    HookedMatch.updateFeedMatchStats = function (league, matchid, callback) {

        // Check if service of same type already exists 
        var serviceTypeFound = _.find(this.services, {
            type: "rss-feed"
        });
        if (!serviceTypeFound)
            return callback(new Error("Service type does not exist. Please add it first."));

        serviceTypeFound.updateMatchStats(league, matchid, callback);
    };


    HookedMatch.PauseService = function (service, callback) {

        // Check if service of same type already exists 
        const serviceTypeFound = _.find(this.services, {
            type: service.type
        });
        if (!serviceTypeFound)
            return callback(new Error("Service type does not exist. Please add it first."));

        serviceTypeFound.pause();
        // Update status in MongoDB
        var serviceData = _.find(HookedMatch.data.moderation, { parsername: service.parsername });
        if (serviceData) {
            serviceData.active = false;

            matches.findOneAndUpdate({ _id: HookedMatch.data._id }, { moderation: HookedMatch.data.moderation })
                .exec(function (mongoErr, result) {
                if (mongoErr) {
                    log.error(mongoErr.stack);
                    return callback(mongoErr);
                }

                return callback(null, getServiceDTO(serviceTypeFound));
            });
        } else
            return callback(null, getServiceDTO(serviceTypeFound));
    };



    HookedMatch.ResumeService = function (service, callback) {

        // Check if service of same type already exists 
        const serviceTypeFound = _.find(this.services, {
            type: service.type
        });
        if (!serviceTypeFound)
            return callback(new Error("Service type does not exist. Please add it first."));

         serviceTypeFound.resume();
       // Update status in MongoDB
         var serviceData = _.find(HookedMatch.data.moderation, { parsername: service.parsername });
        if (serviceData) {
            serviceData.active = true;
            matches.findOneAndUpdate({ _id: HookedMatch.data._id }, { moderation: HookedMatch.data.moderation })
            .exec(function (mongoErr, result) {
                if (mongoErr) {
                    log.error(mongoErr.stack);
                    return callback(mongoErr);
                }

                return callback(null, getServiceDTO(serviceTypeFound));
            });
        } else
            return callback(null, getServiceDTO(serviceTypeFound));
    };


    HookedMatch.GetServices = function () {

        return _.map(HookedMatch.services, function (service) {
            return getServiceDTO(service);
        });
    };


    // Return a strip down version of a service, only the information needed in API endpoints to know
    var getServiceDTO = function (service) {
        return {
            type: service.type,
            parserid: service.parserid,
            interval: service.interval,
            active: service.isActive()

        };
    };

    // Set services for the first time
    //HookedMatch.moderationServices = match.moderation;
    match.moderation.forEach(function (service) {
        HookedMatch.StartService(service, function (error) {
            if (error) {
                log.error(`[Match module ${HookedMatch.name}] Error initializing the service ${service.type ? service.type : "Unknown"}: ${error.message}`);
            }
        });
    });


    HookedMatch.removeSegment = function (data, cbk) {

        this.data.timeline.splice(data.index, 1);

        HookedMatch.data.state--;

        // this.data.markModified('timeline');
        this.data.save(function (err, done) {
            if (err)
                log.error(err.message);

            startMatchTimer();
        });




        return cbk(null, HookedMatch);
    };

    HookedMatch.correctScoreLine = function (homeScore, awayScore, cbk) {
        if (this.data.home_score != homeScore || this.data.away_score != awayScore) {
            this.data.home_score = homeScore;
            this.data.away_score = awayScore;

            return this.data.save(cbk);
        }
        else
            return cbk(null);
    };

    HookedMatch.updateTimes = function (data, cbk) {
        // console.log(data);
        // make checks
        if (this.data.timeline[data.index].start != data.data.start) {
            this.data.timeline[data.index].start = data.data.start;

            if (this.data.timeline[data.index - 1])
                this.data.timeline[data.index - 1].end = data.data.start;

            // this.data.markModified('timeline');
            this.data.save(function (err, done) {
                if (err)
                    log.error(err.message);
            });
        }

        if (this.data.timeline[data.index].end != data.data.end) {
            this.data.timeline[data.index].end = data.data.end;

            if (this.data.timeline[data.index + 1])
                this.data.timeline[data.index + 1].start = data.data.end;

            // this.data.markModified('timeline');
            this.data.save(function (err, done) {
                if (err)
                    log.error(err.message);
            });
        }

        return cbk(null, HookedMatch);
    };

    /*  SocketMessage
        Send a socket message to clients registered in match.
    */
    HookedMatch.SocketMessage = function (event) {
        MessagingTools.sendSocketMessage({
            sockets: true,
            payload: event
        });

        return "Done";
    };



    /************************************************************************************************* */
    /*  AdvanceSegment
        The advance state method is called when we want to advance to the next segment of the game.
        Depending on setting, here will determine if a timer should begin counting and hold the
        game's time.
    */
    HookedMatch.AdvanceSegment = function (event, callback) {

        //    var scheduleDate = moment.utc(HookedMatch.data.start);
        //     var itsNow = moment.utc();
        // console.log((moment.utc(scheduleDate) < itsNow && isActive));
        // console.log((itsNow >= formattedScheduleDate && itsNow < moment.utc(scheduleDate)));
        // If the match has started already, then circumvent startTime, unless the match has ended (is not live anymore)

        var q = matches.findById(HookedMatch.id);

        q.populate('home_team away_team');

        q.exec(function (err, thisMatch) {
            if (err) {
                if (callback)
                    return callback(err);
                else
                    return log.error(err);
            }
            if (!thisMatch) {
                const errMsg = `Invalid Hooked match in segment advance`;
                if (callback)
                    return callback(new Error(errMsg));
                else
                    return log.error(errMsg);
            }
            if (thisMatch.state === HookedMatch.sport.segments.length - 1) {
                const errMsg = `Cannot advance past the last soccer match segment`;
                log.warn(errMsg);
                if (callback)
                    return callback(null);
                else
                    return;
            }
            if (thisMatch.completed) {
                const errMsg = `The match has been terminated. No other events accepted`;
                log.warn(errMsg);
                if (callback)
                    return callback(null);
                else
                    return;
            }

            if (event.data && event.data.state && event.data.state <= thisMatch.state) {
                log.info(`[Match module ${HookedMatch.name}]: Ignoring segment advance to state ${thisMatch.state} because the match is already at this state.`);
                if (callback)
                    return callback(null);
                else
                    return;
            }

            // Resetting lastEventTime, to be able to accept events right after the start of the Segment
            HookedMatch.lastEventTime = 0;

            PushNotifications.SegmentAdvance(thisMatch, () => { });

            // Register the time that the previous segment ended
            thisMatch.timeline[thisMatch.state].end = moment().utc().format();

            // This previous segment is timed. We should send a segment end timeline event first.
            if (HookedMatch.sport.segments[thisMatch.state].timed) {
                log.info(HookedMatch.sport.segments[thisMatch.state].name.en + " Ends");

                var evtObject = {
                    match_id: HookedMatch.id,
                    type: HookedMatch.sport.segments[thisMatch.state].name.en + " Ends",
                    time: thisMatch.time,
                    state: thisMatch.state,
                    timeline_event: true

                };

                if (evtObject.type)
                    evtObject.type = cleanSafe(evtObject.type);


                evtObject.created = moment().utc().format();

                thisMatch.timeline[thisMatch.state].events.push(evtObject);

                // Inform Clients for the new event to draw
                MessagingTools.sendSocketMessage({
                    sockets: true,
                    payload: {
                        type: "Event_added",
                        room: HookedMatch.id.toString(),
                        data: evtObject
                    }
                });
            }


            // Advance the state of the match
            thisMatch.state++;

            // Register the time that the current segment starts
            var newSegment = {
                start: moment().utc().format(),
                sport_start_time: HookedMatch.sport.segments[thisMatch.state].initialTime ? HookedMatch.sport.segments[thisMatch.state].initialTime : 0,
                timed: HookedMatch.sport.segments[thisMatch.state].timed,
                text: HookedMatch.sport.segments[thisMatch.state].name,
                break_time: 0,
                events: []
            };

            thisMatch.timeline.push(newSegment);
            thisMatch.markModified('timeline');

            setMatchStatForTo(HookedMatch.id, thisMatch.stats, 'Segment', thisMatch.state);
            thisMatch.markModified('stats');

            Gamecards.GamecardsAppearanceHandle({
                matchid: match.id,
                time: null,
                playerid: null,
                teamid: null,
                stat: 'Segment',
                statTotal: thisMatch.state,
                incr: 1
            }, thisMatch);

            var updateObject = {
                state: thisMatch.state,
                home_score: thisMatch.home_score,
                stats: thisMatch.stats,
                timeline: thisMatch.timeline,
                away_score: thisMatch.away_score
            };

            matches.findOneAndUpdate({ _id: thisMatch._id }, updateObject, { new: true }, function (err, result) {
                // thisMatch.save(function (err, done) {

                if (err)
                    log.error(err);
                else
                    log.info(`[Match module ${HookedMatch.name}]: Match Updated`);

                if (result)
                    HookedMatch.data = _.merge(HookedMatch.data, updateObject);

                // // Update the data in memory. Only temporary for backwards combatibility.
                // HookedMatch.data = _.merge(HookedMatch.data, updateObject);

                //     return HookedMatch;
                // });

                // Commit the update to the database
                // thisMatch.save(function (err, result) {
                //     if (err)
                //         log.error(err);
                //     else
                //         log.info("Match Updated");

                // Send new segment change to clients
                // Inform Clients for the new event to draw
                MessagingTools.sendSocketMessage({
                    sockets: true,
                    payload: {
                        type: "Advance_Segment",
                        room: HookedMatch.id,
                        data: {
                            segment: newSegment,
                            match_id: HookedMatch.id,
                            info: "The porperty segment should be pushed to the timeline",
                            sportSegmenInfo: HookedMatch.sport.segments[thisMatch.state],
                            state: thisMatch.state,
                            timeline_event: false
                        }
                    }
                });
                log.info(`[Match module ${HookedMatch.name}]: We are sending Stats_changed here on Advance Segment`);
                // Inform the system about the segment change
                MessagingTools.sendSocketMessage({
                    sockets: true,
                    payload: {
                        type: "Stats_changed",
                        room: thisMatch._id,
                        data: thisMatch.stats
                    }
                });



                // Update gamecards module of the segment change. Create an event out of this
                // const segmentEvent = {
                //     data: {
                //         id: null,
                //         sender: null,
                //         match_id: HookedMatch.id,
                //         team: null,
                //         players: null,
                //         stats: { Segment: 1 },
                //         state: thisMatch.state,
                //         timeline_event: false
                //     }
                // };

                // Gamecards.ResolveEvent(segmentEvent);
                Gamecards.ResolveSegment(HookedMatch.id, thisMatch.state);

                // Check if we should initiate a match timer to change the main TIME property.
                startMatchTimer();



                // Everythings is save and updated so it is safe to send a new event now if this new segment is timed.
                if (HookedMatch.sport.segments[thisMatch.state].timed) {
                    log.info(HookedMatch.sport.segments[thisMatch.state].name.en + " Starts");
                    var startEvent = {
                        type: "Add",
                        match_id: HookedMatch.id,
                        data: {
                            match_id: HookedMatch.id,
                            type: HookedMatch.sport.segments[thisMatch.state].name.en + " Starts",
                            time: HookedMatch.sport.segments[thisMatch.state].initialTime,
                            state: HookedMatch.data.state,
                            timeline_event: true
                        }
                    };
                    HookedMatch.AddEvent(startEvent, true);
                }

                if (callback)
                    callback();

                return HookedMatch;
            });
        });

        /**************************************************************************** */

    };


    /************************************************************************************************************
     * Match Timer
     * The match timer is initialized when the server picks up the match
     * and is responsible for updating the time in memory and in mongo
     * if the segment state is set to timmed 
     */
    startMatchTimer();

    function startMatchTimer() {

        HookedMatch.Timers.clear();

        var segment;
        var segmentStart;
        var secondsToMinuteTick;

        matches.findById(HookedMatch.id, function (err, thisMatch) {
            if (err || !thisMatch) {
                return console.log(err);
            }

            if (!HookedMatch.sport.segments[thisMatch.state].timed) { return; }

            log.info(`[Match module ${HookedMatch.name}]: Starting Match Timer`);

            segment = thisMatch.timeline[thisMatch.state];
            segmentStart = segment.start;
            secondsToMinuteTick = 60 - moment.duration(moment().diff(moment(segment.start))).seconds();

            Gamecards.GamecardsAppearanceHandle({
                matchid: match.id,
                time: null,
                playerid: null,
                teamid: null,
                stat: 'Minute',
                statTotal: thisMatch.time,
                incr: 1
            }, thisMatch);

            // Start the match timer update in secondsToMinuteTick;
            HookedMatch.Timers.Timeout = setTimeout(function () {
                updateTimeForMatchId(HookedMatch.id);
                clearInterval(HookedMatch.Timers.matchTimer);
                // and start an interval that will update the match time every minute from now on
                HookedMatch.Timers.matchTimer = setInterval(function () {
                    updateTimeForMatchId(HookedMatch.id);
                }, 60000);
            }, secondsToMinuteTick * 1000);
        });

    }

    function setMatchStatForTo(matchId, stats, statKey, statValue) {
        var statIndex = _.findIndex(stats, {
            id: matchId
        });
        if (statIndex > -1) {
            stats[statIndex][statKey] = statValue;
        }
        else {
            var newGroup = { id: matchId };
            newGroup[statKey] = statValue;
            stats.push(newGroup);
        }
    }

    function updateTimeForMatchId(id) {
        matches.findById(id, function (err, thisMatch) {
            if (err || !thisMatch) {
                return console.log(err);
            }

            if (!HookedMatch.sport.segments[thisMatch.state].timed) { return console.log("No need to be timed."); }

            if (thisMatch.completed) {
                clearInterval(HookedMatch.Timers.matchTimer);
                return console.log(`[Match module ${HookedMatch.name}]: Match completed. Closing down match timer.`);
            }


            thisMatch.time = calculatedMatchTimeFor(thisMatch);

            setMatchStatForTo(id, thisMatch.stats, 'Minute', thisMatch.time);
            thisMatch.markModified('stats');

            Gamecards.GamecardsAppearanceHandle({
                matchid: match.id,
                time: null,
                playerid: null,
                teamid: null,
                stat: 'Minute',
                statTotal: thisMatch.time,
                incr: 1
            }, thisMatch);

            log.info(`[Match module ${HookedMatch.name}]: We are sending Stats_changed here on Match Time`);
            // Inform the system about the stat changes
            MessagingTools.sendSocketMessage({
                sockets: true,
                payload: {
                    type: "Stats_changed",
                    room: thisMatch._id,
                    data: thisMatch.stats
                }
            });

            matches.findByIdAndUpdate(id, { $set: { "stats": thisMatch.stats, "time": thisMatch.time } }, function (err, result) {
                log.info(`[Match module ${HookedMatch.name}]: Match has reached ${thisMatch.time}'`);
            })
            // thisMatch.save().then(function () { log.info("[MatchModule] Match [ID: " + thisMatch.id + "] has reached " + thisMatch.time + "'"); });

            // SPI 201 - Auto-Terminate leftover matches 
            if (thisMatch.time > 160) {
                console.log(`[Match module ${HookedMatch.name}]: -- Terminating leftover match`);
                HookedMatch.TerminateMatch();
            }
        })
    }

    function calculatedMatchTimeFor(match) {
        var segment = match.timeline[match.state];
        var intitial = HookedMatch.sport.segments[match.state].initialTime;
        var duration = moment.duration(moment().diff(moment(segment.start))).subtract(segment.break_time, 'seconds').asMinutes();//.add(1, 'minute');//.add(1, 'minute');//.subtract(segment.break_time, 'seconds');
        return Math.ceil(intitial + duration);
    }

    /**
     * 
     **********************************************************************************************/

    HookedMatch.CorrectScoreLine = function (homeScore, awayScore, cbk) {
        if (homeScore === 'undefined' || homeScore == null || awayScore === 'undefined' || awayScore == null)
            return cbk(null);

        matches.findById(HookedMatch.id, { timeline: false })
        .exec(function (err, thisMatch) {
            if (err) {
                return cbk(err);
            }

            if (!thisMatch)
                return cbk(null);

            if (thisMatch.home_score == homeScore && thisMatch.away_score == awayScore)   
                return cbk(null);

            // Add or remove a Goal from match's Stats
            if (homeScore != HookedMatch.data.home_score) {

                // We have to generate an event from a previous goal for the home team
                const goalDiff = homeScore - HookedMatch.data.home_score;
                const diffEvent = {
                    type: goalDiff > 0 ? 'Add' : 'Delete',
                    data: {
                        status: 'active',
                        type: 'Goal',
                        match_id: HookedMatch.id,
                        team: 'home_team',
                        team_id: HookedMatch.data.home_team,
                        players: [],
                        stats: {
                            'Goal': Math.trunc(Math.abs(goalDiff))
                        }
                    }
                };
                StatsHelper.Parse(diffEvent, thisMatch);
            }
            if (awayScore != HookedMatch.data.away_score) {

                // We have to generate an event from a previous goal for the home team
                const goalDiff = awayScore - HookedMatch.data.away_score;
                const diffEvent = {
                    type: goalDiff > 0 ? 'Add' : 'Delete',
                    data: {
                        status: 'active',
                        type: 'Goal',
                        match_id: HookedMatch.id,
                        team: 'away_team',
                        team_id: HookedMatch.data.away_team,
                        players: [],
                        stats: {
                            'Goal': Math.trunc(Math.abs(goalDiff))
                        }
                    }
                };
                StatsHelper.Parse(diffEvent, thisMatch);
            }

            // Correct match score
            HookedMatch.data.home_score = homeScore;
            HookedMatch.data.away_score = awayScore;

            MessagingTools.sendSocketMessage({
                sockets: true,
                payload: {
                    type: "Match_Reload",
                    room: HookedMatch.data._id.toString()
                }
            });

            return matches.findOneAndUpdate({ _id: thisMatch._id }, { home_score: homeScore, away_score: awayScore, stats: thisMatch.stats }, cbk);
        });
    }


    /*  AddEvent
        The addEvent method is a core method to the moderation system. It is called by
        moderation services or manualy from the dashboard in order to inject events to
        the timeline and also broadcast them on the sockets channel to be consumed by
        other instances.
    */

    HookedMatch.AddEvent = function (event, isAfterLast, cbk) {


        var m = matches.findById(HookedMatch.id);
        m.populate("home_team away_team");
        m.exec(function (err, thisMatch) {
            if (err || !thisMatch)
                if (cbk)
                    return cbk(err);
                else
                    return console.log(err);

            // Verify that the the match has not completed in order to avoid erroneus events
            if (thisMatch.completed)
                if (cbk) {
                    log.info(`[Match module ${HookedMatch.name}]: The match has been terminated. No other events accepted.`);
                    return cbk(`[Match module ${HookedMatch.name}]: The match has been terminated. No other events accepted.`);
                } else
                    return log.info(`[Match module ${HookedMatch.name }]: The match has been terminated. No other events accepted.`);

            // Verify that the event is current and not some type of Stats.com update
            if (!isAfterLast)
                if (cbk) {
                    log.info(`[Match module ${HookedMatch.name}]: The event has match time less that the match running time. It is ignored.`);
                    return cbk(`[Match module ${HookedMatch.name}]: The event has match time less that the match running time. It is ignored.`);
                } else
                    return log.info(`[Match module ${HookedMatch.name}]: The event has match time less that the match running time. It is ignored.`);

            // Verify that the event state is the same as the match state
            if (thisMatch.state != event.data.state)
                if (cbk) {
                    log.info(`[Match module ${HookedMatch.name}]: The event addition is ignored as its state ${event.data.state} is different than the match current state ${thisMatch.state}.`);
                    return cbk(`[Match module ${HookedMatch.name}]: The event addition is ignored as its state ${event.data.state} is different than the match current state ${thisMatch.state}.`);
                } else
                    return log.info(`[Match module ${HookedMatch.name}]: The event addition is ignored as its state ${event.data.state} is different than the match current state ${thisMatch.state}.`);

            // Verify that the event when coming from a parser is not already added based on its parserid
            let eventFoundInTimeline = null;
            if (event.data.sender && event.data.parserids && event.data.parserids[event.data.sender]) {
                eventFoundInTimeline = _.find(thisMatch.timeline[event.data.state].events, function (o) {
                    return o.parserids && o.parserids[event.data.sender] && o.parserids[event.data.sender] == event.data.parserids[event.data.sender];
                });
            }
            if (eventFoundInTimeline)
                if (cbk) {
                    log.info(`[Match module ${HookedMatch.name}]: The event addition is ignored, because it is already in the match timeline.`);
                    return cbk(`[Match module ${HookedMatch.name}]: The event addition is ignored, because it is already in the match timeline.`);
                } else
                    return log.info(`[Match module ${HookedMatch.name }]: The event addition is ignored, because it is already in the match timeline.`);

            // Verify that the event did not came within a not-timed segment
            if (!HookedMatch.sport.segments[thisMatch.state].timed)
                if (cbk) {
                    log.info(`[Match module ${HookedMatch.name}]: The event addition is ignored, the current segment is not a timed one.`);
                    return cbk(`[Match module ${HookedMatch.name}]: The event addition is ignored, the current segment is not a timed one.`);
                } else
                    return log.info(`[Match module ${HookedMatch.name }]: The event addition is ignored, the current segment is not a timed one.`);

            event.data = new matchEvents(event.data);   // this truncates the match event to the properties present in the matchEvent model. All other properties in event object are discarded.

            // console.log("Linked: "+ StatsHelper.Parse(event, match, log));

            //        console.log("When adding event:");
            //        console.log(HookedMatch.data.timeline[this.data.state]);

            var evtObject = event.data;

            thisMatch.time = event.data.time;

            // Parses the event based on sport and makes changes in the match instance
            if (event.data.stats != null) {
                evtObject.linked_mods = StatsHelper.Parse(event, thisMatch);

                //Detour process in case of 'Goal'
                if (evtObject.stats.Goal) {
                    if (evtObject.team == "home_team")
                        thisMatch.home_score++;
                    else
                        thisMatch.away_score++;

                    PushNotifications.Goal(thisMatch, evtObject.team, () => { });
                }
            }

            // 1. push event in timeline
            if (evtObject.timeline_event) {
                // log.info("Received Timeline event");
                if (evtObject.type)
                    evtObject.type = cleanSafe(evtObject.type);
                // evtObject = new matchEvents(evtObject);
                thisMatch.timeline[thisMatch.state].events.push(evtObject);
            }

            // 2. broadcast event on pub/sub channel
            // log.info("Pushing event to Redis Pub/Sub channel");
            // PubChannel.publish("socketServers", JSON.stringify(event));

            // 3. send event to wildcards module for wildcard resolution
            if (!event.data.team_id && event.data.team && event.data.team == 'home_team')
                event.data.team_id = thisMatch.home_team;
            if (!event.data.team_id && event.data.team && event.data.team == 'away_team')
                event.data.team_id = thisMatch.away_team;

            Gamecards.ResolveEvent(event);

            StatsHelper.UpsertStat("system", {
                events_sent: 1
            }, thisMatch, "system");

            thisMatch.markModified('stats');

            // Add 'created' property in the socket event data for easier sorting on clients 
            event.data = event.data.toObject();
            if (!event.data.created)
                event.data.created = moment().utc().format();

            Gamecards.GamecardsAppearanceHandle(event, thisMatch);

            // Inform Clients for the new event to draw
            MessagingTools.sendSocketMessage({
                sockets: true,
                payload: {
                    type: "Event_added",
                    room: event.data.match_id.toString(),
                    data: event.data
                }
            });

            log.info(`[Match module ${HookedMatch.name}]: We are sending Stats_changed here on Add Event`);
            // Inform the system about the stat changes
            MessagingTools.sendSocketMessage({
                sockets: true,
                payload: {
                    type: "Stats_changed",
                    room: event.data.match_id.toString(),
                    data: thisMatch.stats
                }
            });

            var updateObject = {
                home_score: thisMatch.home_score,
                stats: thisMatch.stats,
                timeline: thisMatch.timeline,
                away_score: thisMatch.away_score
            };

            matches.findOneAndUpdate({ _id: thisMatch._id }, updateObject, { new: true }, function (err, result) {
                // thisMatch.save(function (err, done) {

                if (err)
                    return log.error(err.message);

                if (result)
                    HookedMatch.data = _.merge(HookedMatch.data, updateObject);

                if (cbk)
                    return cbk(null, evtObject);
                else
                    return HookedMatch;
            });
        });

    };



    /*  UpdateEvent
     
    */
    HookedMatch.UpdateEvent = function (event, cbk) {

        // console.log(event.data._id);
        //  console.log(this.data.timeline[event.data.state]);

        if (!this.data.timeline[event.data.state])
            if (cbk)
                return cbk(null);
            else
                return HookedMatch;

        var eventToUpdate = _.find(this.data.timeline[event.data.state].events, function (o) {
            //  console.log(o);
            // console.log(event.data);
            return o._id == event.data._id;
        });

        // If the event cannot be found based on its id, try finding it based on the id that the parser puts on it, by the parserids object property
        if (!eventToUpdate && event.data.sender && event.data.parserids && event.data.parserids[event.data.sender]) {
            eventToUpdate = _.find(this.data.timeline[event.data.state].events, function (o) {
                return o.parserids && o.parserids[event.data.sender] && o.parserids[event.data.sender] == event.data.parserids[event.data.sender];
            });
        }
        // log.info("Event to be updated [before]:");

        // if(eventToUpdate)
        // console.log(eventToUpdate);

        if (!eventToUpdate)
            if (cbk)
                return cbk(null);
            else
                return HookedMatch;

        // We have an update to players
        if (eventToUpdate.players && eventToUpdate.players.length < event.data.players.length) {
            event.data.linked_mods = StatsHelper.UpdateEventStat([event.data.players[0]._id], event.data.stats, [event.data.players[0].name], this.data, eventToUpdate.linked_mods);
            eventToUpdate.players = event.data.players;
            log.info(`[Match module ${HookedMatch.name}]: Updating player:`);
            log.info(eventToUpdate.players);
        }

        // // Parses the event based on sport and makes changes in the match instance
        // StatsHelper.Parse(event, match);

        // for (var i = 0; i < this.data.timeline[event.data.state].events.length; i++) {
        //     if (this.data.timeline[event.data.state].events[i].id == event.data.id && this.data.timeline[event.data.state].events[i].match_id == event.match_id) {
        //         this.data.timeline[event.data.state].events[i] = event.data;
        //         break;
        //     }
        // }

        // Broadcast the remove event so others can consume it.
        // 2. broadcast event on pub/sub channel
        // log.info("Pushing event to Redis Pub/Sub channel");
        // PubChannel.publish("socketServers", JSON.stringify(event));

        // Inform Clients for the new event to draw
        MessagingTools.sendSocketMessage({
            sockets: true,
            payload: {
                type: "Event_updated",
                room: eventToUpdate.match_id,
                data: eventToUpdate
            }
        });

        log.info(`[Match module ${HookedMatch.name}]: We are sending Stats_changed here on Update Event`);
        // Inform the system about the stat changes
        MessagingTools.sendSocketMessage({
            sockets: true,
            payload: {
                type: "Stats_changed",
                room: eventToUpdate.match_id,
                data: match.stats
            }
        });

        // 3. save match to db
        // this.data.markModified('timeline');


        // StatsHelper.UpsertStat(match.id, {
        //     events_sent: 1
        // }, this.data);
        this.data.markModified('stats');

        var updateObject = {
            timeline: this.data.timeline
        };

        matches.findOneAndUpdate({ _id: this.data._id }, updateObject, { new: true }, function (err, result) {
            log.info("Updated match in database");
            // thisMatch.save(function (err, done) {
            // console.log(result.players);
            if (err)
                return log.error(err.message);

            // if (result)
            //     HookedMatch.data = _.merge(HookedMatch.data, updateObject);

            // ToDo: When ready, uncomment the following:
            // Gamecards.ReEvaluateAll(HookedMatch.id, function(gamecardsError) {
            //     if (gamecardsError)
            //         log.error(gamecardsError);

                // log.info("Event after update:");
                //  console.log(eventToUpdate);

                 if (cbk)
                     return cbk(null, eventToUpdate);
                 else
                     return HookedMatch;
            //});

        });
    };


    /*  RemoveEvent
 
    */
    HookedMatch.RemoveEvent = function (event, cbk) {
        var that = this;

        if (!event || !event.data || !this.data.timeline[event.data.state])
            if (cbk)
                return cbk(null, HookedMatch);
            else
                return HookedMatch;

        // 2. Locate the event to be removed in the match timeline
        var eventToDelete = _.find(this.data.timeline[event.data.state].events, function (o) {
            return o._id == event.data._id;
        });

        // If the event cannot be found based on its id, try finding it based on the id that the parser puts on it, by the parserids object property
        if (!eventToDelete && event.data.sender && event.data.parserids && event.data.parserids[event.data.sender]) {
            eventToDelete = _.find(this.data.timeline[event.data.state].events, function (o) {
                return o.parserids && o.parserids[event.data.sender] && o.parserids[event.data.sender] == event.data.parserids[event.data.sender];
            });
        }
        // if (eventToDelete)
        // console.log(eventToUpdate);

        if (!eventToDelete)
            if (cbk)
                return cbk(null, HookedMatch);
            else
                return HookedMatch;

        // If the event is a goal to be removed, decrease score accordingly
        if (event.data.stats.Goal) {
            if (event.data.team == "home_team" && this.data.home_score > 0)
                this.data.home_score--;
            else if (event.data.team == "away_team" && this.data.away_score)
                this.data.away_score--;
        }

        // set status to removed
        eventToDelete.status = "removed";

        // Should we destroy events or just mark them "removed"? it will be decided upon the destroyOnDelete setting
        if (this.data.settings.destroyOnDelete) {
            log.warn('Deleting event from timeline: ', event.data);
            this.data.timeline[event.data.state].events = _.without(this.data.timeline[event.data.state].events, eventToDelete);
        }

        // Parses the event based on sport and makes changes in the match instance
        StatsHelper.Parse(event, match);

        StatsHelper.UpsertStat("system", {
            events_sent: 1
        }, this.data, "system");


        var updateObject = {
            home_score: this.data.home_score, 
            stats: this.data.stats,
            timeline: this.data.timeline,
            away_score: this.data.away_score
        }

        // 3. save match to db
        matches.findOneAndUpdate({ _id: this.data._id }, updateObject, { new: true }, function (err, result) {
            if (err) {
                log.error(err.message);
                if (cbk)
                    return cbk(err);
                else
                    return err.message;
            }

            // Update memory match object as well (HookedMatch.data)
            if (result)
                HookedMatch.data = _.merge(HookedMatch.data, updateObject);

            // ToDo: When ready, uncomment the following:
            Gamecards.ReEvaluateAll(HookedMatch.id, function (gamecardsError) {
                if (gamecardsError)
                    log.error(gamecardsError);

                // Inform Clients for the new event to draw
                MessagingTools.sendSocketMessage({
                    sockets: true,
                    payload: {
                        type: "Match_Reload",
                        room: that.data._id.toString(),
                    }
                });

                if (cbk)
                    return cbk(null, eventToDelete);
                else
                    return HookedMatch;
            });
        });
    }


    // method to be called when the match is over. Disposes and releases handlers, timers, and takes care of loose ends.
    HookedMatch.TerminateMatch = function (outterCbk) {
        HookedMatch.Timers.clear();

        var m = matches.findById(HookedMatch.id);
        m.populate('home_team away_team');

        m.exec(function (err, thisMatch) {
            if (err) {
                log.error(err.message);
                if (outterCbk)
                    return outterCbk(err);
                else
                    return;
            }

            HookedMatch.data.completed = true;
            thisMatch.completed = true;
            thisMatch.save(function (err, done) {

                if (err)
                    log.error(err.message);

                async.parallel([
                    (cbk) => {
                        return PushNotifications.Termination(thisMatch, cbk);
                    },
                    (cbk) => {
                        Gamecards.TerminateMatch(HookedMatch.data, (gameCardErr) => {
                            if (gameCardErr)
                                log.error(gameCardErr);

                            log.info(`[Match module ${HookedMatch.name}]: Now that the end gamecards have been resolved, reward players for achievements`);

                            if (HookedMatch.data.settings.sendPushes === undefined || HookedMatch.data.settings.sendPushes) {
                                return async.parallel([
                                // Handle all achievements calculated at the end of a match
                                    // 1. Persistant Gamer
                                    (innerCbk) => { return Achievements.Reward.persist_gamer(HookedMatch.id, innerCbk); },
                                    // 2. Rank achievements
                                    (innerCbk) => { return Achievements.Reward.rank_achievements(HookedMatch.id, innerCbk); }
                                ], cbk);
                            }
                            else
                                return async.setImmediate(() => { cbk(null); });
                        });
                    }
                ], () => {
                    // Inform Clients for the match completion
                    MessagingTools.sendSocketMessage({
                        sockets: true,
                        payload: {
                            type: "Match_full_time",
                            room: HookedMatch.id.toString()
                        }
                    });

                    HookedMatch.Cleanup((cleanupErr) => {
                        if (cleanupErr) {
                            log.error(`[Match module ${HookedMatch.name}] Error with cleanup: ${cleanupErr.stack}`);
                        }

                        setTimeout(function () {
                            HookedMatch.Terminate(() => {
                                if (outterCbk)
                                    return outterCbk(null);
                            });
                        }, 1000);
                    });

                });
            });
        });
    };


    // Rectify issues occurred during the match, such as diffs between user scores and points awarded by won game cards
    HookedMatch.Cleanup = function (callback) {

        var matchId = HookedMatch.id;
        var userIds = [];
        var scoreDocs = [];
        var diffs = {};


        async.waterfall([
            (cbk) => {
                //var scoresCollection = mongoose.models.scores;
                scores.find({ game_id: matchId, score: { $gt: 0 } }, { score: 1, user_id: 1 }, (err, scores) => {
                    if (err)
                        return cbk(err);

                    scoreDocs = scores;

                    scores.forEach((score) => {
                        userIds.push(score.user_id);
                        diffs[score.user_id] = {
                            fromScores: score.score
                        };
                    });
                    return cbk(null);
                });
            },
            (cbk) => {
                userGamecards.find({ matchid: matchId, pointsAwarded: { $gt: 0 } }, 'userid pointsAwarded', (err, cards) => {
                    if (err)
                        return cbk(err);

                    cards.forEach((card) => {
                        if (!diffs[card.userid]) {
                            userIds.push(card.userid);
                            diffs[card.userid] = {
                                fromScores: 0,
                                fromCards: card.pointsAwarded
                            };
                        }
                        else {
                            if (!diffs[card.userid].fromCards)
                                diffs[card.userid].fromCards = card.pointsAwarded;
                            else
                                diffs[card.userid].fromCards += card.pointsAwarded;
                        }

                    });

                    return cbk(null);
                });
            }
        ], (asyncErr) => {
            if (asyncErr)
                return callback(asyncErr);

            if (!diffs)
                return callback(null, false);

            userIds.forEach(function (userId) {
                if (diffs[userId].fromCards === diffs[userId].fromScores)
                    delete diffs[userId];
            });

            const userIdsWithDiffs = Object.keys(diffs);

            if (userIdsWithDiffs && userIdsWithDiffs.length > 0) {
                log.warn(`[Match module ${HookedMatch.name}]: Found the following discrepancies between user scores and sums from won user cards. Correcting...`);
                log.warn(`${JSON.stringify(diffs)}`);
                // Rectify scores for the specific users
                scoreDocs = _.filter(scoreDocs, (doc) => { return _.indexOf(userIdsWithDiffs, doc.user_id) > -1; });
                async.eachLimit(scoreDocs, 100, (doc, cbk) => {
                    doc.score = diffs[doc.user_id].fromCards;
                    doc.save(cbk);
                }, (asyncErr) => {
                    if (asyncErr)
                        log.error(`[Match module ${HookedMatch.name}] Error at termination cleanup: ${asyncErr.stack}`);

                    return callback(asyncErr, true);
                });
            }
            else
                return callback(null, false);
        });
    };

    HookedMatch.Terminate = function (callback) {
        var that = this;

        log.info(`[Match module ${HookedMatch.name}]: Terminating the match module.`);

        if (that.services) {
            async.each(that.services, (service, cbk) => {
                if (service)
                    return service.Terminate(cbk);
                else
                    return cbk(null);
            }, (err) => {
                if (err)
                    log.error(err.stack);

                that.services.length = 0;
                return callback(null);
            });
        }
        else {
            that.services.length = 0;
            return callback(null);
        }
    };

    return HookedMatch;
};


function cleanSafe(str) {
    // remove spaces
    return str.replace(/ /g, '_');
}

module.exports = matchModule;
