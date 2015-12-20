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
      date: file.name.replace(/\.json$/,''),
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
  for (var i = 0; i < channels.length; i++) {
    var channelDir = zip.folder(channels[i].name);
    var days = [];
    var filenames = Object.keys(channelDir.files);
      for (var j = 0; j < filenames.length; j++) {
        var day = dayMessages(channelDir.file(filenames[j]));
        channelDates.push(channels[i].name + '/' + day.date);
        days.push(day);
      }
    messageDaysByChannelName.set(channels[i].name, days);
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
