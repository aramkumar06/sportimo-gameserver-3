﻿'use strict';


// Module dependencies.
var express = require('express'),
    router = express.Router(),
    _ = require('lodash'),
    async = require('async'),
    grandPrize = require('../../models/trn_grand_prize'),
    leaderboard = require('../apiObjects/leaderboard'),
    logger = require('winston');



// Get all grand prizes
router.get('/v1/data/grand-prizes', (req, res) => {

    const query = {};
    const options = {};

    if (req.query.skip && _.isNumber(req.query.skip)) 
        options.skip = req.query.skip;

    if (req.query.limit && _.isNumber(req.query.limit)) 
        options.limit = req.query.limit;

    if (req.query.client)
        query.client = req.query.client;

    grandPrize.find(query, options).populate('prizes.prize').exec((err, data) => {
        if (err) {
            logger.error(`Error getting all grand prizes: ${err.stack}`);
            return res.status(500).json(err);
        }

        return res.json(data);
    });
});


// Add a new grand prize
router.post('/v1/data/grand-prizes', (req, res) => {

    const newPrize = req.body;

    const objectValidation = ValidateGrandPrize(newPrize);

    if (!objectValidation.success)
        return res.status(400).json({ error: objectValidation.error });

    const newPrizeObj = new grandPrize(newPrize);
    newPrizeObj.save((err, savedPrize) => {
        if (err) {
            logger.error(`Error saving grand prize ${newPrizeObj.toObject()}: ${err.stack}`);
            return res.status(500).json(err);
        }

        return res.json(savedPrize);
    });
});


// Edit a grand prize
router.put('/v1/data/grand-prizes/:prizeId', (req, res) => {

    const prizeToUpdate = req.body;

    const objectValidation = ValidateGrandPrize(prizeToUpdate);

    if (!objectValidation.success)
        return res.status(400).json({ error: objectValidation.error });

    async.waterfall([
        cbk => grandPrize.findById(req.params.prizeId, cbk),
        (prize, cbk) => {
            if (!prize) {
                const err = new Error(`Grand prize ${req.params.prizeId} is not found`);
                err.statusCode = 404;
                return cbk(err);
            }

            prize.client = prizeToUpdate.client;
            prize.titleText = prizeToUpdate.titleText;
            prize.infoText = prizeToUpdate.infoText;
            prize.promoImage = prizeToUpdate.promoImage;
            prize.startFromDate = prizeToUpdate.startFromDate;
            prize.endToDate = prizeToUpdate.endToDate;
            prize.active = prizeToUpdate.active;
            prize.bestscores = prizeToUpdate.bestscores;
            prize.prizes = prizeToUpdate.prizes;

            prize.save(cbk);
        }
    ], (err, data) => {
        if (err) {
            logger.error(`Error saving grand prize ${newPrizeObj.toObject()}: ${err.stack}`);
            return res.status(err.statusCode || 500).json({ error: err.message });
        }

        return res.json(data);
    });
});

// Delete a grand prize
router.delete('/v1/data/grand-prizes/:prizeId', (req, res) => {
    grandPrize.findByIdAndRemove(req.params.prizeId, (err, res) => {
        if (err) {
            logger.error(`Error saving grand prize ${newPrizeObj.toObject()}: ${err.stack}`);
            return res.status(err.statusCode || 500).json({ error: err.message });
        }

        return res.json(res);
    });
});


// Get top leaders for a certain grand prize id
router.get('/v1/data/client/:clientId/grand-prizes/:prizeId/leaders', (req, res) => {

    leaderboard.getGrandPrizeLeaders(req.params.clientId, req.params.prizeId, function (err, data) {
        if (err) {
            logger.error(`Error getting all grand prize ${req.params.clientId} leaders: ${err.stack}`);
            return res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});


// Get all active grand prizes
router.get('/v1/data/client/:clientId/grand-prizes', (req, res) => {

    const now = new Date();

    grandPrize.find({
        client: req.params.clientId,
        active: { $ne: false },
        startFromDate: { $lte: now },
        endToDate: { $gt: now } // maybe comment this one
    })
    .populate('prizes.prize')
    .exec(function (err, data) {
        if (err) {
            logger.error(`Error getting all active grand prizes: ${err.stack}`);
            return res.status(500).json(err);
        } else {
            res.status(200).json(data);
        }
    });
});




//////////////////////////////
// Helper Functions

const ValidateGrandPrize = function (prize) {
    if (!prize)
        return { success: false, error: 'Empty prize' };

    if (!prize.client)
        return { success: false, error: 'Invalid client' };

    if (!prize.titleText)
        return { success: false, error: 'Invalid title' };

    if (!prize.startFromDate || _.isDate(prize.startFromDate))
        return { success: false, error: 'Invalid startFrom date' };

    // Otherwise
    return { success: true, error: null };
};

module.exports = router;