/* global JSZip */

function slackArchive(zipBlob) {
  function mapById(arr) {
    var mbi = new Map();
    for (var i=0; i<arr.length; i++) {
      mbi.set(arr[i].id, arr[i]);
    }
    return mbi;
  }

  var zip = new JSZip(zipBlob);
  function getMessagesForChannelDate(channelDate) {
    return JSON.parse(zip.files[channelDate + '.json'].asText());
  }
  var users = JSON.parse(zip.files['users.json'].asText());
  var channels = JSON.parse(zip.files['channels.json'].asText());
  var channelDates = []; // used for advancing
  var channelDateRegex = /^([^\/]*)\/([^\/]*)$/;
  function dateFirstComparison(a, b) {
    return a.replace(channelDateRegex, '$2$1') <
      b.replace(channelDateRegex, '$2$1') ? -1 : 1;
  }

  var filenames = Object.keys(zip.files).sort(dateFirstComparison);

  for (var i = 0; i < filenames.length; i++) {
    var filename = filenames[i];
    if (/^[^\/]+\/[^\/]+\.json$/.test(filename)) {
      channelDates.push(filename.replace(/\.json$/,''));
    }
  }

  return {
    users: users,
    channels: channels,
    usersById: mapById(users),
    channelsById: mapById(channels),
    getMessagesForChannelDate: getMessagesForChannelDate,
    channelDates: channelDates
  };
}
