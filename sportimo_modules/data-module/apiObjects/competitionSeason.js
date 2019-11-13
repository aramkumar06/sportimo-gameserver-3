// Module dependencies.
var mongoose = require('mongoose'),
    ObjectId = mongoose.Types.ObjectId,
    Entity = mongoose.models.trn_competition_seasons,
    Matches = mongoose.models.matches,
    Standings = require('../../models/trn_team_standing'), //mongoose.models.trn_standings,
    api = {},
    l=require('../config/lib');



/*
========= [ CORE METHODS ] =========
*/

// ALL
api.getAllInstances = function (skip, limit, status, cb) {
 
    var q = Entity.find(status ? { status: status } : {});
    q.populate('competition');
    q.populate({ path: 'teams', select: 'name logo abbr' });
  
   if(skip)
     q.skip(skip*1);

   if(limit)
     q.limit(limit*1);

    return q
        .exec(function (err, competitions) {
            cbf(cb,err,competitions);    
        });
};

// GET
api.getInstance = function (id,cb) {

    Entity.findOne({ '_id': id })
        .populate('competition')
        .populate({ path: 'teams', select: 'name logo abbr' })
        .exec(function (err, competition) {
            cbf(cb,err,competition);
        });
};

// POST
api.addInstance = function (competition, cb) {

  if(competition == 'undefined'){
    cb('No Instance Provided. Please provide valid competition data.');
  }

    competition = new Entity(competition);

    competition.save(function (err) {
        cbf(cb,err,competition.toObject());
    });
};

// PUT
api.editInstance = function (id, updateData, cb) {

    var update = updateData;//.toObject();
    // delete update._id;
    Entity.findByIdAndUpdate(id, update, function (err, competition) {
        if (err) {
            return cbf(cb, err, null);
        }

        return cb(null);
        // Matches.update({ competition: id }, update,function(err,data){
        //   console.log(id);
        //   console.log(err);
        //console.log("Updating visible in...");
        //Standings.findOneAndUpdate({ competitionid: id }, { $set: { visiblein: update["visiblein"] } }, function (err, data) {
        //    console.log(err);
        //    if(!err)
        //        return cbf(cb,err,competition.toObject());                 
        //});
    });
  // });// eo competition.find
};

// DELETE
api.deleteInstance = function (id,cb) {
    return Entity.findById(id).remove().exec(function (err, competition) {
   return cbf(cb,err,true);      
 });
};


// POST
api.addTeam = function (id, teamId, cb) {
    return Entity
        .findByIdAndUpdate(id, { $addToSet: { teams: new ObjectId(teamId) } }, { useFindAndModify: false, new: true })
        .populate('competition')
        .populate({ path: 'teams', select: 'name logo abbr' })
        .exec(cb);

};

// DELETE
api.removeTeam = function (id, teamId, cb) {
    return Entity
        .findByIdAndUpdate(id, { $pull: { teams: new ObjectId(teamId) } }, { useFindAndModify: false, new: true })
        .populate('competition')
        .populate({ path: 'teams', select: 'name logo abbr' })
        .exec(cb);
};



/*
========= [ SPECIAL METHODS ] =========
*/


//TEST
api.test=function (cb) {
  cbf(cb,false,{result:'ok'});
};


api.deleteAllInstances = function (cb) {
  return Instance.remove({},function (err) {
    cbf(cb,err,true);      
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
 
 var cbf=function(cb,err,data){
  if(cb && typeof(cb)=='function'){
    if(err) cb(err);
    else cb(false,data);
  }
};



module.exports = api;
