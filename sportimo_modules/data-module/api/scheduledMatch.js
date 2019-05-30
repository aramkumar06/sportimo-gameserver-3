﻿var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    ObjectId = mongoose.Types.ObjectId,
    scheduledMatches = require('../../models/scheduled-matches'),
    matchfeedStatuses = require('../../models/matchfeedStatus'),
    teams = require('../../models/team'),
    trnTeams = mongoose.models.trn_teams,
    trnMatches = mongoose.models.trn_matches,
    matches = mongoose.models.matches,
    defaultMatch = require('../config/empty-match'),
    logger = require('winston'),
    async = require('async'),
    _ = require('lodash');




const findReplayableMatches = function (competitionId, callback) {

    async.waterfall([
        cbk => matchfeedStatuses.find({ 'diffed_events.Statscore': { $ne: null } }, { matchid: true }, cbk),
        (feeds, cbk) => {
            const matchObjectIds = _.map(feeds, i => new ObjectId(i.matchid));
            const query = { _id: { $in: matchObjectIds }, completed: true };
            if (competitionId)
                query.competition = competitionId;
            return scheduledMatches.find(query, { timeline: 0, _id: 0 })
                .populate('home_team away_team')
                .exec(cbk);
        },
        (matchCandidates, cbk) => {
            // Find teams by their Statscore id
            const teamParserIds = [];
            matchCandidates.forEach(m => {
                if (m.home_team && m.home_team.parserids && m.home_team.parserids['Statscore'])
                    teamParserIds.push(m.home_team.parserids['Statscore']);
                if (m.away_team && m.away_team.parserids && m.away_team.parserids['Statscore'])
                    teamParserIds.push(m.away_team.parserids['Statscore']);
            });
            trnTeams.find({ 'parserids.Statscore': { $in: teamParserIds } }, (err, teams) => {
                if (err)
                    return cbk(err);

                const teamParserIdMap = _.keyBy(teams, t => t.parserids.Statscore);

                const filteredMatches = _.filter(matchCandidates, m => {
                    if (!m.home_team || !m.home_team.parserids || !m.home_team.parserids.Statscore)
                        return false;
                    if (!m.away_team || !m.away_team.parserids || !m.away_team.parserids.Statscore)
                        return false;

                    const newHomeTeam = teamParserIdMap[m.home_team.parserids.Statscore];
                    if (!newHomeTeam)
                        return false;
                    const newAwayTeam = teamParserIdMap[m.away_team.parserids.Statscore];
                    if (!newAwayTeam)
                        return false;

                    return true;
                });

                const mappedMatches = _.map(filteredMatches, m => {
                    const match = new matches(m);
                    const newHomeTeam = teamParserIdMap[m.home_team.parserids.Statscore];
                    const newAwayTeam = teamParserIdMap[m.away_team.parserids.Statscore];

                    match.home_team = newHomeTeam;
                    match.away_team = newAwayTeam;

                    return match;
                });

                return cbk(null, mappedMatches);
            });
        }
    ], callback);
};


router.get('/v1/data/schedule-replay', (req, res) => {

    findReplayableMatches(null, null, (err, matches) => {
        if (err) {
            logger.error(err.stack);
            return res.status(500).json({ error: err.message });
        }

        return res.status(200).json(matches);
    });
});

router.get('/v1/data/schedule-replay/:competitionId', (req, res) => {

    findReplayableMatches(req.params.competitionId, (err, matches) => {
        if (err) {
            logger.error(err.stack);
            return res.status(500).json({ error: err.message });
        }

        return res.status(200).json(matches);
    });
});


module.exports = router;

