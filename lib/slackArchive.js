/* global JSZip */

function slackArchive(zipBlob) {
  function mapById(arr) {
    var mbi = new Map();
    for (var i=0; i<arr.length; i++) {
      mbi.set(arr[i].id, arr[i]);
    }
    return mbi;
  }
  function dayMessages(file) {
    return {
      date: file.name.replace(/^[^\/]+\/([^\/]+)\.json$/,'$1'),
      getMessages: function() {
        return JSON.parse(file.asText());
      }
    };
  }
  var zip = new JSZip(zipBlob);
  var users = JSON.parse(zip.file('users.json').asText());
  var channels = JSON.parse(zip.file('channels.json').asText());
  var channelDates = []; // used for advancing
  var messageDaysByChannelName = new Map();
  var filenames = Object.keys(zip.files);

  for (var i = 0; i < channels.length; i++) {
    var days = [];
    messageDaysByChannelName.set(channels[i].name, days);
  }

  for (var j = 0; j < filenames.length; j++) {
    if (/^[^\/]+\/[^\/]+\.json$/.test(filenames[j])) {
      var filename = filenames[j];
      console.log('parsing '+filename);
      var day = dayMessages(zip.files[filenames[j]]);
      channelDates.push(filename.replace(/\.json$/,''));
      days.push(day);
    }
  }

  return {
    users: users,
    channels: channels,
    usersById: mapById(users),
    channelsById: mapById(channels),
    messageDaysByChannelName: messageDaysByChannelName,
    channelDates: channelDates
  };
}
