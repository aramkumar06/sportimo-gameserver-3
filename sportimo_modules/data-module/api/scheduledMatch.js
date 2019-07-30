var express = require('express'),
    router = express.Router(),
    mongoose = require('mongoose'),
    ObjectId = mongoose.Types.ObjectId,
    scheduledMatches = require('../../models/scheduled-matches'),
    matchfeedStatuses = require('../../models/matchfeedStatus'),
    teams = require('../../models/team'),
    trnTeams = mongoose.models.trn_teams,
    trnMatches = mongoose.models.trn_matches,
    trnCompetitionSeasons = mongoose.models.trn_competition_seasons,
    matches = mongoose.models.matches,
    defaultMatch = require('../config/empty-match'),
    logger = require('winston'),
    async = require('async'),
    _ = require('lodash');




const findReplayableMatches = function (competitionId, callback) {


    let matchCandidates = [];
    let competitionSeasons = [];

    async.waterfall([
        (cbk) => {

            const query = { completed: true };
            if (competitionId)
                query.competition = competitionId;
            async.parallel([
                icbk => scheduledMatches.find(query, { timeline: 0, stats: 0 })
                    .populate('home_team away_team')
                    .exec(icbk),
                icbk => trnCompetitionSeasons.find({ status: 'Active' }, '-teams').populate('competition', 'name logo').exec(icbk)
            ], cbk);
        },
        (parallelResults, cbk) => {

            matchCandidates = parallelResults[0];
            competitionSeasons = parallelResults[1];
            const matchIds = _.map(parallelResults[0], i => i.id);
            const query = { 'diffed_events.Statscore': { $ne: null } };
            if (matchIds.length > 0)
                query.matchid = { $in: matchIds };
            matchfeedStatuses.find(query, { matchid: 1 }, cbk);
        },
        (matchedFeeds, cbk) => {

            // Find teams by their Statscore id
            const teamParserIds = [];
            matchCandidates = matchCandidates.filter(elem => !!matchedFeeds.find(f => f.matchid === elem.id));
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

                const competitions = _.uniq(_.map(competitionSeasons, s => s.competition));
                const filteredMatches = _.filter(matchCandidates, m => {
                    if (!m.home_team || !m.home_team.parserids || !m.home_team.parserids.Statscore)
                        return false;
                    if (!m.away_team || !m.away_team.parserids || !m.away_team.parserids.Statscore)
                        return false;
                    if (!m.competition)
                        return false;
                    const foundCompetition = _.find(competitions, c => c.id === m.competition);
                    if (!foundCompetition)
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

                    // Replace with updated team objects
                    match.home_team = newHomeTeam;
                    match.away_team = newAwayTeam;
                    // Initialize match properties
                    match.timeline = [];
                    match.stats = [];
                    match.home_score = 0;
                    match.away_score = 0;
                    match.state = 0;
                    match.time = 1;
                    match.disabled = false;
                    match.completed = false;

                    let matchDto = match.toObject();
                    delete matchDto._id;

                    const matchedFeed = matchedFeeds.find(f => f.matchid === m.id);
                    if (matchDto.moderation && matchDto.moderation.length > 0) {
                        matchDto.moderation.forEach(m => m.simulatedfeed = matchedFeed.id);
                    }

                    const foundCompetition = _.find(competitions, c => c.id === m.competition);
                    if (foundCompetition)
                        matchDto.competition = foundCompetition;
                    matchDto.season = _.omit(_.find(competitionSeasons, s => s.competition.id === m.competition), ['competition']);

                    return matchDto;
                });

                return cbk(null, mappedMatches);
            });
        }
    ], callback);
};


router.get('/v1/data/schedule-replay', (req, res) => {

    findReplayableMatches(null, (err, matches) => {
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

