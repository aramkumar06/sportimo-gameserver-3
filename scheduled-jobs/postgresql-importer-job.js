'use strict';

const async = require('async');
const GenericJob = require('./generic-job');
const PostgresLogic = require('./postgresql-importing-logic');

try {

    // -- Job instantiation --
    // First argument: job name
    // Second argument: true if the job needs MongoDB connection, false otherwise
    // Third argument: true if the job needs Redis connection, false otherwise
    // Fourth argument: true if the job needs PostgreSQL connection, false otherwise
    const job = new GenericJob('PostgreSQL user events importer', true, false, true);

    // Job initialization and execution
    async.waterfall([
        cbk => job.entryPoint(cbk),
        (connectionResults, cbk) => {
            PostgresLogic.Execute(job.postgres, cbk);
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