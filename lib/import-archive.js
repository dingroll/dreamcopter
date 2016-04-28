/* global JSZip reslackedDb */

function importArchive(zipBlob, db) {
  var zip = new JSZip(zipBlob);
  function getMessagesForChannelDate(channelDate) {
    return JSON.parse(zip.files[channelDate + '.json'].asText());
  }
  var users = JSON.parse(zip.files['users.json'].asText());
  var channels = JSON.parse(zip.files['channels.json'].asText());

  var metadataPromise = reslackedDb.saveSlackMetadata(users, channels);

  var importingChannelDates = new Set();
  var filenames = Object.keys(zip.files);
  for (var i = 0; i < filenames.length; i++) {
    var filename = filenames[i];
    if (/^[^\/]+\/[^\/]+\.json$/.test(filename)) {
      var channelDate = filename.replace(/\.json$/,'');
      importingChannelDates.add(channelDate);
    }
  }

  function freshDayDoc(channel, date, saved) {
    var channelDate = channel + '/' + date;
    var slackMessages = getMessagesForChannelDate(channelDate);
    var docMessages = saved && saved.messages || [];
    var dayDoc = saved || {
      _id: channelDate,
      messages: docMessages,
      status: 'initial',
      initialized: new Date().toISOString()
    };
    for (var i = 0; i < slackMessages.length; i++) {
      // TODO: handle skipping over messages that have been deleted
      docMessages[i] = {
        slackMessage: slackMessages[i]
      };
    }
    return dayDoc;
  }

  function messageMismatches(archiveMessages, dbMessages) {
    // Create iterators for messages in DB and archive
    var iArchMessage = 0;
    var iDbMessage = 0;

    var omissions = [];
    var redactions = [];
    var edits = [];

    // For each message in the archive
    while (iArchMessage < archiveMessages.length)
      var archMessage = archMessages[iArchMessage];
      var dbMessage = dbMessages[iDbMessage];
      var archMessageTs = archMessage.ts;
      var dbMessageTs = dbMessage.ts;
      // If the corresponding message in the DB is prior to this
      if (dbMessageTs < archMessageTs) {
        // Note the redaction
        redactions.push(iDbMessage);
        // If it has no committed DingRoll equivalents
          // Delete it
      // Else, if the message comes after this
      } else if (dbMessageTs > archMessageTs) {
        // If we're not at
        // Insert an object for this message
      // Else, if the message ID is the same
      } else {
        // Ensure the message content is up to date
        if (archMessage.edited && archMessage.edited.ts > dbMessage.edited) {
          edits.push(iArchMessage);
        }
      }

    // FOR CONSIDERATION: Alternate less-rigorous comparison:
    // Check if equal number of messages, with identical extents
    // (the problem with this is that it would miss edits)
  }

  // TODO: Implement the following

  var messageOperations = [];
  // Get list of channeldates in archive with channel IDs and message IDs
    // with corresponding edit times where applicable

  // For each channeldate in archive
    // check messageMismatches
    // Compare channel name with ID
    // If there were any messages mismatched, or the name was off,
    // or any required field was missing
      // Retrieve the full document and apply patches
      // If this was marked as 'ready' and messages were added or edited,
        // re-mark as 'intermediate' (TODO: deletions too?)
      // Push to original, or new, channel name

  // For each channeldate not in archive
    // Create a new initial document for it (without DingRoll messages)
}
