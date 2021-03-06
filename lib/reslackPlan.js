/* global uuid */

function reslackPlan(desc) {
  var definedGroupsByChannelName = new Map();
  var skippedChannels = new Set();
  var definedChannels = Object.keys(desc.channelgroups);
  var knownGroups = Object.keys(desc.dingroll.groups);

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

  function getSlackUsername(userId) {
    // bot messages (other than slackbot) come from a "bot_id", not a user,
    // and since I don't plan on translating any bot posts to DingRoll,
    // it's not worth distinguishing them. As such, any non-user posts just
    // get a dummy value.
    if (!userId) return 'nobody';

    var userData = slackDump.usersById.get(userId);

      // slackbot (USLACKBOT) doesn't have a user entry -
      // any other users without entries might as well be slackbot
      // as far as I'm concerned
    return userData ? userData.name : 'slackbot';
  }

  // Exposed externally for when instantiating a new group version of a message
  function slackMessageToDingroll(body) {
    return body.replace(/<([^>]+)>/g, function(match, inside) {

      // if it's a channel reference
      if (/^#/.test(inside)) {
        // use the channel name as a hashtag
        var channelId = inside.slice(1);
        var channel = slackDump.channelsById.get(inside.slice(1));
        if (channel) {
          return '#' + channel.name;
        } else {
          console.warn('Channel not found: ' + channelId);
          return '#' + channelId;
        }

      // if it's a user reference
      } else if (/^@/.test(inside)) {
        // if it's a reference with the name saved
        if (inside.indexOf('|') > -1) {
          // discard that saved name and leading @
          inside = inside.slice(1, inside.indexOf('|'));
        // otherwise
        } else {
          // just discard the leading @
          inside = inside.slice(1);
        }

        // Use the user's listed username
        return '@' + getSlackUsername(inside);

      // if it's a hyperlink
      } else if (/^(?:mailto|https?):/.test(inside)) {
        // if it's an inferred hyperlink
        if (inside.indexOf('|') > -1) {
          // use the original, non-inferred-link text
          return inside.slice(inside.indexOf('|')+1);
        // if it's a plain link
        } else {
          // just use the whole link
          return inside;
        }

      } else return match; // let me see what this case is
    }).replace(/\&([^;]+);/g, function(match, entname) {
      return entities[entname] || match;
    });
  }

  function tagsForChannelGroup(channelName, groupName) {
    var groups = definedGroupsByChannelName.get(channelName);
    return groups && groups.get(groupName) || [channelName];
  }

  function priorityGroups(channel) {
    var groups = definedGroupsByChannelName.get(channel);
    return groups ? Array.from(groups.keys()) : [];
  }

  function groupsForChannel(channel) {
    var groups = priorityGroups(channel);
    var prioritized = new Set(groups);
    for (var i = 0; i < knownGroups.length; i++) {
      if (!prioritized.has(knownGroups[i])) {
        groups.push(knownGroups[i]);
      }
    }
    return groups;
  }

  function defaultMessage(channel, slackMessage) {
    var firstGroup = priorityGroups(channel)[0];
    var tags = tagsForChannelGroup(channel, firstGroup);
    var defDoc = {
      slackMessage: slackMessage,
      // TODO: Add local timestamp (UTC + offset)?
      username: getSlackUsername(slackMessage.user),
      dingrollMessages: firstGroup && !slackMessage.subtype ? [{
        group: firstGroup,
        tags: tags,
        filterLength: tags.length,
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
      messages: docMessages,
      status: 'initial',
      initialized: new Date().toISOString()
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
    slackMessageToDingroll: slackMessageToDingroll,
    groupsForChannel: groupsForChannel,
    tagsForChannelGroup: tagsForChannelGroup
  };
}
