// Module dependencies.
var express = require('express'),
    router = express.Router(),
    TeamStats = require('../apiObjects/teamStats'),
    logger = require('winston');


// GET team stats for a specific season
router.get('/v1/data/teamstats/team/:teamid/season/:seasonid', (req, res) => {

    const teamId = req.params.teamid;
    const seasonId = req.params.seasonid;

    if (!teamId || !seasonId)
        return res.status(400).json({ statusCode: 400, message: 'Bad request parameters' });

    TeamStats.getForSeason(teamId, seasonId, (err, data) => {
        if (err) {
            logger.error(`Failed to get team stats for team ${teamId} and season ${seasonId}: ${err.stack}`);
            return res.status(500).json({ message: err.message, statusCode: 500 });
        }

        return res.json(data);
    });
});

// PUT - update stats for a specific season
router.put('/v1/data/teamstats/:id', (req, res) => {

    const teamStats = req.body;
    if (!teamStats || !teamStats._id || teamStats._id !== req.params.id)
        return res.status(400).json({ statusCode: 400, message: 'Bad request body' });

    TeamStats.update(req.params.id, teamStats, (err, data) => {
        if (err) {
            logger.error(`Failed to update team stats: ${err.stack}`);
            return res.status(err.statusCode || 500).json({ message: err.message, statusCode: err.statusCode || 500 });
        }

        return res.json(data);
    });

});

// POST - create stats for a specific season
router.post('/v1/data/teamstats', (req, res) => {
    const teamStats = req.body;
    if (!teamStats)
        return res.status(400).json({ statusCode: 400, message: 'Bad request body' });

    TeamStats.create(teamStats, (err, data) => {
        if (err) {
            logger.error(`Failed to create team stats: ${err.stack}`);
            return res.status(err.statusCode || 500).json({ message: err.message, statusCode: err.statusCode || 500 });
        }

        return res.json(data);
    });
});

module.exports = router;