﻿'use strict';

// Module dependencies.
var mongoose = require('mongoose'),
    moment = require('moment'),
    ObjectId = mongoose.Schema.Types.ObjectId,
    Entity = mongoose.models.tournaments,
    api = {};



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAll = function (clientId, skip, limit, cb) {
    var q = Entity.find({ client: clientId });

    if (skip !== undefined)
        q.skip(skip * 1);

    if (limit !== undefined)
        q.limit(limit * 1);

    return q.exec(function (err, entities) {
        cbf(cb, err, entities);
    });
};


// GET
api.getById = function (clientId, id, cb) {
    Entity
        .findById(id)
        .exec(function (err, entity) {
            if (!err && entity && (clientId !== entity.client.toHexString()))
                err = new Error(`Conflict between provided clientId and tournament's referred client id`);

            cbf(cb, err, entity);
        });
};


// Returns results matching the searchTerm
api.search = function (clientId, searchTerm, competitionId, cb) {
    const searchExp = new RegExp(searchTerm, 'i');
    const query = {
        client: clientId,
        $or: [
            { 'aboutText.en': searchExp },
            { 'aboutText.ar': searchExp },
            { 'howToParticipateText.en': searchExp },
            { 'howToParticipateText.ar': searchExp },
            { 'howToPlayText.en': searchExp },
            { 'howToPlayText.ar': searchExp }
            //{ $text: { $search: searchTerm } }
        ]
    };
    if (competitionId)
        query.competitionid = competitionId;

    Entity.find(query)
        .exec(function (err, entities) {
            return cbf(cb, err, entities);
        });
};


// POST
api.add = function (clientId, entity, cb) {

    if (entity === undefined) {
        cb('No entity provided. Please provide valid data to update.');
    }

    entity = new Entity(entity);
    entity.client = clientId;

    entity.save(function (err) {
        cbf(cb, err, entity.toObject());
    });
};


// PUT
api.edit = function (clientId, id, updateData, cb) {

    return Entity.findOneAndUpdate({ client: clientId, _id: id }, { $set: updateData }, function (err, entity) {
        cbf(cb, err, entity);
    });
};


// DELETE
api.delete = function (clientId, id, cb) {
    return Entity.remove({ _id: id, client: clientId }).exec(function (err, entity) {
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