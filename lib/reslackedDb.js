/* global PouchDB */
var reslackedDb = {};

(function(){
  var reslackedPouch = new PouchDB('reslacked');

  var viewDesignDoc = {
    _id: '_design/dreamcopter',
    version: 1,
    views: {
      status: {
        map: function(doc) {
          if (doc._id[0] != '_' && doc._id.indexOf('/') > -1) {
            emit(doc._id, doc.status);
          }
        }.toString()
      },
      nonready: {
        map: function(doc) {
          if (doc._id[0] != '_' && doc._id.indexOf('/') > -1 &&
            doc.status != 'ready') {
            emit(doc._id, doc.status);
          }
        }.toString()
      },
      slack_matching: {
        map: function(doc) {
          if (doc._id[0] != '_' && doc._id.indexOf('/') > -1) {
            emit(doc._id, {
              messages: doc.messages.map(function(message) {
                return {
                  ts: message.slackMessage.ts,
                  edited: message.slackMessage.edited &&
                    message.slackMessage.edited.ts
                };
              }),
              channelid: doc.slackChannelId
            });
          }
        }.toString()
      },
      date_channels: {
        map: function(doc) {
          if (doc._id[0] != '_' && doc._id.indexOf('/') > -1) {
            emit(doc._id.split('/').reverse());
          }
        }.toString()
      },
      channel_dates: {
        map: function(doc) {
          if (doc._id[0] != '_' && doc._id.indexOf('/') > -1) {
            emit(doc._id.split('/'));
          }
        }.toString()
      },
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

  var designReady = ensureCurrentDesignDoc(reslackedPouch, viewDesignDoc);

  reslackedDb.getChannelDayStatusMap = function getStatusMap() {
    return designReady.then(function(db){
      return db.query('dreamcopter/status');
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

  function nullifyNotFound(err) {
    if (err.error == 'not_found') return null;
    else throw err;
  }

  reslackedDb.getChannelDay = function getChannelDay(dayId) {
    return reslackedPouch.get(dayId).then(function(doc) {
      return doc;
    }).catch(nullifyNotFound);
  };

  reslackedDb.saveChannelDay = function saveDay(dayId, dayDoc) {
    dayDoc._id = dayId;
    return forcePutDoc(reslackedPouch, dayDoc);
  };

  reslackedDb.getDreamPlanYaml = function getDreamPlanYaml() {
    return reslackedPouch.get('dreamplan').then(function(doc) {
      return doc.yaml;
    }).catch(nullifyNotFound);
  };

  reslackedDb.saveDreamPlanYaml = function saveDreamPlanYaml(yamlSrc) {
    return forcePutDoc(reslackedPouch, {
      _id: 'dreamplan',
      type: 'dreamplan',
      yaml: yamlSrc
    });
  };

  reslackedDb.sync = function sync(address) {
    return reslackedPouch.sync(address, {
      filter: function contentDocsOnly (doc) {
        return doc._id[0] != '_';
      }
    });
  };

  reslackedDb.getChannelDates = function getChannelDates () {
    return designReady.then(function(db){
      return db.query('dreamcopter/date_channels');
    }).then(function(result) {
      return result.rows.map(function(row) {
        return row.key.reverse().join('/');
      });
    });
  };

  function mapById(arr) {
    var mbi = new Map();
    for (var i = 0; i < arr.length; i++) {
      mbi.set(arr[i].id, arr[i]);
    }
    return mbi;
  }

  reslackedDb.saveSlackMetadata = function saveSlackMetadata(users, channels) {
    return forcePutDoc(reslackedPouch, {
      _id: 'metadata',
      type: 'metadata',
      users: users,
      channels: channels
    }).then(Promise.resolve({
      users: mapById(users),
      channels: mapById(channels)
    }));
  };

  reslackedDb.getSlackMaps = function getSlackMaps () {
    return reslackedPouch.get('metadata').then(function(doc) {
      return {
        users: mapById(doc.users),
        channels: mapById(doc.channels)
      };
    }).catch(nullifyNotFound);
  };

  function channelDateFromDatewiseRow(row) {
    return row.key.reverse().join('/');
  }

  function nextInView(view, startKey, reverse) {
    var queryOptions = {
      limit: 1,
      descending: reverse
    };
    if (startKey) {
      queryOptions.startkey = startKey;
      queryOptions.skip = 1;
    }
    return designReady.then(function(db){
      return db.query(view, queryOptions).then(function wraparound(result) {
        if (result.rows.length == 0) {
          return db.query(view, {
            limit: 1,
            descending: reverse
          });
        } else return result;
      });
    }).then(function(result) {
      return result.rows[0];
    });
  }

  function nextInChannel(channelDate, reverse) {
    var startKey = channelDate.split('/');
    var highKey = [startKey[0]];
    var lowKey = [startKey[0], {}];

    return designReady.then(function(db){
      return db.query('dreamcopter/channel_dates', {
          startkey: startKey,
          endKey: reverse ? highKey : lowKey,
          skip: 1, limit: 1,
          descending: reverse
      }).then(function wraparound(result) {
        if (result.rows.length == 0) {
          return db.query('dreamcopter/channel_dates', {
            startkey: reverse ? lowKey : highKey,
            endKey: reverse ? highKey : lowKey,
            limit: 1,
            descending: reverse
          });
        } else return result;
      });
    }).then(function(result) {
      return result.rows[0].key.join('/');
    });
  }

  reslackedDb.getNextChannelDate = function (channelDate) {
    return nextInView('dreamcopter/date_channels',
      channelDate.split('/').reverse, false)
      .then(channelDateFromDatewiseRow);
  };
  reslackedDb.getPreviousChannelDate = function (channelDate) {
    return nextInView('dreamcopter/date_channels',
      channelDate.split('/').reverse, true)
      .then(channelDateFromDatewiseRow);
  };
  reslackedDb.getNextDateInChannel = function (channelDate) {
    return nextInChannel(channelDate, false);
  };
  reslackedDb.getPreviousDateInChannel = function (channelDate) {
    return nextInChannel(channelDate, true);
  };
  reslackedDb.getFirstNonReadyChannelDate = function () {
    return nextInView('dreamcopter/nonready').then(function(row){
      return row.key;
    });
  };
})();
