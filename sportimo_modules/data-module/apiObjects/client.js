'use strict';

// Module dependencies.
var mongoose = require('mongoose'),
    moment = require('moment'),
    ObjectId = mongoose.Schema.Types.ObjectId,
    Entity = mongoose.models.trn_clients,
    api = {};



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAll = function (skip, limit, cb) {

    var q = Entity.find({ });

    if (skip !== undefined)
        q.skip(skip * 1);

    if (limit !== undefined)
        q.limit(limit * 1);

    return q.exec(function (err, entities) {
        cbf(cb, err, entities);
    });
};


// GET
api.getById = function (id, cb) {

    Entity
        .findById(id)
        .exec(function (err, entity) {
            cbf(cb, err, entity);
        });
};


// Returns results matching the searchTerm
api.search = function (searchTerm, competitionId, cb) {

    const searchExp = new RegExp(searchTerm, 'i');
    const query = {
        $or: [
            { 'name.en': searchExp },
            { 'name.ar': searchExp },
            { 'description.en': searchExp },
            { 'description.ar': searchExp },
            { 'constactAddress': searchExp },
            { 'promoText.en': searchExp },
            { 'promoText.ar': searchExp }
            //{ $text: { $search: searchTerm } }
        ]
    };

    Entity.find(query)
        .exec(function (err, entities) {
            return cbf(cb, err, entities);
        });
};


// POST
api.add = function (entity, cb) {

    if (!entity) {
        cb( new Error('No entity provided. Please provide valid data to update.') );
    }

    entity = new Entity(entity);

    entity.save(function (err) {
        cbf(cb, err, entity.toObject());
    });
};


// PUT
api.edit = function (id, updateData, cb) {

    return Entity.findOneAndUpdate({ _id: id }, { $set: updateData }, function (err, entity) {
        cbf(cb, err, entity);
    });
};


// DELETE
api.delete = function (id, cb) {

    return Entity.remove({ _id: id }).exec(function (err, entity) {
        return cbf(cb, err, true);
    });
};



/*
========= [ UTILITY METHODS ] =========
*/

/** Callback Helper
 * @param  {Function} - Callback Function
 * @param  {Object} - The Error Object
 * @param  {Object} - Data Object
 * @return {Function} - Callback
 */

var cbf = function (cb, err, data) {
    if (cb && typeof (cb) == 'function') {
        if (err) cb(err);
        else cb(false, data);
    }
};



module.exports = api;
