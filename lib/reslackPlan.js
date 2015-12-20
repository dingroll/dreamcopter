/* global uuid */

function reslackPlan(desc) {
  var definedGroupsByChannelName = new Map();
  var skippedChannels = new Set();
  var definedChannels = Object.keys(desc.channelgroups);

  var slackDump;
  function loadSlackArchive(dump) {
    slackDump = dump;
  }

  function arrayed(v) {
    return Array.isArray(v) ? v : [v];
  }

  for (var i = 0; i < definedChannels.length; i++) {
    var channelName = definedChannels[i];
    var groupList = desc.channelgroups[channelName];
    if (groupList == 'skip') {
      skippedChannels.add(channelName);
    } else if (Array.isArray(groupList)) {
      var groupTags = new Map();
      for (var j = 0; j < groupList.length; j++) {
        var groupDesc = groupList[j];
        if (typeof groupDesc == 'string') {
          groupTags.set(groupDesc, [channelName]);
        } else if (groupDesc.group && groupDesc.tags) {
          groupTags.set(groupDesc.group, arrayed(groupDesc.tags));
        }
      }
      definedGroupsByChannelName.set(channelName, groupTags);
    } else {
      console.warn(channelName + ' is defined as ' + groupList + '? IDK');
    }
  }

  var entities = {
    lt: '<',
    gt: '>',
    amp: '&'
  };

  // Exposed externally for when instantiating a new group version of a message
  function slackMessageToDingroll(body) {
    return body.replace(/<([^>]+)>/g, function(match, inside) {
      if (inside.slice(0, 1) == '#') {
        return slackDump.channelsById(inside.slice(1)).name;
      } else if (inside.slice(0,1) == '@' && inside.indexOf('|') > -1) {
        return slackDump.usersById(inside.slice(1, inside.indexOf('|'))).name;
      } else return inside; // slack angle-wraps links etc
    }).replace(/\&([^;]+);/g, function(match, entname) {
      return entities[entname] || match;
    });
  }

  function tagsForGroup(channelName, groupName) {
    var groups = definedGroupsByChannelName.get(channelName);
    return groups && groups.get(groupName) || [channelName];
  }

  function priorityGroups(channel) {
    var groups = definedGroupsByChannelName;
    return groups ? Array.from(groups.keys()) : [];
  }

  function defaultMessage(channel, slackMessage) {
    var firstGroup = priorityGroups(channel)[0];
    var defDoc = {
      slackTs: slackMessage.ts,
      // TODO: Add local timestamp (UTC + offset)?
      username: slackDump.usersById.get(slackMessage.user).name,
      dingrollMessages: firstGroup && !slackMessage.subtype ? [{
        group: firstGroup,
        tags: tagsForGroup(firstGroup),
        body: slackMessageToDingroll(slackMessage.text)
      }] : []
    };
    if (slackMessage.subtype) defDoc.slackSubtype = slackMessage.subtype;
    return defDoc;
  }

  function freshDayDoc(channel, date, saved) {
    var channelDate = channel + '/' + date;
    var slackMessages = slackDump.getMessagesForChannelDate(channelDate);
    var docMessages = saved && saved.messages || [];
    var dayDoc = saved || {
      _id: channelDate,
      messages: docMessages
    };
    for (var i = 0; i < slackMessages.length; i++) {
      // TODO: handle skipping over messages that have been deleted
      docMessages[i] = docMessages[i] ||
        defaultMessage(channel, slackMessages[i]);
    }
    return dayDoc;
  }

  return {
    loadSlackArchive: loadSlackArchive,
    freshDayDoc: freshDayDoc,
    slackMessageToDingroll: slackMessageToDingroll
  };
}