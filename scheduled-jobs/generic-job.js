'use strict';


const mongoose = require('mongoose');
const redis = require('redis');
const mongoCreds = require('../config/mongoConfig');
const async = require('async');
const winston = require('winston');
const { Client } = require('pg');
const PostgresClient = Client;

/*
 * 
 * // Why import cannot be mixed with require statements: https://medium.com/the-node-js-collection/an-update-on-es6-modules-in-node-js-42c958b890c
 * 
import mongoose from 'mongoose';
import redis from 'redis';
import mongoCreds from '../config/mongoConfig';
import async from 'async';
import logger from 'winston';
*/


class GenericJob {
    constructor(name, needsMongo, needsRedis, needsPostgres) {
        this.startTime = new Date();
        this.name = name;
        this.needsMongo = !!needsMongo;
        this.needsRedis = !!needsRedis;
        this.needsPostgres = !!needsPostgres;

        this.logger = new (winston.Logger)({
            levels: {
                prompt: 6,
                debug: 5,
                info: 4,
                core: 3,
                warn: 1,
                error: 0
            },
            colors: {
                prompt: 'grey',
                debug: 'blue',
                info: 'green',
                core: 'magenta',
                warn: 'yellow',
                error: 'red'
            }
        });
        this.logger.add(winston.transports.Console, {
            timestamp: true,
            level: process.env.LOG_LEVEL || 'debug',
            prettyPrint: true,
            colorize: 'level'
        });


        this.logger.info(`${this.name} started execution`);
    }

    connectToMongoDb(cb) {

        const that = this;
        const mongoConnectionString = process.env.MONGO_URL || ('mongodb://' + mongoCreds[process.env.NODE_ENV].user + ':' + mongoCreds[process.env.NODE_ENV].password + '@' + mongoCreds[process.env.NODE_ENV].url);
        // if (mongoose.connection.readyState != 1 && mongoose.connection.readyState != 2)
        mongoose.Promise = global.Promise;

        mongoose.connect(mongoConnectionString, {
            useNewUrlParser: true,
            useFindAndModify: false
        }, function (err, res) {
            if (err) {
                that.logger.error('ERROR connecting to: ' + mongoConnection + '. ' + err);
                return cb(err);
            }
            else {
                that.logger.log("[Game Server] MongoDB Connected.");
                that.mongo = mongoose;

                mongoose.connection.on('disconnected', function () {
                    that.logger.warn("Mongoose connection is closed");
                });

                return cb();
            }
        });
    }

    connectToRedis(cb) {
        this.redis = redis.createClient(process.env.REDIS_URL || "redis://h:pa4daaf32cd319fed3e9889211b048c2dabb1f723531c077e5bc2b8866d1a882e@ec2-63-32-222-217.eu-west-1.compute.amazonaws.com:6469");
        this.redis.on('error', function (err) {
            this.logger.error('Redis error:', err);
        });
        async.nextTick(cb);
    }

    connectToPostgres(cb) { // callback is optional
            const that = this;

            const client = that.postgres = new PostgresClient({
                connectionString: process.env.DATABASE_URL || 'postgres://data_importer:tableau.c0cbdf19b42f@46.16.77.170:5432/postgres',
                ssl: process.env.POSTGRES_SSL_ENABLED || false
            });
            client.on('error', (err) => {
                that.logger.error(`Error in Postgres connection: ${err.stack}`);
                this.postgres.end();
            });
            client.on('end', (err) => {
                that.logger.info(`Postgres connection is closed. Reconnecting in 30 seconds ...`);
                setTimeout(() => {
                    that.connectPostgres(() => { });
                }, 30000);
            });
            client.connect((err, connClient) => {
                if (err) {
                    that.logger.error(`Error in establishing Postgres connection: ${err.stack}`);
                    return cb(err);
                }

                if (connClient) {
                    that.postgres = connClient;
                    that.logger.log("[Game Server] PostgreSQL Connected.");
                }

                return cb(null);
            });
    }


    entryPoint(cb) {

        const that = this;

        async.parallel([
            (cbk) => that.needsMongo ? that.connectToMongoDb(cbk) : async.nextTick(cbk),
            (cbk) => that.needsRedis ? that.connectToRedis(cbk) : async.nextTick(cbk),
            (cbk) => that.needsPostgres ? that.connectToPostgres(cbk) : async.nextTick(cbk)
        ], cb);
    }

    terminate() {
        const exitTime = new Date();
        const diff = (exitTime.getTime() - this.startTime.getTime()) / 1000.0;

        // Properly close all connections
        if (this.needsRedis)
            this.redis.quit();
        if (this.needsMongo)
            this.mongo.disconnect();
        if (this.needsPostgres)
            this.postgres.end();

        this.logger.info(`${this.name} terminated in ${diff} seconds`);
        process.exit(0);
    }

    abort(err) {
        const exitTime = new Date();
        const diff = (exitTime.getTime() - this.startTime.getTime()) / 1000.0;

        // Properly close all connections
        if (this.needsRedis && this.redis)
            this.redis.quit();
        if (this.needsMongo && this.mongo)
            this.mongo.disconnect();

        that.logger.error(`${this.name} aborted after ${diff} seconds: ${err}`);
        process.exit(1);
    }
};


module.exports = GenericJob;