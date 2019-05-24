var mongoose = require('mongoose'),
    _ = require('lodash'),
    async = require('async'),
    logger = require('winston');

//var MessagingTools = require.main.require('./sportimo_modules/messaging-tools');
var MessagingTools = require('../messaging-tools');

Handler = { Reward: {} };

/**
 * Achievement: persist_gamer
 * This achievement rewards players when they are active at the end of the game.
 *  @param {String} matchid the (scheduled) match id for which users present till the match end will be marked as persistent
 *  @param {Function} callback the calback function to call at the end
 */
Handler.Reward.persist_gamer = function (matchid, callback) {
    mongoose.models.trn_user_activities.find({ room: matchid, isPresent: true })
        .exec(function (err, userActivities) {
            if (!userActivities) {
                if (callback)
                    return callback(null);
                else
                    return;
            }

            async.eachLimit(userActivities, 500, (userActivity, cbk) => {
                return mongoose.models.users.addAchievementPoint(userActivity.user, { uniqueid: 'persist_gamer', value: 1 }, cbk);
            }, () => {
                if (callback)
                    callback(null);
                else
                    return;
            });
        });
};



/**
 * Achievement: update_achievement
 * This method updates the current achievement points for a specific user achievement in the user document
 *  @param {String} userId the user id
 *  @param {String} achievementUId the id of the pertinent achievement document in the achievements collection
 *  @param {Number} achievementQuantity how many achievements the user has completed
 *  @param {Function} callback the calback function to call at the end
 *  @returns {null} nothing special
 */
Handler.Reward.update_achievement = function (userId, achievementUId, achievementQuantity, callback) {
    return mongoose.models.users.addAchievementPoint(userId, { uniqueid: achievementUId, value: achievementQuantity }, callback);
};


/**
 * Achievement: rank_achievements
 * This method rewards players for their rank position
 *  
 * @param {String} matchid the (scheduled match) id
 * @param {Function} outerCallback a callback function
 */
Handler.Reward.rank_achievements = function (matchid, outerCallback) {

    console.log("Calculating and sending rank achievements");
    const Leaderboard = require('../data-module/apiObjects/leaderboard');

    // get all tournament matches, along with their referenced tournaments

    async.waterfall([
        (cbk) => {
            return mongoose.models.trn_matches.find({ match: matchid })
                .populate({ path: 'tournament', match: { state: 'active' } })
                .populate('leaderboardDefinition')
                .populate({ path: 'match', select: '-stats -timeline', populate: [{ path: 'home_team', select: 'name' }, { path: 'away_team', select: 'name' }] })
                .exec(cbk);
        },
        (trnMatches, cbk) => {
            const eligibleTrnMatches = _.filter(trnMatches, (tm) => !(!tm.match || !tm.tournament));

            if (!eligibleTrnMatches || eligibleTrnMatches.length === 0)
                return cbk(null);

            async.each(eligibleTrnMatches, (trnMatch, trnCbk) => {

                const match = trnMatch.match;

                // Determine the match name
                let matchName = { en: '', ar: '' };

                if (match.home_team && match.home_team.name && match.home_team.name.en)
                    matchName.en += match.home_team.name.en;
                else matchName.en += 'Home team';
                matchName.en += ' ' + match.home_score + ' - ' + match.away_score + ' ';
                if (match.away_team && match.away_team.name && match.away_team.name.en)
                    matchName.en += match.away_team.name.en;
                else matchName.en += 'Away team';

                if (match.home_team && match.home_team.name && match.home_team.name.ar)
                    matchName.ar += match.home_team.name.ar;
                else matchName.ar += 'Home team';
                matchName.ar += ' ' + match.home_score + ' - ' + match.away_score + ' ';
                if (match.away_team && match.away_team.name && match.away_team.name.ar)
                    matchName.ar += match.away_team.name.ar;
                else matchName.ar += 'Away team';


                async.waterfall([
                    (innerCbk) => Leaderboard.getMatchLeaders(trnMatch.client, trnMatch.tournament, trnMatch.id, innerCbk),
                    (leaders, innerCbk) => {

                        // What if leaders is empty, when there is no match leaderboard set?

                        let top1s = [];
                        let top10s = [];
                        let top100s = [];
                        let loosers = [];

                        async.eachOfLimit(leaders, 100, (leader, leaderIndex, innermostCbk) => {
                            // Update Best Rank for User
                            mongoose.models.users.updateRank(leader._id, { rank: (leaderIndex + 1), matchid: matchid }, function (err, result) {
                                if (err) {
                                    console.log(err);
                                }
                                else {
                                    if (leaderIndex === 0 && user.score > 0) {
                                        //MessagingTools.sendPushToUsers(user.user_id, { en: `Congratulation!\n You ranked #${leaderIndex + 1} and won ${user.score} points` }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                        top1s.push(user.user_id.toString());
                                    }
                                    if (leaderIndex > 0 && leaderIndex < 10 && user.score > 0) {
                                        //MessagingTools.sendPushToUsers(user.user_id, { en: `Congratulation!\n You ranked #${leaderIndex + 1} and won ${user.score} points` }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                        top10s.push(user.user_id.toString());
                                    }
                                    if (leaderIndex >= 10 && leaderIndex < 100 && user.score > 0) {
                                        //MessagingTools.sendPushToUsers(user.user_id, { en: `You ranked #${leaderIndex + 1} and won ${user.score} points` }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                        top100s.push(user.user_id.toString());
                                    }
                                    if (leaderIndex >= 100 && user.score > 0) {
                                        //MessagingTools.sendPushToUsers(user.user_id, { en: `You won ${user.score} points` }, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "all");
                                        loosers.push(user.user_id.toString());
                                    }

                                    if (leaderIndex >= 0 && leaderIndex < 3 && user.score > 0) {
                                        var msgG5 = {
                                            en: `Congrats! You ranked #${leaderIndex + 1} and won ${user.score} points in ${matchName.en}`,
                                            ar: `مبروك!
أنت في المرتبة ${leaderIndex + 1}  وقد كسبت ${user.score} نقطة في مباراة ${matchName.ar}`
                                        };

                                        // Send push notification to users with their rank and score.
                                        if (!trnMatch.isHidden && !match.disabled) {
                                            if (pushNotifications && pushNotifications.G5) {
                                                logger.log('info', `[${matchName.en}]: Sending leaderboard G5 notification to user: ${user.user_id}`);
                                                MessagingTools.sendPushToUsers([user.user_id], msgG5, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "final_result");
                                            }
                                        }
                                    }
                                    if (leaderIndex > 2 && leaderIndex < 10 && user.score > 0) {
                                        var msgG6 = {
                                            en: `You ranked #${leaderIndex + 1} and won ${user.score} points in ${matchName.en}`,
                                            ar: `أنت في المرتبة ${leaderIndex + 1}  وقد كسبت ${user.score} نقطة في مباراة ${matchName.ar}`
                                        };

                                        // Send push notification to users with their rank and score.
                                        if (!trnMatch.isHidden && !match.disabled) {
                                            if (pushNotifications && pushNotifications.G6) {
                                                logger.log('info', `[${matchName.en}]: Sending leaderboard G6 notification to user: ${user.user_id}`);
                                                MessagingTools.sendPushToUsers([user.user_id], msgG6, { "type": "view", "data": { "view": "match", "viewdata": matchid } }, "final_result");
                                            }
                                        }
                                    }
                                }


                                return innermostCbk(null);
                            });
                        }, (leadersErr) => {
                            if (leadersErr) {
                                logger.error(`Error while calculating the rank achievements after the match ${trnMatch.match.name}: ${leadersErr.stack}`);
                            }
                            return innerCbk(null, top1s, top10s, top100s, loosers);
                        });
                    },
                    (top1s, top10s, top100s, loosers, innerCbk) => {

                        var concat10s = _.concat(top1s, top10s);
                        var concat100s = _.concat(concat10s, top100s);

                        async.parallel([
                            (pcbk) => {

                                if (top1s.length > 0) {
                                    async.eachLimit(top1s, 500, function (userId, innerpCbk) {
                                        return mongoose.models.users.addAchievementPoint(userId, { uniqueid: 'mike_drop', value: 1 }, innerpCbk);
                                    }, pcbk);
                                }
                                else
                                    return async.setImmediate(() => { pcbk(null); });
                            },
                            (pcbk) => {

                                if (concat10s.length > 0) {
                                    async.eachLimit(concat10s, 500, function (userId, innerpCbk) {
                                        return mongoose.models.users.addAchievementPoint(userId, { uniqueid: 'top_10', value: 1 }, innerpCbk);
                                    }, pcbk);
                                }
                                else
                                    return async.setImmediate(() => { pcbk(null); });
                            },
                            (pcbk) => {

                                if (concat100s.length > 0) {
                                    async.eachLimit(concat100s, 500, function (userId, innerpCbk) {
                                        return mongoose.models.users.addAchievementPoint(userId, { uniqueid: 'top_100', value: 1 }, innerpCbk);
                                    }, pcbk);
                                }
                                else
                                    return async.setImmediate(() => { pcbk(null); });
                            }
                            //(pcbk) => {

                            //    if (loosers.length > 0)
                            //        async.eachLimit(loosers, 500, function (userId, innerpCbk) {
                            //            return mongoose.models.users.addAchievementPoint(userId, { uniqueid: 'loosers_reward', value: 1 }, innerpCbk);
                            //        }, pcbk);
                            //    else
                            //        return async.setImmediate(() => { pcbk(null); });
                            //}
                        ], innerCbk);

                    }
                ], trnCbk);

            }, cbk);
        }
    ], outerCallback);

};


module.exports = Handler;
