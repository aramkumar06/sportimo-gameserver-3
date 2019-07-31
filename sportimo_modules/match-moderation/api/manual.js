var express = require('express'),
    router = express.Router(),
    log = require('winston'),
    _ = require('lodash'),
    async = require('async');

module.exports = function (ModerationModule) {


    router.post('/v1/live/match', function (req, res) {
        log.info("[Moderation] Request for matchid [" + req.body.id + "]");
        ModerationModule.create(req.body.id, res);
    });

    router.post('/v1/live/match/time', function (req, res) {

        log.info("[Update Segment Time] Request for matchid [" + req.body.id + "]");
        ModerationModule.GetMatch(req.body.id).updateTimes(req.body, function (err, result) {
            if (!err)
                try {
                    var strippedMatch = _.cloneDeep(result);
                    if (strippedMatch.Timers)
                        delete strippedMatch.Timers;
                    if (strippedMatch.services)
                        delete strippedMatch.services;
                    if (!err)
                        return res.send(strippedMatch);
                }
                catch (err) {
                    return res.send(err);
                }
            else
                res.sendStatus(500).send(err);
        });
    });

    router.post('/v1/live/match/time/remove', function (req, res) {

        log.info("[Update Segment Time] Request for matchid [" + req.body.id + "]");
        ModerationModule.GetMatch(req.body.id).removeSegment(req.body, function (err, result) {
            if (!err)
                res.send(result);
            else
                res.sendStatus(500).send(err);
        });
    });

    router.post('/v1/live/match/reload', function (req, res) {
        log.info("[Reload Match] Request for matchid [" + req.body.id + "]");
        ModerationModule.LoadMatchFromDB(req.body.id, function (err, result) {
            if (!err)
                return res.send(result);
            else
                return res.status(500).send(err);
        });
    });


    router.get('/v1/live/match/:id', function (req, res) {

        async.parallel([
            (cbk) => ModerationModule.GetMatch(req.params.id, cbk),
            (cbk) => ModerationModule.GetTournamentMatches(req.params.id, req.query.client, cbk)
        ], (err, parallelResults) => {

            const match = parallelResults[0];
            const tMatches = parallelResults[1];
            try {
                var strippedMatch = _.cloneDeep(match);
                if (strippedMatch.Timers)
                    delete strippedMatch.Timers;
                if (strippedMatch.services)
                    delete strippedMatch.services;

                strippedMatch.tournamentMatches = tMatches;

                // console.log("actual " +strippedMatch.data.moderation[0].start);
                if (!err)
                    return res.send(strippedMatch);
            }
            catch (err) {
                return res.status(500).send(err);
            }
        });
    });

    router.get('/v1/live/tournament-match/:id', function (req, res) {
        ModerationModule.GetTournamentMatch(req.params.id, (err, result) => {
            if (err)
                return res.status(500).json(err);

            ModerationModule.GetTournamentMatches(result.id, null, (err, tMatches) => {
                if (!err)
                    result.tournamentMatch = _.find(tMatches, m => m._id.toHexString() === req.params.id);

                delete result.services;
                delete result.Timers;

                return res.json(result);
            });
        });
    });

    // Set up manual Moderation Routes
    router.get('/v1/moderation/:id/event', function (req, res) {
        res.send("All ok");
    });

    router.get('/v1/moderation/:id/event/reset', function (req, res) {
        ModerationModule.ResetMatch(req.params.id, function (result) {
            res.send(result);
        });
    });

    router.get('/v1/moderation/:id/event/complete', function (req, res) {
        ModerationModule.ToggleMatchComplete(req.params.id, function (result) {
            res.send(result);
        });
    });

    router.get('/v1/moderation/:id/event/release', function (req, res) {
        ModerationModule.ReleaseMatch(req.params.id, function (result) {
            res.send(result);
        });
    });

      router.get('/v1/moderation/:id/event/activate/:state', function (req, res) {
          ModerationModule.ActivateMatch(req.params.id, req.params.state, function (result) {
              res.send(result);
          });
    });
    

    router.post('/v1/moderation/:id/event', function (req, res) {
        const match_id = req.params.id;

        const match = ModerationModule.GetMatch(match_id);
        if (!match) {
            return res.status(404).json({ error: "The event is not found." });
        }

        switch (req.body.type) {
            case "Delete":
                log.info("[moderation-service] Remove Event Request for matchid [" + match_id + "] and event ID [" + req.body.data.id + "]");
                match.RemoveEvent(req.body, function (err, result) {
                    res.status(200).send(result);
                });
                break;
            case "Update":
                log.info("[moderation-service] Update Event Request for matchid [" + match_id + "] and event ID [" + req.body.data.id + "]");
                match.UpdateEvent(req.body, function (err, result) {
                    res.status(200).send(result);
                });
                break;
            case "Add":
                log.info("Add Event Request for matchid [" + match_id + "] with event ID [" + req.body.data.id + "]");
                match.AddEvent(req.body, true, function (err, result) {
                    res.status(200).send(result);
                });
                break;
            case "AdvanceSegment":
                //console.log(req.body);
                log.info("Advance Segment Request for matchid [" + match_id + "]");
                match.AdvanceSegment(req.body, (err, result) => {
                    res.status(200).send(result);
                });
                break;
            case "Terminate":
                //console.log(req.body);
                log.info("Terminate Request for matchid [" + match_id + "]");
                res.status(200).send(match.TerminateMatch());
                break;
            case "SocketMessage":
                //console.log(req.body);
                log.info("Socket Message sent for matchid [" + match_id + "]");
                res.status(200).send(match.SocketMessage(req.body.data));
                break;
            default:
                res.status(500).json({ error: "Event type should be one of 'Add, 'Update', 'Delete', 'AdvanceSegment'" });
        }


    });

    return router;
}
