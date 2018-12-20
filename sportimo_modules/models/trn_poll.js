'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId,
    _ = require('lodash');


if (mongoose.models.trn_polls)
    module.exports = mongoose.models.trn_polls;
else {
    var answer = new Schema({
        text: { type: Schema.Types.Mixed },
        img: String,
        votes: { type: Number, default: 0 },
        percent: { type: Number, default: 0 }
        // voters: [{
        //         type:String,
        //         ref:'users'
        //     }]
    });

    var fields = {
        client: { type: ObjectId, ref: 'trn_clients' },
        tournament: { type: ObjectId, ref: 'tournaments' },
        tournamentMatch: { type: ObjectId, ref: 'trn_matches' },
        competitionSeason: { type: ObjectId, ref: 'trn_competition_seasons' },
        scheduledMatch: { type: ObjectId, ref: 'scheduled_matches' },

        text: { type: Schema.Types.Mixed },
        answers: [answer],
        matchid: String,
        type: { type: String },
        img: { type: String },
        total_votes: { type: Number, default: 0 },
        hasAlreadyVoted: Number,
        hasAnswered: String,
        voters: [Schema.Types.Mixed],
        //status: Number,
        tags: { type: Schema.Types.Mixed },
        sponsor: { type: Schema.Types.Mixed },
        created: { type: Date, default: Date.now }
    };



    var schema = new Schema(fields);

    schema.pre('save', function (next) {
        this.total_votes = _.sumBy(this.answers, 'votes');
        var total = this.total_votes;
        _.each(this.answers, function (answer) {
            answer.percent = Math.round(100 * answer.votes / total);
        });

        next();
    });



    module.exports = mongoose.model('trn_polls', schema);
}
