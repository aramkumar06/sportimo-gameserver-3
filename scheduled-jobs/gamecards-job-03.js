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
    const job = new GenericJob('User gamecards activation', true, false);

    // Job initialization and execution
    async.waterfall([
        cbk => job.entryPoint(cbk),
        (connectionResults, cbk) => {
            const UserGamecard = require('../sportimo_modules/models/trn_user_card');
            const itsNow = new Date();

            // Update all user gamecards that have passed from their pending state into activation
            return UserGamecard.updateMany({ status: 0, activationTime: { $lt: itsNow } }, { $set: { status: 1 } }, cbk);
        }
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