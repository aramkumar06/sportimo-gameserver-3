'use strict';

var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    ObjectId = Schema.ObjectId;

if (mongoose.models.trn_articles)
    module.exports = mongoose.models.trn_articles;
else {
    var article = {
        client: { type: ObjectId, ref: 'trn_clients' },
        tournament: { type: ObjectId, ref: 'tournaments' },
        tournamentMatch: { type: ObjectId, ref: 'trn_matches' },
        competitionSeason: { type: ObjectId, ref: 'trn_competition_seasons' },
        scheduledMatch: { type: ObjectId, ref: 'scheduled_matches' },

        publication: { type: Schema.Types.Mixed },
        publishDate: { type: Date },
        type: { type: String },
        photo: { type: String },
        tags: { type: Schema.Types.Mixed },
        created: { type: Date, default: Date.now }
    };

    var articleSchema = new Schema(article);

    module.exports = mongoose.model('trn_articles', articleSchema);
}
