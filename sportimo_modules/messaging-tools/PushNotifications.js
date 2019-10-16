'use strict';



const _ = require('lodash');
const async = require('async');
const log = require('winston');
const MessagingTools = require('./index');
const mongoose = require('mongoose');
const moment = require('moment');

const matches = require('../models/match'),
    tournamentMatches = require('../models/trn_match'),
    useractivities = require('../models/trn_user_activity'),
    serversettings = require('../models/gameServerSettings'),
    users = require('../models/user');


// ToDo: take into account trn_matches isHidden property (along with match's disabled one)

class PushNotifications {


    static GetTournamentMatchesForMatches(matchIds, callback) {
        return mongoose.models.trn_matches.find({ match: { $in: matchIds } })
                .populate('client')
                .populate({ path: 'tournament', match: { state: 'active' } })
                .populate('leaderboardDefinition')
                .populate({ path: 'match', select: '-stats -timeline', populate: [{ path: 'home_team', select: 'name' }, { path: 'away_team', select: 'name' }] })
                .exec(callback);
    }


    static Reactivation(matchesStartingInNext15, callback) {

        if (!matchesStartingInNext15 || matchesStartingInNext15.length === 0)
            return callback(null);


        async.waterfall([
            function (cbk) {
                return users.find({ client: {$ne: null} }, '_id client', cbk);
            },
            function (allUsers, cbk) {
                PushNotifications.GetTournamentMatchesForMatches(matchesStartingInNext15, (err, trnMatches) => {
                    if (err)
                        return cbk(err);
                    return cbk(null, allUsers, trnMatches);
                });
            },
            function (allUsers, trnMatches, cbk) {

                const allUsersPerClient = _.groupBy(allUsers, 'client');
                const allUserIdsPerClient = _.mapValues(allUsersPerClient, (arr) => _.map(arr, 'id'));

                const trnMatchesPerClient = _.groupBy(trnMatches, (m) => m.client.id); //_.uniq(_.map(trnMatches, 'client'));

                // We have at least a match starting in the next 5 mins
                // Irrespectively of which ones, find all userIds that did not play a card in the last 5, 10, 20 consecutive matches
                return async.eachOf(trnMatchesPerClient, (clientTrnMatches, clientId, icbk) => PushNotifications.ReactivationForClient(clientId, allUserIdsPerClient[clientId], clientTrnMatches, icbk), cbk);
            }
        ], callback);
    }



    static ReactivationForClient(client, allUserIds, trnMatches, callback) {

        if (!trnMatches || trnMatches.length === 0)
            return callback(null);

        const userGamecards = mongoose.models.trn_user_cards;


        // We have at least a match starting in the next 5 mins
        // Irrespectively of which ones, find all userIds that did not play a card in the last 5, 10, 20 consecutive matches

        var now = new Date();

        return async.waterfall([
            function (innerCbk) {

                // Find the last 5, 10 and 20 matches
                return tournamentMatches.find({ client: client })
                    .populate({
                        path: 'match',
                        match: { completed: true, start: { $lt: now } },
                        select: 'start',
                        options: { limit: 20, sort: { start: -1 } }
                    })
                    .populate('tournament', 'settings')
                    .exec(innerCbk);


                    //return matches
                    //    .find({
                    //        completed: true,
                    //        start: { $lt: now }
                    //    }, '_id start')
                    //    .sort({ start: -1 })
                    //    .limit(20)
                    //    .exec(innerCbk);
            },
            function (lastTrnMatches, innerCbk) {

                const lastMatches = _.filter(lastTrnMatches, (tm) => tm.match && tm.match.start);
                if (!lastMatches || lastMatches.length === 0)
                    return innerCbk(null);

                var lastTwentyMatchesIds = _.map(lastMatches, 'match.id');
                var lastTenMatchesIds = _.take(lastTwentyMatchesIds, 10);
                var lastFiveMatchesIds = _.take(lastTwentyMatchesIds, 5);

                var tenDaysBefore = moment.utc(now).subtract(10, 'd').toDate();

                // and for these matches get all users having played a gamecard.

                async.parallel([
                    function (innermostCbk) {
                        userGamecards.find({
                            client: client,
                            matchid: { $in: lastTwentyMatchesIds }
                        }, 'userid', innermostCbk);
                    },
                    function (innermostCbk) {
                        userGamecards.find({
                            client: client,
                            matchid: { $in: lastTenMatchesIds }
                        }, 'userid', innermostCbk);
                    },
                    function (innermostCbk) {
                        userGamecards.find({
                            client: client,
                            matchid: { $in: lastFiveMatchesIds }
                        }, 'userid', innermostCbk);
                    },
                    function (innermostCbk) {
                        //userGamecards.find({
                        //    creationTime: { gt: tenDaysBefore },
                        //}, 'userid', innermostCbk);
                        userGamecards.aggregate([
                            {
                                $match: {
                                    client: client,
                                    creationTime: { $gt: tenDaysBefore }
                                }
                            },
                            {
                                $group: {
                                    _id: '$userid'
                                }
                            }
                        ], innermostCbk);
                    },
                    function (innermostCbk) {
                        mongoose.models.trn_scores.aggregate([
                            {
                                $match: {
                                    client: client,
                                    lastActive: { $gt: tenDaysBefore }
                                }
                            },
                            {
                                $group: {
                                    _id: '$user_id',
                                    totalScore: { $max: '$score' }
                                }
                            },
                            {
                                $match: {
                                    $or: [{ totalScore: 0 }, { totalScore: null }]
                                }
                            }
                        ], innermostCbk);
                    }
                ], function (err, gamecardResults) {
                    if (err) {
                        log.error('Failed to send notifications 15\' prior of match start: ' + err);
                        return innerCbk(null, [], []);
                    }

                    // Then subtract their ids from allUserIds and get those that have not played a card in these consecutive matches
                    // Then send them a message

                    const lastTwentyMatchesUsers = gamecardResults[0];
                    const lastTenMatchesUsers = gamecardResults[1];
                    const lastFiveMatchesUsers = gamecardResults[2];
                    const lastTenDaysCardUsers = gamecardResults[3];
                    const lastTenDaysMatchVisitors = gamecardResults[4];
                    let sendPushes = false;
                    const pushNotifications = null;

                    if (trnMatches[0].settings && trnMatches[0].settings.sendPushes !== undefined && trnMatches[0].settings.sendPushes !== null)
                        sendPushes = trnMatches[0].settings.sendPushes;
                    else if (trnMatches[0].tournament.settings && trnMatches[0].tournament.settings.sendPushes !== undefined && trnMatches[0].tournament.settings.sendPushes !== null)
                        sendPushes = trnMatches[0].tournament.settings.sendPushes;
                    else if (trnMatches[0].client.settings && trnMatches[0].client.settings.sendPushes !== undefined && trnMatches[0].client.settings.sendPushes !== null)
                        sendPushes = trnMatches[0].client.settings.sendPushes;
                    if (trnMatches[0].settings && trnMatches[0].settings.pushNotifications)
                        pushNotifications = trnMatches[0].settings.pushNotifications;
                    else if (trnMatches[0].client.settings && trnMatches[0].client.settings.pushNotifications)
                        pushNotifications = trnMatches[0].client.settings.pushNotifications;

                    let userIdsNotHavingPlayedLastTwentyMatches = [];
                    let userIdsNotHavingPlayedLastTenMatches = [];
                    let userIdsNotHavingPlayedLastFiveMatches = [];
                    let userIdsNotHavingPlayedLastTenDays = [];

                    if (lastTwentyMatchesUsers && lastTwentyMatchesUsers.length > 0) {
                        const lastTwentyMatchesUserIds = _.uniq(_.map(lastTwentyMatchesUsers, 'userid'));
                        userIdsNotHavingPlayedLastTwentyMatches = _.difference(allUserIds, lastTwentyMatchesUserIds);
                    }
                    if (lastTenMatchesUsers && lastTenMatchesUsers.length > 0) {
                        const lastTenMatchesUserIds = _.uniq(_.map(lastTenMatchesUsers, 'userid'));
                        userIdsNotHavingPlayedLastTenMatches = _.difference(allUserIds, lastTenMatchesUserIds);
                    }
                    if (lastFiveMatchesUsers && lastFiveMatchesUsers.length > 0) {
                        const lastFiveMatchesUserIds = _.uniq(_.map(lastFiveMatchesUsers, 'userid'));
                        userIdsNotHavingPlayedLastFiveMatches = _.difference(allUserIds, lastFiveMatchesUserIds);
                    }
                    if (lastTenDaysMatchVisitors && lastTenDaysMatchVisitors.length > 0) {
                        userIdsNotHavingPlayedLastTenDays = _.map(lastTenDaysMatchVisitors, '_id');
                    }
                    if (lastTenDaysCardUsers && lastTenDaysCardUsers.length > 0) {
                        const lastTenDaysUserIds = _.uniq(_.map(lastTenDaysCardUsers, 'userid'));
                        userIdsNotHavingPlayedLastTenDays = _.difference(userIdsNotHavingPlayedLastTenDays, lastTenDaysUserIds);
                    }

                    userIdsNotHavingPlayedLastTenMatches = _.difference(userIdsNotHavingPlayedLastTenMatches, userIdsNotHavingPlayedLastTwentyMatches);
                    userIdsNotHavingPlayedLastFiveMatches = _.difference(userIdsNotHavingPlayedLastFiveMatches, userIdsNotHavingPlayedLastTwentyMatches);
                    userIdsNotHavingPlayedLastFiveMatches = _.difference(userIdsNotHavingPlayedLastFiveMatches, userIdsNotHavingPlayedLastTenMatches);
                    userIdsNotHavingPlayedLastTenDays = _.difference(userIdsNotHavingPlayedLastTenDays, userIdsNotHavingPlayedLastTwentyMatches);
                    userIdsNotHavingPlayedLastTenDays = _.difference(userIdsNotHavingPlayedLastTenDays, userIdsNotHavingPlayedLastTenMatches);
                    userIdsNotHavingPlayedLastTenDays = _.difference(userIdsNotHavingPlayedLastTenDays, userIdsNotHavingPlayedLastFiveMatches);

                    const matchStartingNext15 = trnMatches[0].match;
                    const matchId = matchStartingNext15.id;

                    var matchName = { en: '', ar: '' };

                    if (matchStartingNext15.home_team && matchStartingNext15.home_team.name && matchStartingNext15.home_team.name.en)
                        matchName.en += matchStartingNext15.home_team.name.en;
                    else matchName.en += 'Home team';
                    matchName.en += ' - ';
                    if (matchStartingNext15.away_team && matchStartingNext15.away_team.name && matchStartingNext15.away_team.name.en)
                        matchName.en += matchStartingNext15.away_team.name.en;
                    else matchName.en += 'Away team';

                    if (matchStartingNext15.home_team && matchStartingNext15.home_team.name && matchStartingNext15.home_team.name.ar)
                        matchName.ar += matchStartingNext15.home_team.name.ar;
                    else matchName.ar += 'Home team';
                    matchName.ar += ' - ';
                    if (matchStartingNext15.away_team && matchStartingNext15.away_team.name && matchStartingNext15.away_team.name.ar)
                        matchName.ar += matchStartingNext15.away_team.name.ar;
                    else matchName.ar += 'Away team';

                    if (sendPushes && pushNotifications && pushNotifications.R4 && userIdsNotHavingPlayedLastTwentyMatches.length > 0) {
                        log.info(`Sending reactivation R4 notification to ${userIdsNotHavingPlayedLastTwentyMatches.length} users: ${_.take(userIdsNotHavingPlayedLastTwentyMatches, 9)}, ...`);
                        const msg = {
                            en: `${matchName.en} kicks off in 15'! Start playing your cards NOW & make it on the leaderboard!`,
                            ar: `مباراة ${matchName.ar} ستبدأ في 15دقيقة!
ابدأ بالعب بطاقاتك الآن وقد تكون المتصدر على قائمة المتسابقين!`
                        };
                        MessagingTools.sendPushToUsers(userIdsNotHavingPlayedLastTwentyMatches, msg, { "type": "view", "data": { "view": "match", "viewdata": matchId } }, "match_reminder");
                    }
                    if (sendPushes && pushNotifications && pushNotifications.R3 && userIdsNotHavingPlayedLastTenMatches.length > 0) {
                        log.info(`Sending reactivation R3 notification to ${userIdsNotHavingPlayedLastTenMatches.length} users: ${_.take(userIdsNotHavingPlayedLastTenMatches, 9)}, ...`);
                        const msg = {
                            en: `Your name is missing from the leaderboard! Find a match you like and play your cards right 👍`,
                            ar: `اسمك غير موجود على قائمة المتصدرين! اختر مباراة تعجبك والعب بطاقاتك!`
                        };
                        MessagingTools.sendPushToUsers(userIdsNotHavingPlayedLastTenMatches, msg, { "type": "view", "data": { "view": "match", "viewdata": matchId } }, "match_reminder");
                    }
                    if (sendPushes && pushNotifications && pushNotifications.R2 && userIdsNotHavingPlayedLastFiveMatches.length > 0) {
                        log.info(`Sending reactivation R2 notification to ${userIdsNotHavingPlayedLastFiveMatches.length} users: ${_.take(userIdsNotHavingPlayedLastFiveMatches, 9)}, ...`);
                        const msg = {
                            en: `Where have you been champ? Join the ${matchName.en} and prove you know your stuff!`,
                            ar: `أين كنت يا بطل؟ شارك بمباراة ${matchName.ar} لتثبت أنك خبير باللعبة!`
                        };
                        MessagingTools.sendPushToUsers(userIdsNotHavingPlayedLastFiveMatches, msg, { "type": "view", "data": { "view": "match", "viewdata": matchId } }, "match_reminder");
                    }
                    if (sendPushes && pushNotifications && pushNotifications.R1 && userIdsNotHavingPlayedLastTenDays.length > 0) {
                        log.info(`Sending reactivation R1 notification to ${userIdsNotHavingPlayedLastTenDays.length} users: ${_.take(userIdsNotHavingPlayedLastTenDays, 9)}, ...`);
                        const msg = {
                            en: `️⚽ ${matchName.en} is starting in 15'! Can you to rank in the top-10? Join the game and see!`,
                            ar: `مباراة  ${matchName.ar} ستبدأ في 15دقيقة!
هل ستكون مع أفضل 10؟ شارك باللعب لتعرف!`
                        };
                        MessagingTools.sendPushToUsers(userIdsNotHavingPlayedLastTenDays, msg, { "type": "view", "data": { "view": "match", "viewdata": matchId } }, "match_reminder");
                    }

                    return innerCbk(null);
                });
            }
        ], (err) => {
            if (err)
                log.error(err.stack);

            return callback(null);
        });
    }


    static SegmentAdvance(thisMatch, callback) {

        // Check whether the segment change is interesting and valid for a push, else return
        if (_.indexOf([0, 1], thisMatch.state) === -1)
            return callback(null);

        PushNotifications.GetTournamentMatchesForMatches([thisMatch._id], (err, trnMatches) => {
            if (err) {
                log.error(`[Match module ${thisMatch.name}]: Failed to send notifications on match Segment advance: ${err.stack}`);
                return callback(null);
            }
            else
                async.each(trnMatches, (trnMatch, cbk) => PushNotifications.SegmentAdvanceForClient(trnMatch.client.id, trnMatch, cbk), callback);
        });

    } 


    static SegmentAdvanceForClient(client, trnMatch, callback) {

        const thisMatch = trnMatch.match;
        let pushNotifications = null;
        let sendPushes = false;
        if (trnMatch.settings && trnMatch.settings.sendPushes !== undefined && trnMatch.settings.sendPushes !== null)
            sendPushes = trnMatch.settings.sendPushes;
        else if (trnMatch.tournament.settings && trnMatch.tournament.settings.sendPushes !== undefined && trnMatch.tournament.settings.sendPushes !== null)
            sendPushes = trnMatch.tournament.settings.sendPushes;
        else if (trnMatch.client.settings && trnMatch.client.settings.sendPushes !== undefined && trnMatch.client.settings.sendPushes !== null)
            sendPushes = trnMatch.client.settings.sendPushes;


        if (trnMatch.settings && trnMatch.settings.pushNotifications)
            pushNotifications = trnMatch.settings.pushNotifications;
        else if (trnMatch.tournament.settings && trnMatch.tournament.settings.pushNotifications)
            pushNotifications = trnMatch.tournament.settings.pushNotifications;
        else if (trnMatch.client.settings && trnMatch.client.settings.pushNotifications)
            pushNotifications = trnMatch.client.settings.pushNotifications;


        // Check whether the segment change is interesting and valid for a push, else return
        if (!sendPushes || _.indexOf([0, 1], thisMatch.state) === -1)
            return callback(null);

        if (thisMatch.state === 0) {
            async.parallel([
                (cbk) => {
                    useractivities.find({ room: thisMatch.id, client: client })
                        .select('user')
                        .exec(cbk);
                },
                (cbk) => {
                    users.find({ client: client, $or: [{ favoriteteams: thisMatch.home_team.id }, { favoriteteams: thisMatch.away_team.id }] }).select('_id').exec(cbk);
                }
            ], (parallelErr, results) => {
                if (!parallelErr) {
                    const userIdsHavingPlayedCard = _.compact(_.map(results[0], 'user'));
                    const userIdsHavingFavoriteTeam = _.map(results[1], 'id');

                    userIdsHavingFavoriteTeam = _.difference(userIdsHavingFavoriteTeam, userIdsHavingPlayedCard);

                    let matchName = { en: '', ar: '' };

                    if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.en)
                        matchName.en += thisMatch.home_team.name.en;
                    else matchName.en += 'Home team';
                    matchName.en += ' - ';
                    if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.en)
                        matchName.en += thisMatch.away_team.name.en;
                    else matchName.en += 'Away team';

                    if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.ar)
                        matchName.ar += thisMatch.home_team.name.ar;
                    else matchName.ar += 'Home team';
                    matchName.ar += ' - ';
                    if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.ar)
                        matchName.ar += thisMatch.away_team.name.ar;
                    else matchName.ar += 'Away team';



                    var msgE2 = {
                        en: `️⚽ ${matchName.en} is kicking off! Can you rank in the top-10? Join the game and see!`,
                        ar: `️⚽ مباراة ${matchName.ar} ستبدأ!
هل ستكون مع أفضل 10 لاعبين؟ شارك باللعب لتعرف!`
                    };
                    var msgE1 = {
                        en: `Don't miss out on  your favorite team! ${matchName.en} is going live: Start playing your cards NOW ⚽`,
                        ar: `لا تفوت فريقك المفضل! مبارة ${matchName.ar} بدأت للتو!
ابدأ لعب بطاقاتك الآن ⚽`
                    };

                    // Send push notification to users that the game has started.
                    if (!trnMatch.isHidden && !thisMatch.disabled) {
                        if (sendPushes && pushNotifications && pushNotifications.E2 && userIdsHavingPlayedCard && userIdsHavingPlayedCard.length > 0) {
                            log.info(`[Match module ${thisMatch.name}]: Sending match start E2 notification to users: ${_.take(userIdsHavingPlayedCard, 9)}, ...`);
                            MessagingTools.sendPushToUsers(userIdsHavingPlayedCard, msgE2, { "type": "view", "data": { "view": "match", "viewdata": thisMatch.id } }, "kick_off");
                        }
                        if (sendPushes && pushNotifications && pushNotifications.E1 && userIdsHavingFavoriteTeam && userIdsHavingFavoriteTeam.length > 0) {
                            log.info(`[Match module ${thisMatch.name}]: Sending match start E1 notification to users: ${_.take(userIdsHavingFavoriteTeam, 9)}, ...`);
                            MessagingTools.sendPushToUsers(userIdsHavingFavoriteTeam, msgE1, { "type": "view", "data": { "view": "match", "viewdata": thisMatch.id } }, "kick_off");
                        }
                    }
                    return callback(null);
                }
                else {
                    log.error(`[Match module ${thisMatch.name}]: Failed to send notifications on match start: ${parallelErr.stack}`);
                    return callback(parallelErr);
                }
            });
        }
        else if (thisMatch.state === 1) {
            async.parallel([
                (cbk) => {
                    useractivities.find({ room: thisMatch.id })
                        .select('user')
                        .exec(cbk);
                },
                (cbk) => {
                    serversettings.findOne({}, cbk);
                }
            ], (parallelErr, results) => {
                if (!parallelErr) {
                    var userIdsHavingPlayedCard = _.compact(_.map(results[0], 'user'));
                    var matchName = { en: '', ar: '' };

                    if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.en)
                        matchName.en += thisMatch.home_team.name.en;
                    else matchName.en += 'Home team';
                    matchName.en += ' ' + thisMatch.home_score + ' - ' + thisMatch.away_score + ' ';
                    if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.en)
                        matchName.en += thisMatch.away_team.name.en;
                    else matchName.en += 'Away team';

                    if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.ar)
                        matchName.ar += thisMatch.home_team.name.ar;
                    else matchName.ar += 'Home team';
                    matchName.ar += ' ' + thisMatch.home_score + ' - ' + thisMatch.away_score + ' ';
                    if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.ar)
                        matchName.ar += thisMatch.away_team.name.ar;
                    else matchName.ar += 'Away team';


                    var msgG2 = {
                        en: `Time to take a break! Half-Time for ${matchName.en}`,
                        ar: `وقت الإستراحة!
استراحة مابين الشوطين لمباراة ${matchName.ar}`
                    };

                    // Send push notification to users that the game has started.
                    if (!trnMatch.isHidden && !thisMatch.disabled) {
                        if (sendPushes && pushNotifications && pushNotifications.G2 && userIdsHavingPlayedCard && userIdsHavingPlayedCard.length > 0) {
                            log.info(`[Match module ${thisMatch.name}]: Sending match half-time G2 notification to users: ${_.take(userIdsHavingPlayedCard, 9)}, ...`);
                            MessagingTools.sendPushToUsers(userIdsHavingPlayedCard, msgG2, { "type": "view", "data": { "view": "match", "viewdata": thisMatch.id } }, "kick_off");
                        }
                    }

                    return callback(null);
                }
                else {
                    log.error(`[Match module ${thisMatch.name}]: Failed to send notifications on match half-time: ${parallelErr.stack}`);
                    return callback(parallelErr);
                }
            });
        }
    } 


    static Goal(thisMatch, teamThatScored, callback) {

        PushNotifications.GetTournamentMatchesForMatches([thisMatch._id], (err, trnMatches) => {
            if (err) {
                log.error(`[Match module ${thisMatch.name}]: Failed to send notifications on match Goal: ${err.stack}`);
                return callback(null);
            }
            else
                async.each(trnMatches, (trnMatch, cbk) => PushNotifications.GoalForClient(trnMatch.client.id, trnMatch, teamThatScored, cbk), callback);
        });
    }


    static GoalForClient(client, trnMatch, teamThatScored, callback) {

        const thisMatch = trnMatch.match;
        let pushNotifications = null;
        let sendPushes = false;
        if (trnMatch.settings && trnMatch.settings.sendPushes !== undefined && trnMatch.settings.sendPushes !== null)
            sendPushes = trnMatch.settings.sendPushes;
        else if (trnMatch.tournament.settings && trnMatch.tournament.settings.sendPushes !== undefined && trnMatch.tournament.settings.sendPushes !== null)
            sendPushes = trnMatch.tournament.settings.sendPushes;
        else if (trnMatch.client.settings && trnMatch.client.settings.sendPushes !== undefined && trnMatch.client.settings.sendPushes !== null)
            sendPushes = trnMatch.client.settings.sendPushes;

        // Check whether the settings allow for a push, else return
        if (!sendPushes)
            return callback(null);


        if (trnMatch.settings && trnMatch.settings.pushNotifications)
            pushNotifications = trnMatch.settings.pushNotifications;
        else if (trnMatch.tournament.settings && trnMatch.tournament.settings.pushNotifications)
            pushNotifications = trnMatch.tournament.settings.pushNotifications;
        else if (trnMatch.client.settings && trnMatch.client.settings.pushNotifications)
            pushNotifications = trnMatch.client.settings.pushNotifications;

        async.parallel([
            (innerCbk) => {
                useractivities.find({ room: thisMatch.id })
                    .select('user')
                    .exec(innerCbk);
            }
        ], (parallelErr, results) => {
            if (!parallelErr) {
                var userIdsHavingPlayedCard = _.compact(_.map(results[0], 'user'));

                var matchName = { en: '', ar: '' };

                if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.en)
                    matchName.en += thisMatch.home_team.name.en;
                else matchName.en += 'Home team';
                matchName.en += ' ' + thisMatch.home_score + ' - ' + thisMatch.away_score + ' ';
                if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.en)
                    matchName.en += thisMatch.away_team.name.en;
                else matchName.en += 'Away team';

                if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.ar)
                    matchName.ar += thisMatch.home_team.name.ar;
                else matchName.ar += 'Home team';
                matchName.ar += ' ' + thisMatch.home_score + ' - ' + thisMatch.away_score + ' ';
                if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.ar)
                    matchName.ar += thisMatch.away_team.name.ar;
                else matchName.ar += 'Away team';

                var teamName = { en: teamThatScored === "home_team" ? thisMatch.home_team.name.en : thisMatch.away_team.name.en };


                var msgG1 = {
                    en: `⚽ ${teamName.en} has scored at ${thisMatch.time}' for ${matchName.en}. See if you have won any points!👍`,
                    ar: ` ⚽فريق ${teamName.ar} سجل هدف في الدقيقة ${thisMatch.time} في مباراة ${matchName.en}. هل سجلت أي نقاط؟ لنر! 👍`
                };

                // Send push notification to users that a goal is kicked.
                if (!trnMatch.isHidden && !thisMatch.disabled) {
                    if (sendPushes && pushNotifications && pushNotifications.G1 && userIdsHavingPlayedCard && userIdsHavingPlayedCard.length > 0) {
                        log.info(`[Match module ${thisMatch.name}]: Sending match Goal G1 notification to users: ${_.take(userIdsHavingPlayedCard, 9)}, ...`);
                        MessagingTools.sendPushToUsers(userIdsHavingPlayedCard, msgG1, { "type": "view", "data": { "view": "match", "viewdata": thisMatch.id } }, "goals");
                    }
                }

                return callback(null);
            }
            else {
                log.error(`[Match module ${thisMatch.name}]: Failed to send notifications on match Goal: ${parallelErr.stack}`);
                return callback(parallelErr);
            }
        });
    }


    static Termination(thisMatch, callback) {

        PushNotifications.GetTournamentMatchesForMatches([thisMatch._id], (err, trnMatches) => {
            if (err) {
                log.error(`[Match module ${thisMatch.name}]: Failed to send notifications on match Goal: ${err.stack}`);
                return callback(null);
            }
            else
                async.each(trnMatches, (trnMatch, cbk) => PushNotifications.TerminationForClient(trnMatch.client.id, trnMatch, cbk), callback);
        });
    }


    static TerminationForClient(client, trnMatch, callback) {

        const thisMatch = trnMatch.match;
        let pushNotifications = null;
        let sendPushes = false;
        if (trnMatch.settings && trnMatch.settings.sendPushes !== undefined && trnMatch.settings.sendPushes !== null)
            sendPushes = trnMatch.settings.sendPushes;
        else if (trnMatch.tournament.settings && trnMatch.tournament.settings.sendPushes !== undefined && trnMatch.tournament.settings.sendPushes !== null)
            sendPushes = trnMatch.tournament.settings.sendPushes;
        else if (trnMatch.client.settings && trnMatch.client.settings.sendPushes !== undefined && trnMatch.client.settings.sendPushes !== null)
            sendPushes = trnMatch.client.settings.sendPushes;

        // Check whether the settings allow for a push, else return
        if (!sendPushes)
            return callback(null);


        if (trnMatch.settings && trnMatch.settings.pushNotifications)
            pushNotifications = trnMatch.settings.pushNotifications;
        else if (trnMatch.tournament.settings && trnMatch.tournament.settings.pushNotifications)
            pushNotifications = trnMatch.tournament.settings.pushNotifications;
        else if (trnMatch.client.settings && trnMatch.client.settings.pushNotifications)
            pushNotifications = trnMatch.client.settings.pushNotifications;


        async.parallel([
            (innerCbk) => {
                useractivities.find({ client: client, room: thisMatch.id })
                    .select('user')
                    .exec(innerCbk);
            }
        ], (parallelErr, results) => {
            if (!parallelErr) {
                var userIdsHavingPlayedCard = _.compact(_.map(results[0], 'user'));

                var matchName = { en: '', ar: '' };

                if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.en)
                    matchName.en += thisMatch.home_team.name.en;
                else matchName.en += 'Home team';
                matchName.en += ' ' + thisMatch.home_score + ' - ' + thisMatch.away_score + ' ';
                if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.en)
                    matchName.en += thisMatch.away_team.name.en;
                else matchName.en += 'Away team';

                if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.ar)
                    matchName.ar += thisMatch.home_team.name.ar;
                else matchName.ar += 'Home team';
                matchName.ar += ' ' + thisMatch.home_score + ' - ' + thisMatch.away_score + ' ';
                if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.ar)
                    matchName.ar += thisMatch.away_team.name.ar;
                else matchName.ar += 'Away team';


                var msgG3 = {
                    en: `Full-Time for ${matchName.en}`,
                    ar: `انتهى وقت المباراة ${matchName.ar}`
                };

                // Send push notification to users that the game has ended.
                if (!trnMatch.isHidden && !thisMatch.disabled) {
                    if (sendPushes && pushNotifications && pushNotifications.G3 && userIdsHavingPlayedCard && userIdsHavingPlayedCard.length > 0) {
                        log.info(`Sending match full-time G3 notification to users: ${_.take(userIdsHavingPlayedCard, 9)}, ...`);
                        MessagingTools.sendPushToUsers(userIdsHavingPlayedCard, msgG3, { "type": "view", "data": { "view": "match", "viewdata": thisMatch.id } }, "final_result");
                    }
                }
            }
            else {
                log.error(`[Match module ${thisMatch.name}]: Failed to send notifications on match termination: ${parallelErr.stack}`);
            }

            return callback(null);
        });
    }


    static MatchModuleStartupFailure(thisMatch, error, callback) {
        PushNotifications.GetTournamentMatchesForMatches([thisMatch._id], (err, trnMatches) => {
            if (err) {
                log.error(`[Match module ${thisMatch.name}]: Failed to send notifications on match startup failure: ${err.stack}`);
                return callback(null);
            }
            else {
                MessagingTools.sendPushToAdmins({ en: error.message });

                async.each(trnMatches, (trnMatch, cbk) => PushNotifications.MatchModuleStartupFailureForClient(trnMatch.client.id, trnMatch, error, cbk), callback);
            }
        });
    }


    static MatchModuleStartupFailureForClient(client, trnMatch, error, callback) {

        const thisMatch = trnMatch.match;
        let pushNotifications = null;
        let sendPushes = false;

        if (trnMatch.settings && trnMatch.settings.sendPushes !== undefined && trnMatch.settings.sendPushes !== null)
            sendPushes = trnMatch.settings.sendPushes;
        else if (trnMatch.tournament.settings && trnMatch.tournament.settings.sendPushes !== undefined && trnMatch.tournament.settings.sendPushes !== null)
            sendPushes = trnMatch.tournament.settings.sendPushes;
        else if (trnMatch.client.settings && trnMatch.client.settings.sendPushes !== undefined && trnMatch.client.settings.sendPushes !== null)
            sendPushes = trnMatch.client.settings.sendPushes;


        if (trnMatch.settings && trnMatch.settings.pushNotifications)
            pushNotifications = trnMatch.settings.pushNotifications;
        else if (trnMatch.tournament.settings && trnMatch.tournament.settings.pushNotifications)
            pushNotifications = trnMatch.tournament.settings.pushNotifications;
        else if (trnMatch.client.settings && trnMatch.client.settings.pushNotifications)
            pushNotifications = trnMatch.client.settings.pushNotifications;


        return async.series([
            (cb) => {
                async.parallel([
                    (cbk) => {
                        useractivities.find({ room: thisMatch.id, cardsPlayed: { $gt: 0 } })
                            .select('user')
                            .exec(cbk);
                    }
                ], (parallelErr, results) => {
                    if (!parallelErr) {
                        var userIdsHavingPlayedCard = _.compact(_.map(results[0], 'user'));

                        var matchName = { en: '', ar: '' };

                        if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.en)
                            matchName.en += thisMatch.home_team.name.en;
                        else matchName.en += 'Home team';
                        matchName.en += ' - ';
                        if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.en)
                            matchName.en += thisMatch.away_team.name.en;
                        else matchName.en += 'Away team';

                        if (thisMatch.home_team && thisMatch.home_team.name && thisMatch.home_team.name.ar)
                            matchName.ar += thisMatch.home_team.name.ar;
                        else matchName.ar += 'Home team';
                        matchName.ar += ' - ';
                        if (thisMatch.away_team && thisMatch.away_team.name && thisMatch.away_team.name.ar)
                            matchName.ar += thisMatch.away_team.name.ar;
                        else matchName.ar += 'Away team';

                        var msgTitleW1 = {
                            en: `${matchName.en} postponed`,
                            ar: `تم تأجيل ${matchName.ar}`
                        };
                        var msgTitleW2 = {
                            en: `${matchName.en} not available`,
                            ar: `${matchName.ar} غير متاحة`
                        };

                        var msgW1 = {
                            en: `️Oh no! ${matchName.en} has been postponed, 😞 & will not be available to play. All played cards will be cancelled 🙅`,
                            ar: `️للأسف لا! تم تأجيل ${matchName.ar}  ، ولن يكون متاحًا للعب😞. سيتم إلغاء جميع بطاقات اللعب 🙅`
                        };
                        var msgW2 = {
                            en: `Unfortunately we cannot provide ${matchName.en} due to technical issues 🤦. All played cards will be cancelled 🙅`,
                            ar: `لا تفوت فريقك المفضل! مبارةللأسف ، لا يمكننا توفير ${matchName.ar} بسبب المشاكل الفنية 🤦. سيتم إلغاء جميع بطاقات اللعب 🙅`
                        };

                        return async.parallel([
                            (innerCb) => {
                                if (trnMatch.isHidden || thisMatch.disabled || !error.errorCode || _.indexOf([1001, 1002], error.errorCode) === -1)
                                    return innerCb(null);

                                const msg = error.errorCode === 1001 ? msgW1 : msgW2;
                                const msgTitle = error.errorCode === 1001 ? msgTitleW1 : msgTitleW2;
                                MessagingTools.SendMessageToInbox({
                                    recipients: userIdsHavingPlayedCard,
                                    message: true,
                                    msg: msg,
                                    title: msgTitle
                                }, innerCb);
                            },
                            (innerCb) => {
                                // Send push notification to users that the game has started.
                                if (!trnMatch.isHidden || !thisMatch.disabled) {
                                    if (error.errorCode === 1001 && sendPushes && pushNotifications && pushNotifications.W1 && userIdsHavingPlayedCard && userIdsHavingPlayedCard.length > 0) {
                                        log.info(`[Match module ${thisMatch.name}]: Sending match warning (error) W1 notification to users: ${_.take(userIdsHavingPlayedCard, 9)}, ...`);
                                        MessagingTools.sendPushToUsers(userIdsHavingPlayedCard, msgW1, { "type": "view", "data": { "view": "match", "viewdata": thisMatch.id } }, "all");
                                    }
                                    if (error.errorCode === 1002 && sendPushes && pushNotifications && pushNotifications.W2 && userIdsHavingPlayedCard && userIdsHavingPlayedCard.length > 0) {
                                        log.info(`[Match module ${thisMatch.name}]: Sending match warning (error) W2 notification to users: ${_.take(userIdsHavingPlayedCard, 9)}, ...`);
                                        MessagingTools.sendPushToUsers(userIdsHavingPlayedCard, msgW2, { "type": "view", "data": { "view": "match", "viewdata": thisMatch.id } }, "all");
                                    }
                                }

                                return innerCb(null);
                            }

                        ], (pErr, pResults) => {
                            if (pErr)
                                log.error(`[Match module ${thisMatch.name}] Error in sending error notifications on match start: ${pErr.stack}`);

                            if (pResults && pResults[0]) {
                                log.info(`[Match module ${thisMatch.name}] Sent in-app message about match ${matchName.en} starting unavailability to ${userIdsHavingPlayedCard.length} users having played a card: ${error.errorCode === 1001 ? JSON.stringify(msgW1) : JSON.stringify(msgW2)}`);
                            }
                            return cb(null);
                        });
                    }
                    else {
                        log.error(`[Match module ${thisMatch.name}] Failed to send error notifications on match start: ${parallelErr.stack}`);
                        return cb(null);
                    }
                });
            },
            // Disable match if not disabled already

            // ToDo: Resume again before deploying in PRODUCTION !!!!!!

            //(cb) => {
            //    return tournamentMatches.findOneAndUpdate({ _id: trnMatch._id }, { isHidden: true }).exec(cb);
            //}
        ], () => {
            return callback(error);
        });
    }
}

module.exports = PushNotifications;