// v 0.0.1

/*

 Game Server Modular

 Info:
 This servers has the following modules:
 
    Wildcards - This module's purpose is to register playing cards from the clients
    of the Sporimo app and handle timers and scoring.
 
    Notifications - This module's purpose is to register user actions and push notifications
    from the sportimo dashboard. 

    LiveMatches - This module's purpose is to handle active matches.

    Calendar - This module's purpose is to handle matches calendar.


 Copyright (c) Bedbug 2015
 Author: Aris Brink

 Permission is hereby granted, free of charge, to any person obtaining
 a copy of this software and associated documentation files (the
 "Software"), to deal in the Software without restriction, including
 without limitation the rights to use, copy, modify, merge, publish,
 distribute, sublicense, and/or sell copies of the Software, and to
 permit persons to whom the Software is furnished to do so, subject to
 the following conditions:

 The above copyright notice and this permission notice shall be
 included in all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE
 LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION
 WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

 */

var express = require("express"),
    http = require('http'),
    bodyParser = require('body-parser'),
    redis = require('redis'),
    mongoose = require('mongoose'),
    winston = require('winston'),
    settings = require('./models/settings'),
    morgan = require('morgan');


var TestSuite = {
    done: null
};

var app = module.exports = exports.app = express();
var version = "0.9.11";


// Create Server
var server = http.createServer(app);
var port = (process.env.PORT || 3030);
app.listen(port, function (err) {
    if (err)
        console.error(err);

    console.log("------------------------------------------------------------------------------------");
    console.log("-------       Sportimo v3.0 Game Server %s listening on port %d        --------", version, port);
    console.log("-------       Environment: " + process.env.NODE_ENV);
    console.log("------------------------------------------------------------------------------------");
});

/*  Winston Logger Configuration */

var logger = new (winston.Logger)({
    levels: {
        prompt: 6,
        debug: 5,
        info: 4,
        core: 3,
        warn: 1,
        error: 0
    },
    colors: {
        prompt: 'grey',
        debug: 'blue',
        info: 'green',
        core: 'magenta',
        warn: 'yellow',
        error: 'red'
    }
});

logger.add(winston.transports.Console, {
    timestamp: true,
    level: process.env.LOG_LEVEL || 'debug',
    prettyPrint: true,
    colorize: 'level'
});

if (process.env.NODE_ENV === "production") {
    logger.add(winston.transports.File, {
        prettyPrint: true,
        level: 'core',
        silent: false,
        colorize: false,
        timestamp: true,
        filename: 'debug.log',
        maxsize: 40000,
        maxFiles: 10,
        json: false
    });
}


// if (process.env.NODE_ENV == "development") {
//     morgan.token("date-time", function (req, res) { return (new Date()).toISOString() });
//     app.use(morgan(':date-time :method :url :status :response-time ms - :res[content-length]'));
//     app.use(morgan('dev'));
// }
app.get("/crossdomain.xml", onCrossDomainHandler);

function onCrossDomainHandler(req, res) {
    var xml = '<?xml version="1.0"?>\n<!DOCTYPE cross-domain-policy SYSTEM' +
        ' "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">\n<cross-domain-policy>\n';
    xml += '<allow-access-from domain="*" to-ports="*"/>\n';
    xml += '</cross-domain-policy>\n';

    req.setEncoding('utf8');
    res.writeHead(200, {
        'Content-Type': 'text/xml'
    });
    res.end(xml);
}


// Initialize and connect to the Redis datastore
// var redisCreds = {
//     url: 'clingfish.redistogo.com',
//     port: 9307,
//     secret: '075bc004e0e54a4a738c081bf92bc61d',
//     channel: "socketServers"
// };

var initialization = require('./sportimo_modules/messaging-tools/validation');
initialization.validate((err, result) => {
    if (err)
        logger.error('Error in server initialization... exiting.');
});



var redisCreds = require('./config/redisConfig');
var mongoCreds = require('./config/mongoConfig');

var PublishChannel = null;
var SubscribeChannel = null;

try {
    PublishChannel = redis.createClient(process.env.REDIS_URL || "redis://h:pa4daaf32cd319fed3e9889211b048c2dabb1f723531c077e5bc2b8866d1a882e@ec2-63-32-222-217.eu-west-1.compute.amazonaws.com:6469");
    // PublishChannel.auth(redisCreds.secret, function (err) {
    //     if (err) {
    //         console.log(err);
    //     }
    // });

    SubscribeChannel = redis.createClient(process.env.REDIS_URL || "redis://h:pa4daaf32cd319fed3e9889211b048c2dabb1f723531c077e5bc2b8866d1a882e@ec2-63-32-222-217.eu-west-1.compute.amazonaws.com:6469");
    // SubscribeChannel.auth(redisCreds.secret, function (err) {
    //     if (err) {
    //         console.log(err);
    //     }
    // });


    PublishChannel.on("error", function (err) {
        console.error(err);
        console.error(err.stack);
    });

    SubscribeChannel.on("error", function (err) {
        console.error(err);
        console.error(err.stack);
    });

    app.PublishChannel = PublishChannel;


    if (!process.env.NODE_ENV)
        process.env.NODE_ENV = "development";


    //var airbrake;
    //if (process.env.NODE_ENV == "development") {
    //    airbrake = require('airbrake').createClient(
    //        '156316', // Project ID
    //        'cf1dc9bb0cb48fcfda489fb05683e3e7' // Project key
    //    );
    //} else {
    //    airbrake = require('airbrake').createClient(
    //        '156332', // Project ID
    //        '08292120e835e0088180cb09b1a474d0' // Project key
    //    );
    //}
    //    airbrake.handleExceptions();



    // throw new Error('I am an uncaught exception');
    // Setup MongoDB conenction
    // var mongoConnection = 'mongodb://bedbug:a21th21@ds043523-a0.mongolab.com:43523,ds043523-a1.mongolab.com:43523/sportimo?replicaSet=rs-ds043523';
    // var mongoConnection = 'mongodb://bedbug:a21th21@ds027835.mongolab.com:27835/sportimov2';
    var mongoConnection = process.env.MONGO_URL || ('mongodb://' + mongoCreds[process.env.NODE_ENV].user + ':' + mongoCreds[process.env.NODE_ENV].password + '@' + mongoCreds[process.env.NODE_ENV].url);
    // if (mongoose.connection.readyState != 1 && mongoose.connection.readyState != 2)
    mongoose.Promise = global.Promise;

    mongoose.connect(mongoConnection, {
        useNewUrlParser: true,
        useFindAndModify: true,
        useCreateIndex : true
    }, function (err, res) {
        if (err) {
            console.error('ERROR connecting to: ' + mongoConnection + '. ' + err);
            process.exit(1);
        }
        else {
            console.log("[Game Server] MongoDB Connected.");

            mongoose.connection.on('disconnected', function () {
                console.log("Mongoose default connection is closed");
            });

            /* Modules */

            app.use('/offline_data/', require('./sportimo_modules/offline_data/api/ondemand.js'));
            app.use('/', require('./sportimo_modules/gamecards/api/gamecards'));

            var leaderboards_module = require('./sportimo_modules/leaderpay');

            var users_module = require('./sportimo_modules/users');

            var data_module = require('./sportimo_modules/data-module');

            var polls_module = require('./sportimo_modules/polls');


            var liveMatches = require('./sportimo_modules/match-moderation');
            if (PublishChannel && SubscribeChannel)
                liveMatches.SetupRedis(PublishChannel, SubscribeChannel, redisCreds.channel);

            liveMatches.SetupMongoDB(mongoose);
            liveMatches.SetupAPIRoutes(app);
            liveMatches.init(TestSuite.done);
            TestSuite.moderation = liveMatches;
        }

    });

}
catch (err) {
    console.log(err);
}

// var purchases_module = require('./sportimo_modules/purchases');
// TestSuite.dataModule = dataModule;


function log(info) {
    //  console.log("[" + Date.now() + "] API CALL: " + info);
}


// See below how the payload limit is set for bodyParser:
// https://stackoverflow.com/questions/19917401/error-request-entity-too-large


// See why we have to manually instruct body parser to serialize to dates from string: https://github.com/expressjs/body-parser/issues/17

var regexIso8601 = /^(\d{4}|\+\d{6})(?:-(\d{2})(?:-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})\.(\d{1,})(Z|([\-+])(\d{2}):(\d{2}))?)?)?)?$/;

function reviveDates(key, value) {
    var match;
    if (typeof value === "string" && (match = value.match(regexIso8601))) {
        var milliseconds = Date.parse(match[0]);
        if (!isNaN(milliseconds)) {
            return new Date(milliseconds);
        }
    }
    return value;
}


//app.use(bodyParser.json());
app.use(bodyParser.json({
    limit: '10mb',
    reviver: reviveDates
}));
app.use(bodyParser.text({
    limit: '10mb',
    type: 'text/*'
}));
app.use(bodyParser.urlencoded({
    limit: '10mb',
    extended: true
}));

app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Access-Token");
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE');
    next();
});

app.use(function (req, res, next) {
    logger.debug(`inbound ${req.method} ${req.path}`);
    req.mongoose = mongoose.connection;
    req.redisPub = PublishChannel;
    req.redisSub = SubscribeChannel;
    next();
});

app.get('/', function (req, res, next) {
    res.send(200, "Sportimo main game server v3.0.0 status is live.");
});

app.use('/static', express.static(__dirname + '/static'));





// Central Error Handling for all Express router endpoints: for Express this should be the last middleware declared:
// See http://expressjs.com/en/guide/error-handling.html
app.use(function (error, request, response, next) {
    logger.error('Error: %s \nStack: %s', error.message, error.stack);

    // In Development environment return the exact error message and stack:
    return response.status(500).json({
        error: {
            message: error.message,
            stack: error.stack
        }
    });

    // In Production environment, return a generic error message:
    //return response.status(500).json({error: 'Oops! The service is experiencing some unexpected issues. Please try again later.'});
});

TestSuite.server = app;


// ROUTE FOR PLATFORM SETTINGS
// =============================================================================
var router = express.Router();              // get an instance of the express Router

router.get('/', function (req, res) {
    settings.find({}, function (err, result) {
        if (result[0])
            return res.status(200).send(result[0]);
        else return res.status(200).send(result);
    });
});

app.use('/settings', router);

process.on('uncaughtException', (err) => {
    console.error(err);
    throw err;
});

module.exports = TestSuite;
