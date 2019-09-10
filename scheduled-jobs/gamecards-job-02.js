'use strict';

/*
import { GenericJob } from ('./generic-job');
import async from 'async';
*/

const GenericJob = require('./generic-job');
const async = require('async');

try {

    // -- Job instantiation --
    // First argument: job name
    // Second argument: true if the job needs MongoDB connection, false otherwise
    // Third argument: true if the job needs Redis connection, false otherwise
    const job = new GenericJob('Special cards activation', true, false);

    // Job initialization and execution
    async.waterfall([
        cbk => job.entryPoint(cbk),
        (connectionResults, cbk) => {
            const UserGamecard = require('../sportimo_modules/models/trn_user_card');
            const itsNow = new Date();

            // Update all special gamecards (power-ups) still in play that should be activated
            UserGamecard.find({ status: 1, $or: [{ 'specials.DoublePoints.status': 1, 'specials.DoublePoints.activationTime': { $lt: itsNow } }, { 'specials.DoubleTime.status': 1, 'specials.DoubleTime.activationTime': { $lt: itsNow } }] }).limit(10000).exec(function (error, userGamecards) {
                if (error)
                    return cbk(error);

                return async.eachLimit(userGamecards, 1000, function (userGamecard, icbk) {
                    let keys = ['DoublePoints', 'DoubleTime'];
                    let special = null;
                    let specialKey = null;
                    _.forEach(keys, function (key) {
                        if (userGamecard.specials[key].status == 1 && userGamecard.specials[key].activationTime < itsNow) {
                            special = userGamecard.specials[key];
                            specialKey = key;
                        }
                    });

                    special.status = 2;

                    if (specialKey && specialKey == 'DoublePoints') {
                        if (userGamecard.cardType == "Instant" || userGamecard.cardType == 'PresetInstant') {
                            userGamecard.startPoints = userGamecard.startPoints * 2;
                            userGamecard.endPoints = userGamecard.endPoints * 2;
                        }
                        else
                            userGamecard.startPoints = userGamecard.startPoints * 2;

                        userGamecard.isDoublePoints = true;
                    }
                    if (specialKey && specialKey == 'DoubleTime') {
                        if (userGamecard.duration) {
                            if (userGamecard.terminationTime)
                                userGamecard.terminationTime = moment.utc(userGamecard.terminationTime).clone().add(userGamecard.duration, 'ms').toDate();
                            userGamecard.duration = userGamecard.duration * 2;

                            userGamecard.isDoubleTime = true;
                        }
                    }

                    return userGamecard.save(icbk);

                }, cbk);
            });        }
    ], (err, results) => {

        if (err) {
            job.abort(err);
        }
        else
            job.terminate();
    });

}
catch (err) {
    console.error(err);
    process.exit();
}