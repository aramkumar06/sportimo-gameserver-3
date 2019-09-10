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
    const job = new GenericJob('Tournament details cache generation', true, false);

    // Job initialization and execution
    async.waterfall([
        cbk => job.entryPoint(cbk),
        (connectionResults, cbk) => {
            const TournamentLogic = require('../sportimo_modules/data-module/apiObjects/tournament');

            return TournamentLogic.regenerateTournamentCache(cbk);
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