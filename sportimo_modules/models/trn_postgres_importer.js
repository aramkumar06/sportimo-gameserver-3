'use strict';
var mongoose = require('mongoose'),
    Schema = mongoose.Schema,
    _ = require('lodash'),
    ObjectId = Schema.Types.ObjectId;


if (mongoose.models.trn_postgres_importer)
    module.exports = mongoose.models.trn_postgres_importer;
else {

    var fields = {
        allocationCount: Number,
        lastId: ObjectId,
        rollbackId: ObjectId,
        udatedAt: Date
    };

    var PostgresImporterSchema = new Schema(fields);

    module.exports = mongoose.model('trn_postgres_importers', PostgresImporterSchema);
}


