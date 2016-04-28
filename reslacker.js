/* global URL jsyaml cre reslackedDb importArchive dreamPlanner */

var elDaysList = document.getElementById('days');

var currentSlackChannel;
var currentSlackDate;

var currentDayReslacked;

var reslackStatusesByChannelDate;

var teDayListItem = cre('li.day-item');
var dayListItemsByChannelDate = new Map();

var teDingrollMessage = cre('.dingroll-message', {wall: true}, [
  cre('.tag-line',[
    cre('select', {part: 'group-select'}),
    cre('button', {type: 'button', part: 'delete-message'}, '\u274C'),
    cre('button', {type: 'button', part: 'grab-tags'}, '\u2B11 Grab'),
    cre('input', {type: 'text', part: 'message-tags',
      pattern: "[ a-zA-Z0-9_-]+:[ a-zA-Z0-9_-]*"}),
    cre('input', {type: 'checkbox', part: 'message-selected'}),
    cre('button', {type: 'button', part: 'check-down'}, '\u2B0E'),
  ]),
  cre('textarea', {part: 'message-body'})
]);

var teSlackMessage = cre('.slack-message', {wall: true}, [
  cre('div', {part: 'source-area'}, [
    cre('div', {part: 'description-line'}, [
      cre('span', {part: 'username'}),
      cre('span', {part: 'subtype'}),
      cre('button', {type: 'button', part: 'show-source'}, 'Show original'),
      cre('span', {part: 'timestamp'})
    ]),
    cre('div', {part: 'source-details', hidden: true}, [
      cre('pre', {part: 'original-message'}),
      // This textarea holds extra YAML to accompany this Slack message's
      // migrated DingRoll stuff, to address long-tail tweaks like "make the
      // second message an hour later" or "change this to come from another
      // user". These tweaks will be invented ad-hoc as necessary, then
      // baked into the import process that handles these migrations.
      cre('textarea', {part: 'source-override'})
    ])
  ]),
  cre('div', {part: 'dingroll-messages'}, [

    // new messages get inserted here

    cre('div.new-dingroll-message', {part: 'new-dingroll-message'}, [
      cre('select', {part: 'new-dingroll-message-group'}),
      cre('button', {type: 'button', part: 'add-dingroll-message'}, '\u2795')
    ])
  ])
]);

var globalTags = document.getElementById('global-tags');
var globalGroup = document.getElementById('global-group');
var addGlobalButton = document.getElementById('add-global');
var removeGlobalButton = document.getElementById('remove-global');
var applyGlobalButton = document.getElementById('apply-global');
var selectionCount = 0;
var selectionCountOutput = document.getElementById('selection-count');
var clearSelectionButton = document.getElementById('clear-selection');

function javaHashCode(str) {
  var hash = 0;
  if (str.length == 0) return hash;
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i);
    hash = (((hash<<5)-hash)+char) & 0xFFFFFFFF;
  }
  return hash;
}

function hslForString(str) {
  return 'hsl(' + (javaHashCode(str) % 360) + ',80%,45%)';
}

function setGlobalOperationVisibility() {
  var applyMode = /:/.test(globalTags.value);
  addGlobalButton.hidden = removeGlobalButton.hidden = applyMode;
  applyGlobalButton.hidden = !applyMode;
}

globalTags.addEventListener('input', setGlobalOperationVisibility);

function forSelectedMessages(f) {
  var dingrollMessageElements =
    elMessageContainer.getElementsByClassName('dingroll-message');
  for (var i = 0; i < dingrollMessageElements.length; i++) {
    var root = dingrollMessageElements[i];
    if (root.getPart('message-selected').checked) {
      f(root);
    }
  }
}

function spaceSeparatedSpans (s) {
  s = s.trim();
  return s == '' ? [] : s.split(/\s+/g);
}

function tagStringToLists(tagString) {
  return tagString.split(':', 2).map(spaceSeparatedSpans);
}

function tagListsToString(tagLists) {
  return tagLists.map(function(list) {return list.join(' ')}).join(' : ');
}

function addGlobalTags() {
  var globalTagList = globalTags.value.split(/\s+/g);
  return forSelectedMessages(function(root) {
    var messageTagsInput = root.getPart('message-tags');
    var messageTagLists = tagStringToLists(messageTagsInput.value);
    var searchList = messageTagLists[0].concat(messageTagLists[1]);
    for (var i = 0; i < globalTagList.length; i++) {
      if (searchList.indexOf(globalTagList[i]) < 0) {
        messageTagLists[1].push(globalTagList[i]);
      }
    }
    messageTagsInput.value = tagListsToString(messageTagLists);
  });
}

function removeGlobalTags() {
  // TODO: normalize tags (not a big deal, but technically correct)
  var globalTagList = globalTags.value.split(/\s+/g);
  function tagNotInGlobalTags(tag) {
    return globalTagList.indexOf(tag) < 0;
  }
  return forSelectedMessages(function(root) {
    var messageTagsInput = root.getPart('message-tags');
    messageTagsInput.value = tagListsToString(
      tagStringToLists(messageTagsInput.value).map(function(half){
        return half.filter(tagNotInGlobalTags);
      }));
  });
}

function applyGlobalTags() {
  var globalTagsValue = globalTags.value;
  var globalGroupValue = globalGroup.value;
  return forSelectedMessages(function(root) {
    root.getPart('message-tags').value = globalTagsValue;
    root.getPart('group-select').value = globalGroupValue;
  });
}

addGlobalButton.addEventListener('click', addGlobalTags);
removeGlobalButton.addEventListener('click', removeGlobalTags);
applyGlobalButton.addEventListener('click', applyGlobalTags);

clearSelectionButton.addEventListener('click', function() {
  var dingrollMessageElements =
    elMessageContainer.getElementsByClassName('dingroll-message');
  for (var i = 0; i < dingrollMessageElements.length; i++) {
    dingrollMessageElements[i].getPart('message-selected').checked = false;
  }
  selectionCountOutput.textContent = selectionCount = 0;
});

var migrationProfile; // aka reslackPlan

function updateDayListItemStatus(channelDate) {
  var li = dayListItemsByChannelDate.get(channelDate);
  var dayStatus = reslackStatusesByChannelDate &&
    reslackStatusesByChannelDate.get(channelDate);
  if (dayStatus == 'ready') {
    li.classList.remove('partial');
    li.classList.add('ready');
  }
  else if (dayStatus == 'incomplete') {
    li.classList.remove('ready');
    li.classList.add('partial');
  }
}

function createDayListItem(channel, date) {
  var channelDate = channel + '/' + date;
  var li = cre(teDayListItem, {textContent: channel + ' ' + date});
  dayListItemsByChannelDate.set(channelDate, li);
  updateDayListItemStatus(channelDate);
  li.addEventListener('click', openDay.bind(null, channel, date));
  return li;
}

function populateSelect(select, initial) {
  var groupNames = migrationProfile.groupsForChannel(currentSlackChannel);
  for (var i = 0; i < groupNames.length; i++) {
    select.appendChild(cre('option', groupNames[i]));
  }
  if (initial) {
    select.selectedIndex = groupNames.indexOf(initial);
  }
  return select;
}

function createDingrollMessageElement(dingrollMessage) {
  var root = cre(teDingrollMessage);
  var groupSelect = root.getPart('group-select');
  populateSelect(groupSelect, dingrollMessage.group);
  root.getPart('delete-message').addEventListener('click', function() {
    root.remove();
  });
  var messageTagsBar = root.getPart('message-tags');
  root.getPart('grab-tags').addEventListener('click', function() {
    globalGroup.value = groupSelect.value;
    globalTags.value = messageTagsBar.value;
    setGlobalOperationVisibility();
  });
  root.getPart('message-body').value = dingrollMessage.body;
  var fl = dingrollMessage.filterLength;
  messageTagsBar.value =
    dingrollMessage.tags.slice(0, fl).join(' ') + ' : ' +
    dingrollMessage.tags.slice(fl).join(' ');
  var messageCheckbox = root.getPart('message-selected');
  messageCheckbox.addEventListener('click', function() {
    selectionCount += messageCheckbox.checked ? 1 : -1;
    selectionCountOutput.textContent = selectionCount;
  });
  root.getPart('check-down').addEventListener('click', function() {
    var dingrollMessageElements =
      elMessageContainer.getElementsByClassName('dingroll-message');
    var belowCurrent = false;
    for (var i = 0; i < dingrollMessageElements.length; i++) {
      var prospect = dingrollMessageElements[i];
      if (belowCurrent) {
        var prospectSelection = prospect.getPart('message-selected');
        // TODO: Only select DingRoll messages for the same group
        if (prospectSelection.checked != messageCheckbox.checked) {
          prospectSelection.checked = messageCheckbox.checked;
          selectionCount += messageCheckbox.checked ? 1 : -1;
        }
      } else if (prospect == root) {
        belowCurrent = true;
      }
    }
    selectionCountOutput.textContent = selectionCount;
  });
  return root;
}

function setNewGroupSelection(dingrollMessageEls, newGroup) {
  var newGroupIndex = 0;
  var groupHasIndex = true;
  while (newGroupIndex < newGroup.length && groupHasIndex) {

    groupHasIndex = false;
    for (var j = 0; j < dingrollMessageEls.length && !groupHasIndex; j++) {
      var messageGroup = dingrollMessageEls[j].getPart('group-select');
      if (messageGroup.selectedIndex == newGroupIndex) groupHasIndex = true;
    }
    if (groupHasIndex) ++newGroupIndex;
  }
  if (newGroupIndex == newGroup.length) newGroupIndex = 0;
  newGroup.selectedIndex = newGroupIndex;
}

function dateFromSlackTs(ts) {
  return new Date(parseInt(ts.replace(/\.\d+$/,''),10)*1000);
}

function createSlackMessageElement(messages) {
  var originalSlackMessage = messages.slackMessage;
  var root = cre(teSlackMessage);
  root.getPart('username').textContent = messages.username;
  root.style.background = hslForString(messages.username);
  root.getPart('timestamp').textContent =
    dateFromSlackTs(originalSlackMessage.ts).toISOString()
      .replace(/T(\d\d:\d\d:\d\d)\.\d\d\dZ$/,' $1');
  if (originalSlackMessage.subtype) {
    root.getPart('subtype').textContent = originalSlackMessage.subtype;
  }
  var originalSection = root.getPart('source-details');
  var showOriginalButton = root.getPart('show-source');
  var originalMessageArea = root.getPart('original-message');
  showOriginalButton.addEventListener('click', function() {
    if (originalSection.hidden) {
      showOriginalButton.textContent = 'Hide original';
      originalMessageArea.textContent = originalMessageArea.textContent ||
        JSON.stringify(originalSlackMessage, null, 2);
      originalSection.hidden = false;
    } else {
      showOriginalButton.textContent = 'Show original';
      originalSection.hidden = true;
    }
  });
  var lastMessage = root.getPart('new-dingroll-message');
  var dingrollMessageContainer = root.getPart('dingroll-messages');
  var dingrollMessages = messages.dingrollMessages;
  var initialDingrollMessageElements = [];
  for (var i = 0; i < dingrollMessages.length; i++) {
    initialDingrollMessageElements[i] =
      createDingrollMessageElement(dingrollMessages[i]);
  }
  dingrollMessageContainer.insertBefore(
    cre(initialDingrollMessageElements), lastMessage);
  var newGroup = root.getPart('new-dingroll-message-group');
  populateSelect(newGroup);
  setNewGroupSelection(initialDingrollMessageElements, newGroup);
  function createAdditionalMessage () {
    var newGroupName = newGroup.value;
    var tags =  migrationProfile.tagsForChannelGroup(
      currentSlackChannel, newGroupName);
    dingrollMessageContainer.insertBefore(createDingrollMessageElement({
      group: newGroupName,
      body: migrationProfile.slackMessageToDingroll(
        originalSlackMessage.text),
      tags: tags,
      filterLength: tags.length
      }), lastMessage);
    setNewGroupSelection(
      dingrollMessageContainer.getElementsByClassName('dingroll-message'),
      newGroup);
  }
  root.getPart('add-dingroll-message').addEventListener('click',
    createAdditionalMessage);
  return root;
}

function dingrollMessageFromElement(root) {
  var tagLists = tagStringToLists(root.getPart('message-tags').value);
  return {
    group: root.getPart('group-select').value,
    body: root.getPart('message-body').value,
    tags: tagLists[0].concat(tagLists[1]),
    filterLength: tagLists[0].length
  };
}

function updateDayDocMessages() {
  var slackMessageElements =
    elMessageContainer.getElementsByClassName('slack-message');
  for (var i = 0; i < slackMessageElements.length; i++) {
    var newDingrollMessages = [];
    var dingrollMessageElements =
      slackMessageElements[i].getElementsByClassName('dingroll-message');
    for (var j = 0; j < dingrollMessageElements.length; j++) {
      newDingrollMessages[j] =
        dingrollMessageFromElement(dingrollMessageElements[j]);
    }
    currentDayReslacked.messages[i].dingrollMessages = newDingrollMessages;
  }
}

function removeChildren(element) {
  while (element.lastChild) {
    element.removeChild(element.lastChild);
  }
}

var elMessageContainer = document.getElementById('messages');

var neighbors = {
  channel: {
    next: null,
    previous: null
  },
  date: {
    next: null,
    previous: null
  }
};

var neighborLabels = {
  channel: {
    next: document.getElementById('channel-next-name'),
    previous: document.getElementById('channel-previous-name')
  },
  date: {
    next: document.getElementById('date-next-name'),
    previous: document.getElementById('date-previous-name')
  }
};

var currentChannelDayLabel = document.getElementById('day-readout');

// Populates elements for named channel and date.
function openDay(channel, date) {
  function setNeighbor(type, direction) {
    return function (channelDate) {
      neighbors[type][direction] = channelDate;
      neighborLabels[type][direction].textContent =
        channelDate.replace('/',' ');
    };
  }
  if (currentSlackChannel && currentSlackDate) {
    var lastChannelDate = currentSlackChannel + '/' + currentSlackDate;
    var liLast = dayListItemsByChannelDate.get(lastChannelDate);
    liLast.classList.remove('current');
  }

  // HACK: state leakage - this gets used in a few places in this file
  currentSlackChannel = channel;
  currentSlackDate = date;

  var channelDate = channel + '/' + date;

  // Clear the previously-loaded message elements
  removeChildren(elMessageContainer);
  selectionCountOutput.textContent = selectionCount = 0;

  // Get any existing document for the new day
  // or create an initial document if there isn't any for today
  reslackedDb.getChannelDay(channelDate).then(function (doc) {

    currentDayReslacked = migrationProfile.freshDayDoc(channel, date, doc);
    var slackMessages = currentDayReslacked.messages;

    reslackedDb.getNextChannelDate()
      .then(setNeighbor('date','next'));
    reslackedDb.getPreviousChannelDate()
      .then(setNeighbor('date','previous'));
    reslackedDb.getNextDateInChannel()
      .then(setNeighbor('channel','next'));
    reslackedDb.getPreviousDateInChannel()
      .then(setNeighbor('channel','previous'));
    currentChannelDayLabel.textContent = channel + ' ' + date;

    for (var i = 0; i < slackMessages.length; i++) {
      elMessageContainer.appendChild(
        createSlackMessageElement(slackMessages[i]));
    }

    var li = dayListItemsByChannelDate.get(channelDate);
    li.classList.add('current');
    li.scrollIntoViewIfNeeded();
    // TODO: pre-fill top tag bar?
  });
}

function saveCurrentDay() {
  var savingChannelDate = currentSlackChannel + '/' + currentSlackDate;
  var savingStatus = currentDayReslacked.status;
  currentDayReslacked.committed = new Date().toISOString();
  updateDayDocMessages();
  return reslackedDb.saveChannelDay(savingChannelDate, currentDayReslacked)
    .then(function(){
      reslackStatusesByChannelDate.set(savingChannelDate, savingStatus);
      updateDayListItemStatus(savingChannelDate);
    });
}

function openChannelDate(channelDate) {
  return openDay.apply(null, channelDate.split('/'));
}

function hookupNeighborOpener(type, direction) {
  document.getElementById(type + '-' + direction)
    .addEventListener('click', function () {
      return openChannelDate(neighbors[type][direction]);
    });
}

hookupNeighborOpener('date', 'previous');
hookupNeighborOpener('date', 'next');
hookupNeighborOpener('channel', 'previous');
hookupNeighborOpener('channel', 'next');

function openFirstNonReadyDay() {
  return reslackedDb.getFirstNonReadyChannelDate().then(openChannelDate);
}

function saveIncompleteDay() {
  currentDayReslacked.status = 'incomplete';
  return saveCurrentDay();
}

function saveReadyDay() {
  currentDayReslacked.status = 'ready';
  return saveCurrentDay();
}

function importSlackZip(file) {
  var fileReader = new FileReader();
  fileReader.onload = function() {
    importArchive(this.result, reslackedDb);
  };
  fileReader.readAsArrayBuffer(file);
}

var importInput = document.getElementById('import-file');

importInput.addEventListener('change', function () {
  var file = importInput.files[0];
  if (file) importSlackZip(file);
});

var showDaysButton = document.getElementById('showdays');
var setGroupsButton = document.getElementById('set-groups');
var dreamPlanTextArea = document.getElementById('dreamplan');
var saveIntermediateButton = document.getElementById('save-intermediate');
var saveFinishedButton = document.getElementById('save-finished');
var setSyncAddressButton = document.getElementById('export');
var syncAddressInput = document.getElementById('sync-address');

function toggleVisibility(element) {
  element.hidden = !element.hidden;
}

showDaysButton.addEventListener('click',
  toggleVisibility.bind(null, elDaysList));

function loadMigrationPlan(planYaml) {
  var planObject = null;
  try {
    planObject = jsyaml.safeLoad(planYaml);
    migrationProfile = dreamPlanner(planObject);
  } catch (err) {
    // TODO: handle invalid YAML better
    console.error(err);
  }
  if (planObject && migrationProfile) {
    removeChildren(globalGroup);
    populateSelect(globalGroup);
    // TODO: reload more stuff to reflect changes to plan
  }
}

setGroupsButton.addEventListener('click', function setGroups() {
  if (dreamPlanTextArea.hidden) {
    dreamPlanTextArea.hidden = false;
  } else {
    var reslackYaml = dreamPlanTextArea.value;
    // load the plan
    loadMigrationPlan(reslackYaml);
    // save the plan for future visits
    // TODO: Don't save if the YAML's invalid?
    reslackedDb.saveMigrationPlan(reslackYaml);
    // hide the plan edit region
    dreamPlanTextArea.hidden = true;
  }
});

var syncAddress = localStorage.getItem('dreamcopterSyncAddress');
if (syncAddress) {
  syncAddressInput.value = syncAddress;
  reslackedDb.sync(syncAddress);
}

setSyncAddressButton.addEventListener('click', function setGroups() {
  if (syncAddressInput.hidden) {
    syncAddressInput.hidden = false;
  } else {
    syncAddress = syncAddressInput.value;
    // save the address for future visits
    localStorage.setItem('dreamcopterSyncAddress', syncAddress);
    // hide the input
    syncAddressInput.hidden = true;
    // start new sync
    if (syncAddress) {
      reslackedDb.sync(syncAddress);
    }
  }
});

reslackedDb.getChannelDayStatusMap().then(function(statusMap){
  // TODO: update ready statuses in UI if zip has already been loaded
  reslackStatusesByChannelDate = statusMap;
});
// TODO: update ready statuses in UI on save

saveIntermediateButton.addEventListener('click', saveIncompleteDay);
saveFinishedButton.addEventListener('click', saveReadyDay);

var planPromise = reslackedDb.getMigrationPlan().then(function(yamlSrc) {
  dreamPlanTextArea.value = yamlSrc;
  loadMigrationPlan(yamlSrc);
}).then(reslackedDb.getSlackMaps).then(migrationProfile.loadSlackMaps);

var listPromise = reslackedDb.getChannelDates()
  .then(function initDaysList(channelDates) {
  // TODO: clear existing list contents
  for (var i = 0; i < channelDates.length; i++) {
    elDaysList.appendChild(
      createDayListItem.apply(null, channelDates[i].split('/')));
  }
});

Promise.all([planPromise, listPromise]).then(openFirstNonReadyDay);
