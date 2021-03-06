'use strict';
var mongoose = require('mongoose');

var config = {
  "db": "sportimov2",  
  "host": "ds021165-a1.mlab.com", //"ds027835.mongolab.com",  
  "user": "bedbug",
  "pw": "a21th21",
  "port": "21165" //"27835"
};

// var config = {
//   "db": "sportimo_mbc",  
//   "host": "ds059726-a0.mlab.com", //"ds027835.mongolab.com",  
//   "user": "bedbug",
//   "pw": "a21th21",
//   "port": "59726" //"27835"
// };

var port = (config.port.length > 0) ? ":" + config.port : '';
var login = (config.user.length > 0) ? config.user + ":" + config.pw + "@" : '';
var uristring = "mongodb://" + login + config.host + port + "/" + config.db;

var mongoOptions = { db: { safe: true } };

// Connect to Database
if (mongoose.connection.readyState == 0)
mongoose.connect(uristring, mongoOptions, function (err, res) {
  if(err){
    console.log('ERROR connecting to: ' + uristring + '. ' + err);
  }else{
    console.log('Successfully connected to: ' + uristring);
  }
});


exports.mongoose = mongoose;