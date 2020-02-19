/* Author: Elias Kalapanidas on 4/10/2018 */

'use strict';

const logger = require('winston');
const async = require('async');
const _ = require('lodash');
const moment = require('moment');
const mongoose = require('mongoose');
const copyFrom = require('pg-copy-streams').from;
const stream = require('stream');


const UserEvents = require('../sportimo_modules/models/trn_user_event');
const PostgresImporter = require('../sportimo_modules/models/trn_postgres_importer');

let postgresClient = null;

// Constants used in the following of this process:
const delimiter = '|';
const postgresTable = 'sportimo3.user_activity_dev';
const postgresColumns = ['_id', 'user_id', 'client_id', 'event_name', 'event_time', 'event_object'];
const postgresAllocationCountMax = 5000;


class PostgresExporter {


    /* 
       Take a UserEvent object and convert it to a string representation suitable for Postgres export, 
        according to the user activity table schema 
    */
    static Convert(userevent) {

        let stringBuffer = '';

        // Postgres _id field:
        if (userevent._id)
            stringBuffer += userevent._id;
        stringBuffer += delimiter;

        // Postgres user (id) field:
        if (userevent.user)
            stringBuffer += userevent.user;
        stringBuffer += delimiter;

        // Postgres client (id) field:
        if (userevent.client)
            stringBuffer += userevent.client;
        stringBuffer += delimiter;

        // Postgres event_name field:
        if (userevent.eventName)
            stringBuffer += userevent.eventName;
        stringBuffer += delimiter;

        // Postgres event_time field:
        if (userevent.eventTime)
            stringBuffer += PostgresExporter.ConvertDate(userevent.eventTime);
        stringBuffer += delimiter;


        // Postgres event_object field:
        if (userevent.eventObject) {
            PostgresExporter.CleanBson(userevent.eventObject);
            stringBuffer += JSON
                .stringify(userevent.eventObject)
                .replace(/[\n\r|]/g, '')
                .replace(/"/g, "\\\"");
        }

        return stringBuffer;
    }


    /* 
       To avoid resource conflicts, before starting, write a marker in Mongo letting other competing exporter workers that  
        the marked range belongs to this executing process to export
    */
    static AllocateMongoDocuments(callback) {

        let allocationCount = 10;
        let lastState = null;
        const allocationCountMax = postgresAllocationCountMax;
        const twentyFourHoursBefore = new Date() - 1000 * 60 * 60 * 24;

        async.waterfall([
            (cbk) => PostgresExporter.LoadExporterState(cbk),
            (postgresState, cbk) => {

                // Select all events prior 24 hours before, because these we need them in various logics (e.g. user's detectDailySignin)
                const query = {
                    eventTime: { $lt: new Date(twentyFourHoursBefore) }
                };

                if (postgresState) {

                    lastState = postgresState;

                    if (postgresState.lastId)
                        query._id = { $gt: postgresState.lastId };
                    if (postgresState.allocationCount)
                        allocationCount = postgresState.allocationCount;
                    if (postgresState.allocationCountMax)
                        allocationCountMax = postgresState.allocationCountMax;
                }

                mongoose.models.trn_user_events.find(query, { _id: true }).sort({ _id: 1 }).limit(allocationCountMax).exec(cbk);
            },
            (unprocessedDocs, cbk) => {

                if (!unprocessedDocs || unprocessedDocs.length === 0)
                    return cbk(null); // return cbk(null, { value: lastState });

                const unprocessedCount = unprocessedDocs.length;

                // Dynamic documents allocation for exporting by this process,
                // depending on the unprocessed document count found in Mongo Store
                allocationCount = PostgresExporter.ComputeAllocationCount(unprocessedCount, allocationCountMax);

                const matchQuery = {};
                if (lastState) {
                    matchQuery._id = lastState._id;
                    matchQuery.lastId = lastState.lastId;
                }

                const updateQuery = {
                    $set: {
                        updatedAt: new Date(),
                        allocationCount: allocationCount,
                        lastId: unprocessedDocs[allocationCount - 1]._id
                    }
                };
                if (lastState) {
                    updateQuery.$set.rollbackId = lastState.lastId;
                }

                // Ensure that the last state is not changed from the time it is read (above)
                mongoose.models.trn_postgres_importers.findOneAndUpdate(matchQuery, updateQuery, { upsert: true, new: true }, cbk);
            }
        ], (asyncErr, asyncResult) => {
            if (asyncErr)
                return callback(asyncErr);

            let newState = null;

            if (asyncResult) {
                newState = asyncResult;
            }

            return callback(null, lastState, newState);
        });
        
    }

    /* 
        When the process exits abnormally due to an error, the last allocated point should be revoked and rolled-back to the previous value
    */
    static RollbackMongoAllocation(lastState, callback) {

        if (!lastState)
            return callback(null);

        if (!lastState.rollbackId)
            return mongoose.models.trn_postgres_importers.remove({ _id: lastState._id }, callback);

        const updateQuery = {
            $set: {
                updatedAt: new Date(),
                lastId: lastState.rollbackId,
                rollbackId: null
            }
        };

        mongoose.models.trn_postgres_importers.findOneAndUpdate({ _id: lastState._id }, updateQuery, { new: true }, callback);
    }


    static LoadExporterState(callback) {

        return mongoose.models.trn_postgres_importers.findOne({}, callback);
    }


    /* 
       Load from Mongo all user-activity UserEvent instances dully within the specified _id range  
    */
    static LoadFromMongo(lastState, nextState, callback) {

        const query = { _id: { $lte: nextState.lastId } };
        if (lastState) {
            query._id.$gt = lastState.lastId;
        }

        return mongoose.models.trn_user_events.find(query).sort({ _id: 1 }).exec((mongoErr, eventsBson) => {
            if (mongoErr)
                return callback(mongoErr);

            const events = _.map(eventsBson, i => i.toJSON());
            return callback(null, events);
        });
    }


    /* 
       A naive dynamic documents allocation algorithm (for next marker computation)
    */
    static ComputeAllocationCount(unprocessedCount, allocationCountMax) {

        let allocationCount = allocationCountMax;

        if (unprocessedCount === allocationCountMax)
            return allocationCountMax;

        //if (unprocessedCount > 5000)
        //    allocationCount = allocationCountMax;
        //else if (unprocessedCount > 2500)
        //    allocationCount = 500;
        //else if (unprocessedCount > 1000)
        //    allocationCount = 100;
        //else if (unprocessedCount > 500)
        //    allocationCount = 50;
        //else
        //    allocationCount = 10;

        // Enforce limit of unprocessedCount
        allocationCount = Math.min(allocationCount, unprocessedCount);

        return allocationCount;
    }


    /* 
       This method massively moves a bulk of objects into Postgres.
        It executes the stream version (as opposed to the file version) of the COPY command through the postgres client, and takes care of creating and closing the streams.
    */
    static PostgresExportStream(events, convertToStringFn, client, callback) {

        let lastRow = null;
        // Debugging vars
        let rowsProcessed = 0;
        let eventsProcessed = '';

        // Instantiate, configure and pipe streams
        const copyCommand = `COPY ${postgresTable} (${_.join(postgresColumns, ',')}) FROM STDIN WITH NULL '' DELIMITER '${delimiter}'`;
        const writable = client.query(copyFrom(copyCommand));
        writable.on('error', (err) => {
            logger.error(`Error in executing postgres COPY command: ${copyCommand}`);
            logger.error(`\nMessage: ${err.message}\nDetail: ${err.detail}\nSource: ${err.where}`);
            logger.info('Last row: ' + lastRow);
            return callback(err);
        });
        //writable.on('data', (data) => {
        //    lastRow = Buffer.from(data).toString();
        //    rowsProcessed++;
        //    eventsProcessed += lastRow;
        //});
        writable.on('end', (result) => {
            eventsProcessed = null;
            return callback(null, result, sourceIndex);
        });

        let sourceIndex = 0;
        const eventsCount = events.length;

        const readable = new stream.Readable({

            highWaterMark: 256 * 1024,
            read(size) {
                // Generate and stream contents
                const event = events[sourceIndex];
                try {
                    let eventString = convertToStringFn(event) + '\n';
                    //eventsProcessed += eventString;
                    lastRow = eventString;
                    this.push(eventString);
                }
                catch (parseErr) {
                    logger.warn(parseErr.message);
                }
                finally {
                    // readable stream close condition
                    if (sourceIndex++ === eventsCount - 1) {
                        this.push(null);
                    }
                }
            }

        });
        //readable.on('error', (err) => {          
        //    logger.info(err);
        //});

        // The magic of connecting the read to the write streams and moving memory load one chunk at a time through, is here:
        readable.pipe(writable);
    }


    /* 
       The entry-point in this class that does the following:

        - Finds all unprocessed user-activity documents that need to be exported
        - Splits them in manageable batches
        - For each batch:
            - Reads them from Mongo
            - Converts all into text
            - Exports in Postgres through a COPY stream command
            - Reports results
    */
    static Execute(postgresClient, callback) {

        postgresClient = postgresClient;

        PostgresExporter.AllocateMongoDocuments((err, lastState, nextState) => {
            if (err) {
                return callback(err);
            }

            if (!nextState) {
                return callback(null, lastState);
            }

            async.waterfall([
                (cbk) => PostgresExporter.LoadFromMongo(lastState, nextState, cbk),
                (events, cbk) => {
                    const conversionFunction = PostgresExporter.Convert;

                    PostgresExporter.PostgresExportStream(events, conversionFunction, postgresClient, cbk);
                }
            ], (asyncErr, results, rowsProcessed) => {
                
                if (asyncErr) {
                    return PostgresExporter.RollbackMongoAllocation(nextState, (rollbackErr) => {
                        // handle rollbackErr ? or ignore.

                        return callback(asyncErr);
                    });
                }

                return callback(null, lastState, rowsProcessed);
            });
        });
    }


    /* 
       Testing helper for exporting one toy object
    */
    static ExecuteTestExport(postgresClient, callback) {

        postgresClient = postgresClient;
        const events = [new UserEvents(PostgresExporter.GetToyUserEvent()).toJSON()];
        const conversionFunction = PostgresExporter.Convert;

        PostgresExporter.PostgresExportStream(events, conversionFunction, postgresClient, callback);
    }


    /* 
       A helper method to compute 2 timestamps difference in seconds
    */
    static ComputeDurationSeconds(start, end) {

        if (_.isDate(start) && _.isDate(end)) {
            return moment.utc(end).diff(start, 's', false);
        } else
            return 0;
    }

    static ConvertDate(eventTime) {
        return eventTime.toISOString();
    }

    /* 
       A helper method to clean object ids (replacing by the string version) and dates (replacing by ISOString version)
    */
    static CleanBson(bson, depth) {

        if (!depth)
            depth = 1;

        if (_.isArray(bson)) {
            bson.forEach((i) => {
                i = PostgresExporter.CleanBson(i, depth + 1);
            });
            return;
        }

        return _.forOwn(bson, (value, key, object) => {
            if (value) {
                if (_.isDate(value))
                    object[key] = value.toISOString();
                else if (typeof value.toHexString === 'function')
                    object[key] = value.toHexString();
                else if (key === 'storeReceipt') {
                    try {
                        object[key] = JSON.parse(value);
                        if (object[key].Payload) {
                            object[key].Payload = JSON.parse(object[key].Payload);
                            if (object[key].Payload.json)
                                object[key].Payload.json = JSON.parse(object[key].Payload.json);
                        }
                    }
                    catch (err) {
                        object[key] = err.message;
                    }
                }
                else if (_.isArray(value)) {
                    value.forEach((i) => {
                        i = PostgresExporter.CleanBson(i, depth + 1);
                    });
                }
                else if (_.isString(value)) {
                    if (value.match(/[\t\n\r|"]/)) {
                        object[key] = value
                            .replace(/[\t\n\r|]/g, '')      // remove all tabs, carriage returns, new lines
                            .replace(/([^\\])"/g, "$1'")
                            .replace(/\\n/g, '');           // remove \n from text (escaped new lines)
                    }
                }
                    // Recurse into deep object properties
                else if (_.isPlainObject(value))
                    object[key] = PostgresExporter.CleanBson(value, depth + 1);
            }
        });
    }



    /* 
       A helper method to return a UserEvent instance sample to be used in testing
    */
    static GetToyUserEvent() {
        const ObjectID = require('mongodb').ObjectID;
        const testEvent = require('./test-user-event');

        return testEvent;
    }

}

module.exports = PostgresExporter;