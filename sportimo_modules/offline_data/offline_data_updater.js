var path = require('path'),
    fs = require('fs');

var http = require('http'),
    express = require('express');

var bodyParser = require('body-parser');
    
var app = null;

try {
    app = require('./../../server').server;
    module.exports = this;

} catch (ex) {
    // Start server
    app = module.exports = exports.app = express();
    var port = process.env.PORT || 3000;
    app.listen(port, function () {
        console.log('Express server listening on port %d in %s mode', port, app.get('env'));
    });
}



app.use(bodyParser.json());

// Recursively add router paths
var apiPath = path.join(__dirname, 'api');
fs.readdirSync(apiPath).forEach(function (file) {
    app.use('/offline_data/', require(apiPath + '/' + file));
});

var mongoose = require('./config/db.js');
// mongoose.mongoose.models. ...
    
var offlineDataUpdater = {};

offlineDataUpdater.Init = function()
{
};

//stats.TestGuruStats(function() {});

var statscore = require('./parsers/Statscore');

var competitionId = "56f4800fe4b02f2226646297";	// Premier League
//var competitionId = "577ec1011916317238fd2f33";	// Germany Bundesliga
//var competitionId = "577ec1381916317238fd2f34";	// Italy serie A
//var competitionId = "577ec1a61916317238fd2f36";	// Spain Liga Primera
//var competitionId = "580b8731971f4ca44b4f63e8";	// Saudi Professional League
//var competitionId = "588a71ec971f4ca44b4f67e0";	// UAE Arabian Gulf League
//var competitionId = "588a7345971f4ca44b4f67e1";	// Egypt Premier League
//var competitionId = "577ec2f71916317238fd2f39";	// Champions League
//var competitionId = "577ec33d1916317238fd2f3a";	// Europa League -- needs Statscore update for 2018-2019
//var competitionId = "5aaf6a958b3e30b41dab995f";	// France League 1
//var competitionId = "577ec22b1916317238fd2f37";	// World Cup 2018
//var competitionId = "5b4c63370807967e35f780e1";	// Africa CAF Champions League
//var competitionId = "5b4c65a80807967e35f780e2";	// World MLS All Star Game
//var competitionId = "5b4c6a450807967e35f780e3";	// Qatar Stars League
//var competitionId = "5b4c6b1c0807967e35f780e4";	// Portugal Liga NOS
//var competitionId = "5b4c6bf20807967e35f780e5";	// Netherlands Eredivisie
//var competitionId = "5b4c6c770807967e35f780e6";	// Germany Supercap
//var competitionId = "5b4c8dd28b3e30b41dacac7a";	// Champions League Qualification
//var competitionId = "5b4c8e3b8b3e30b41dacac7d";	// Europa League Qualification
//var competitionId = "5b5a24448b3e30b41dacb3cf";	// International Champions Cup
//var competitionId = "5b5a36b38b3e30b41dacb3e0";	// UEFA Super Cup
//var competitionId = "5b8f80468b3e30b41dacd016";	// UEFA Nations League
//var competitionId = "5bbd9d4ac7cc110d8f3979e8";	// International Friendlies


var seasonId = null; // default season, get the latest one for the given competition id

if (competitionId) {
    try {
        setTimeout(() => {
            //statscore.UpdateTeamPlayersCareerStats("588a8d890bb50f00feda8dbe", 29362, (err, playersUpdated) => {
            //statscore.TestGuruStats((err) => {
            statscore.UpdateTeams(competitionId, seasonId, (err, result) => {
                //statscore.UpdateAllCompetitionStats(competitionId, 2018, (err, result) => {
                //stats.UpdateAllCompetitionStats(competitionId, 2017, (err, result) => {
                //statscore.UpdateLeagueStandings(null, competitionId, 2018, (err, result) => {
                //statscore.GetCompetitionFixtures(competitionId, 2017, (err, result) => {
                //statscore.GetLeagueSeasonEvents(29860, (err, result) => {
                //statscore.UpdateTeamAndPlayerMappings(competitionId, (err, result) => {
                //statscore.UpdateTeamStatsFull({ id: '1507', seasonid: '29655' }, 136934, 2017, (err, result) => {
                //statscore.UpdatePlayerNamesLocale(competitionId, 'ar', (err, result) => {
                if (err)
                    console.error(err.stack);
                console.log("Operation terminated");
                process.exit(0);
            });
        }, 5000);
    } catch (err) {
        console.error(err);
    }

    //statscore.UpdateLeagueStandings(null, '56f4800fe4b02f2226646297', 2017, function (err) {
    //    if (err)
    //        console.error(err.stack);
    //});
}



//module.exports = offlineDataUpdater;