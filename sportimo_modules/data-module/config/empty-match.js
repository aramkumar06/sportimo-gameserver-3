module.exports = {
    "sport": "soccer",
    "home_team": "",
    "away_team": "",
    "home_score": 0,
    "away_score": 0,
    "time": "1",
    "start": null,
    "competition": "",
    "moderation": [],
    "stats": [],
    "timeline": [],
    "settings": {
        "gameCards": {
            "instant": 15,
            "overall": 15,
            "specials": 4,
            "totalcards": 15
        },
        "matchRules": {
            "freeUserPlaySegments": [
                0,
                1,
                2
            ],
            "freeUserHasPlayTimeWindow": false,
            "freeUserPregameTimeWindow": 20,
            "freeUserLiveTimeWindow": 20,
            "freeUserAdsToGetCards": false,
            "freeUserCardsCap": false,
            "freeUserCardsLimit": 5
        },
        "hashtag": "#sportimo",
        "destroyOnDelete": true,
        "sendPushes": true
    },
    "state": 0
};

// var match_schema = new mongoose.Schema({
//   sport: String,
//   home_team: {
//     type: String,
//     ref: 'team'
//   },
//   away_team: {
//     type: String,
//     ref: 'team'
//   },
//   start: Date,
//   color: String,
//   competition: String,
//   home_score: Number,
//   away_score: Number,
//   match_date: Date,
//   time: String,
//   state: Number,
//   stats: mongoose.Schema.Types.Mixed,
//   timeline: [mongoose.Schema.Types.Mixed],
//   settings: mongoose.Schema.Types.Mixed,
//   moderation: [mongoose.Schema.Types.Mixed]
// }