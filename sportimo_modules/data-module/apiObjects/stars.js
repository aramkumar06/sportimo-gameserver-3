var mongoose = require('mongoose'),
    _ = require('lodash'),
    Stars = mongoose.models.trn_stars,
    Leaderboards = mongoose.models.trn_leaderboard_defs,
  api = {};

// ALL
api.getAll = function (clientId, cb) {
    var q = Stars.findOne({ client: clientId, user: { $ne: null } });
    q.populate('users.user', { username: 1, level: 1, picture: 1 });

    return q.exec(function (err, starsDoc) {
        if (!starsDoc)
            cbf(cb, err, []);

        cbf(cb, err, starsDoc.users);
    });
};


api.getCustomFinishedPools = function (clientId, cb) {

    const now = new Date();
    return Leaderboards.find({
        client: clientId,
        ends: { $lt: now },
        starsprocessed: { $ne: true }
    })
    .populate({ path: 'tournament', match: { client: clientId, state: 'completed', select: 'titleText endToDate' } })
    .exec((err, leaderboardResults) => {
        if (err)
            return cb(err);

        const cleanResults = _.filter(leaderboardResults, (l) => !!l.tournament);
        return cb(null, cleanResults);
    });
};


api.updateFromAllPools = function (clientId, cb) {

    const leaderboardApi = require('./leaderboard');
    const User = mongoose.models.users;
    let existingStars = [];
    let usersWithAchievements = [];
    let finishedPools = null;
    const now = new Date();
    const nowString = `${now.getUTCDate()}/${now.getUTCMonth() + 1}/${now.getUTCFullYear()}`;
    const rankStringMapping = {
        'en': 'Rank',
        'ar': 'لترتيب '
    };
    const achievementString = {
        "en": "Completed all Achievements",
        "ar": "إتمام جميع الإنجازات"
    };

    async.waterfall([
        (cbk) => api.getAll(clientId, cbk),
        (stars, cbk) => {

            if (stars)
                existingStars = _.filter(stars, (s) => !!s.user);
            return api.getCustomFinishedPools(clientId, cbk);
        },
        (pools, cbk) => {
            finishedPools = pools;

            if (!pools || pools.length === 0)
                return cbk(null, null);

            async.map(pools, (pool, innerCbk) => {
                const poolClone = pool.toObject();
                //poolClone.bestscores = 3;
                return leaderboardApi.getTournamentLeaders(poolClone.client, poolClone.tournament, innerCbk);
            }, cbk);
        },
        (newLeadersArray, cbk) => {
            User.find({
                'achievements.0.completed': true,
                'achievements.1.completed': true,
                'achievements.2.completed': true,
                'achievements.3.completed': true,
                'achievements.4.completed': true,
                'achievements.5.completed': true,
                'achievements.6.completed': true
            }, 'username level picture', (err, users) => {
                if (err)
                    return cbk(err);

                usersWithAchievements = users;
                return cbk(null, newLeadersArray);
            });
        },
        (newLeadersArray, cbk) => {
            if (!newLeadersArray || newLeadersArray.length === 0)
                return cbk(null, null);

            _.forEach(newLeadersArray, (newLeaders, arrayIndex) => {

                const pool = finishedPools[arrayIndex];
                _.forEach(_.take(newLeaders, 3), (leader, rankIndex) => {

                    const starUser = _.find(existingStars, (star) => {
                        return star.user && star.user.id && star.user.id === leader._id;
                    });
                    let textModified = {};
                    let poolEndsString = nowString;

                    if (pool) {
                        _.forEach(pool.title, (value, key) => {
                            const rankString = rankStringMapping[key] || rankStringMapping['en'];
                            textModified[key] = `${rankString} #${rankIndex + 1}, ${value}`;
                        });

                        // Mark the pool as processed in order not to include it next time in the star updating process
                        pool.starsprocessed = true;
                        poolEndsString = `${pool.ends.getUTCDate()}/${pool.ends.getUTCMonth() + 1}/${pool.ends.getUTCFullYear()}`;
                    }

                    if (starUser) {
                        // Confirm that this pool id does not already exist in the starUser's titles
                        if (_.indexOf(_.map(starUser.titles, 'pool'), pool.id) === -1)
                            starUser.titles.push({
                                pool: pool ? pool.id : null,
                                iconUrl: rankIndex === 0 ? 'star_1st' : (rankIndex === 1 ? 'star_2nd' : 'star_3rd'),
                                date: poolEndsString,
                                endDate: pool.ends,
                                text: textModified
                            });
                    }
                    else {
                        existingStars.push(new Stars({
                            client: clientId,
                            user: new User(leader),
                            titles: [{
                                pool: pool ? pool.id : null,
                                iconUrl: rankIndex === 0 ? 'star_1st' : (rankIndex === 1 ? 'star_2nd' : 'star_3rd'),
                                date: poolEndsString,
                                endDate: pool.ends,
                                text: textModified
                            }]
                        }));
                    }
                });
            });

            // Save existing pools
            return async.map(finishedPools, (pool, innerCbk) => pool.save(innerCbk), cbk);
        },
        (poolResult, cbk) => {
            // Even if no new pools are found, regenerate rank order of existingStars
            //if (!poolResult)
            //    return cbk(null);

            // Check all achievements and update where appropriate
            const userAchievements = _.keyBy(usersWithAchievements, (u) => u.id);
            const userAchievementsAllUserIds = _.keys(userAchievements);
            const userAchievementsExistingUserIds = [];
            _.forEach(existingStars, (s) => {
                const userHasAllAchievements = userAchievements[s.user.id];
                if (userHasAllAchievements) {
                    userAchievementsExistingUserIds.push(s.user.id);
                    // Check if this star exists already
                    const allTitleImages = _.map(s.titles, 'iconUrl');
                    if (_.indexOf(allTitleImages, 'star_achievement') === -1) {
                        // Add it
                        s.titles.push({
                            pool: null,
                            iconUrl: 'star_achievement',
                            date: nowString,
                            endDate: now,
                            text: achievementString
                        });
                    }
                }
            });

            // Find and add all users having all achievements but not included in the existingStars list yet
            const userAchievementsLackingUserIds = _.difference(userAchievementsAllUserIds, userAchievementsExistingUserIds);
            _.forEach(userAchievementsLackingUserIds, (userId) => {
                const user = userAchievements[userId];
                existingStars.push(new Stars({
                    user: user,
                    titles: [{
                        pool: null,
                        iconUrl: 'star_achievement',
                        date: nowString,
                        endDate: now,
                        text: achievementString
                    }]
                }));
            });

            // Set rank field of existingStars by number of stars, date desc
            _.forEach(existingStars, (s) => {
                s.starsCount = s.titles.length;
                s.lastStarDate = _.max(_.map(s.titles, 'endDate'));
            });
            existingStars = _.orderBy(existingStars, ['starsCount', 'lastStarDate'], ['desc', 'desc']);
            _.forEach(existingStars, (s, index) => {
                s.rank = index + 1;
            });

            // Save existing (and new) stars
            return async.map(existingStars, (star, innerCbk) => star.save(innerCbk), cbk);
        }
    ], cb);
};

/*
// CREATE
api.add = function (item, cb) {

    if (!item) {
        cb('Invalid star user data.');
    }

    star = new Stars(item);

    star.save((err, saved) => {
        cbf(cb, err, saved.toObject());
    });
};

// UPDATE
api.update = function (id, updateData, cb) {
    Stars.findByIdAndUpdate(id, updateData, function (err, update) {
      cbf(cb, err, update.toObject());
  });// eo achievement.find
};

// DELETE
api.remove = function (id, cb) {
    return Stars.findById(id, function (err, item) {
        if (item)
            return item.remove(function (err) {
            cbf(cb, err, true);
        });
    else
      cbf(cb, err, true);
  });
};
*/

// Helper callback method
var cbf = function (cb, err, data) {
  if (cb && typeof (cb) == 'function') {
    if (err) cb(err);
    else cb(false, data);
  }
};



module.exports = api;