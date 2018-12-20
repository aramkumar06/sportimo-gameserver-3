'use strict';

var mongoose = require('mongoose'),
  Schema = mongoose.Schema;
  
if (mongoose.models.trn_server_settings)
    module.exports = mongoose.models.trn_server_settings;
else {
    var trn_server_setting = new mongoose.Schema({
        scheduledTasks: [{
            competitionId: { type: String, ref: 'trn_competitions' },
            season: { type: String, ref: 'trn_competition_seasons' },
            cronPattern: String,
            isDeleted: Boolean,
            parser: String
        }]
    });

    module.exports = mongoose.model("trn_server_settings", trn_server_setting);
}