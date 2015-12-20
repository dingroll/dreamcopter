/* global PouchDB */
var reslackedDb = {};

(function(){
  var reslackedPouch = new PouchDB('reslacked');

  var viewDesignDoc = {
    _id: '_design/views',
    version: 1,
    views: {
      status: {
        map: function(doc) {
          emit(doc._id,{ready: doc.ready});
        }.toString()
      }
    }
  };

  function ensureCurrentDesignDoc(db, designDoc) {
    function checkAgainstExistingDesignDoc(existing) {

      // If we have a newer design doc than the current one
      if (designDoc.version > existing.version) {

        // Note the revision we're clobbering and try the put again
        designDoc._rev = existing._rev;
        return ensureCurrentDesignDoc(db, designDoc);

      // If the existing design doc appears to be up to date then
      // return the DB for stuff like getDB
      } else return db;
    }

    return db.put(designDoc).then(function() {
      // return the DB for stuff like getDB
      return db;
    }).catch(function (err) {
      if (err.name == 'conflict') {
        return db.get(designDoc._id)
          .then(checkAgainstExistingDesignDoc);
      } else throw(err);
    });
  }

  function forcePutDoc(db, doc) {
    return db.put(doc).catch(function (err) {
      if (err.name == 'conflict') {
        return db.get(doc._id)
          .then(function(newDoc) {
            doc._rev = newDoc._rev;
            return forcePutDoc(db, doc);
          });
      } else throw(err);
    });
  }

  var pouchReady = ensureCurrentDesignDoc(reslackedPouch,viewDesignDoc);

  reslackedDb.getChannelDayStatusMap = function getStatusMap() {
    return pouchReady.then(function(db){
      return db.query('views/status');
    }).then(function(result) {
      var statusMap = new Map();
      var rows = result.rows;
      var rowCount = rows.length;
      for (var i = 0; i < rowCount; i++) {
        statusMap.set(rows[i].key, rows[i].value);
      }
      return statusMap;
    });
  };

  reslackedDb.getChannelDayMessages = function getDayMessages(dayId) {
    return reslackedPouch.get(dayId).then(function(doc) {
      return doc.messages;
    });
  };

  reslackedDb.saveChannelDay = function saveDay(dayId, dayDoc) {
    dayDoc._id = dayId;
    return forcePutDoc(reslackedPouch, dayDoc);
  };
})();
