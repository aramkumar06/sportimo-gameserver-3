/* This is a job that looks for a finished custom leaderboard (pool) and updates the stars document with users in the top 3 places */

'use strict';
const   mongoCreds = require('./config/mongoConfig'),
    mongoose = require('mongoose'),
    async = require('async');


// Define module logic in the following method:
const starsUpdater = function () {

    const environment = process.env.NODE_ENV;
    const mongoConnection = 'mongodb://' + mongoCreds[environment].user + ':' + mongoCreds[environment].password + '@' + mongoCreds[environment].url;

    mongoose.Promise = global.Promise;

    mongoose.connect(mongoConnection, function (err, res) {
        if (err) {
            console.log('ERROR connecting to: ' + mongoConnection + '. ' + err);
            process.exit(1);
        }

        // Load all required models in mongoose
        const starModel = require('./sportimo_modules/models/trn_star');
        const poolModel = require('./sportimo_modules/models/trn_leaderboard_def');
        const userModel = require('./sportimo_modules/models/user');
        const scoreModel = require('./sportimo_modules/models/trn_score');
        const clientModel = require('./sportimo_modules/models/trn_client');


        // Require the stars logic that will run the job logic
        const stars = require('./sportimo_modules/data-module/apiObjects/stars');


        async.waterfall([
            (cbk) => clientModel.find({}, cbk),
            (clients, cbk) => {
                async.eachSeries(clients, (client, cb) => {
                    console.log(`Starting Sportimo Stars updating procedure for client ${client.name}(${client.id}).`);
                    const startDate = new Date();
                    stars.updateFromAllPools(client.id, (error, results) => {
                        if (error) {
                            console.error(error);
                        }
                        else {
                            const endDate = new Date();
                            console.log(`Terminating Sportimo Stars update for client ${client.name}(${client.id}), with ${results.length} star users in ${(endDate - startDate) / 1000.0} seconds.`);
                        }

                        cb(null, results);
                    });
                }, cbk);
            }
        ], (error) => {
            if (error)
                return process.exit(2);

            return process.exit(0);
        });

    });
};


// Execute the main module function

try {
    starsUpdater();
}
catch (error) {
    console.error(error);
}