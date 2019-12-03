'use strict';

var mongoose = require('mongoose'),
Schema = mongoose.Schema,
ObjectId = Schema.ObjectId;

var fields = {
	uniqueid: String,
    icon: String,
    title: mongoose.Schema.Types.Mixed,
    text: mongoose.Schema.Types.Mixed,
    has: Number,
    value: Number,
    total: Number,
    completed: Boolean,
	created: { type: Date , default: Date.now }
};

var achievementSchema = new Schema(fields);

module.exports = mongoose.model('achievements', achievementSchema);
