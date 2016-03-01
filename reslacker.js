/* global URL jsyaml cre reslackedDb slackArchive reslackPlan */

var elDaysList = document.getElementById('days');

var currentSlackChannel;
var currentSlackDate;

// Things that are grody about this file, part 1: no distinction between
// slack message data from the dump and slack message data in the converted
// document (what should be called a "message group" or something like that).
var currentDayReslacked;

var reslackStatusesByChannelDate;
var slackDump;

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
var applyButton = document.getElementById('apply-global');
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

applyButton.addEventListener('click', function() {
  var dingrollMessageElements =
    elMessageContainer.getElementsByClassName('dingroll-message');
  for (var i = 0; i < dingrollMessageElements.length; i++) {
    var root = dingrollMessageElements[i];
    if (root.getPart('message-selected').checked) {
      root.getPart('message-tags').value = globalTags.value;
      root.getPart('group-select').value = globalGroup.value;
    }
  }
});
clearSelectionButton.addEventListener('click', function() {
  var dingrollMessageElements =
    elMessageContainer.getElementsByClassName('dingroll-message');
  for (var i = 0; i < dingrollMessageElements.length; i++) {
    dingrollMessageElements[i].getPart('message-selected').checked = false;
  }
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
  });
  root.getPart('message-body').value = dingrollMessage.body;
  var fl = dingrollMessage.filterLength;
  messageTagsBar.value =
    dingrollMessage.tags.slice(0, fl).join(' ') + ' : ' +
    dingrollMessage.tags.slice(fl).join(' ');
  var messageCheckbox = root.getPart('message-selected');
  root.getPart('check-down').addEventListener('click', function() {
    var dingrollMessageElements =
      elMessageContainer.getElementsByClassName('dingroll-message');
    var belowCurrent = false;
    for (var i = 0; i < dingrollMessageElements.length; i++) {
      var prospect = dingrollMessageElements[i];
      if (belowCurrent) {
        // TODO: Don't select both crossposts on one Slack message?
        prospect.getPart('message-selected').checked = messageCheckbox.checked;
      } else if (prospect == root) {
        belowCurrent = true;
      }
    }
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
  var tagHalves = root.getPart('message-tags').value.split(':',2);
  var filterTags = tagHalves[0].trim().split(/\s+/g);
  var supplementalTags = tagHalves[1].trim().split(/\s+/g);
  return {
    group: root.getPart('group-select').value,
    body: root.getPart('message-body').value,
    tags: filterTags.concat(supplementalTags),
    filterLength: filterTags.length
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

function wrappedBehind(arr, v) {
  return arr[0] == v ? arr[arr.length - 1] : arr[arr.indexOf(v) - 1];
}
function wrappedAhead(arr, v) {
  return arr[arr.length - 1] == v ? arr[0] : arr[arr.indexOf(v) + 1];
}

var datePreviousLabel = document.getElementById('date-previous-name');
var dateNextLabel = document.getElementById('date-next-name');
var channelPreviousLabel = document.getElementById('channel-previous-name');
var channelNextLabel = document.getElementById('channel-next-name');
var currentChannelDayLabel = document.getElementById('day-readout');

// Populates elements for named channel and date.
function openDay(channel, date) {
  if (currentSlackChannel && currentSlackDate) {
    var lastChannelDate = currentSlackChannel + '/' + currentSlackDate;
    var liLast = dayListItemsByChannelDate.get(lastChannelDate);
    liLast.classList.remove('current');
  }

  // HACK: state leakage - this gets used in a few places in this file
  currentSlackChannel = channel;
  currentSlackDate = date;

  var channelDate = channel + '/' + date;
  var datesForChannel = slackDump.datesByChannel.get(channel);

  // Clear the previously-loaded message elements
  removeChildren(elMessageContainer);

  // Get any existing document for the new day
  // or create an initial document if there isn't any for today
  reslackedDb.getChannelDay(channelDate).then(function (doc) {

    currentDayReslacked = migrationProfile.freshDayDoc(channel, date, doc);
    var slackMessages = currentDayReslacked.messages;

    datePreviousLabel.textContent =
      wrappedBehind(slackDump.channelDates, channelDate).replace('/', ' ');
    dateNextLabel.textContent =
      wrappedAhead(slackDump.channelDates, channelDate).replace('/', ' ');
    channelPreviousLabel.textContent =
      channel + ' ' + wrappedBehind(datesForChannel, date);
    channelNextLabel.textContent =
      channel + ' ' + wrappedAhead(datesForChannel, date);
    currentChannelDayLabel.textContent = channel + ' ' + date;

    for (var i = 0; i < slackMessages.length; i++) {
      elMessageContainer.appendChild(
        createSlackMessageElement(slackMessages[i]));
    }

    var li = dayListItemsByChannelDate.get(channelDate);
    li.classList.add('current');
    li.scrollIntoView();
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

function openPreviousDay() {
  return openDay.apply(null, wrappedBehind(slackDump.channelDates,
    currentSlackChannel + '/' + currentSlackDate).split('/'));
}

function openNextDay() {
  return openDay.apply(null, wrappedAhead(slackDump.channelDates,
    currentSlackChannel + '/' + currentSlackDate).split('/'));
}

function openPreviousDayForChannel() {
  return openDay(currentSlackChannel, wrappedBehind(
    slackDump.datesByChannel.get(currentSlackChannel), currentSlackDate));
}

function openNextDayForChannel() {
  return openDay(currentSlackChannel, wrappedAhead(
    slackDump.datesByChannel.get(currentSlackChannel), currentSlackDate));
}

document.getElementById('date-previous')
  .addEventListener('click', openPreviousDay);
document.getElementById('date-next')
  .addEventListener('click', openNextDay);
document.getElementById('channel-previous')
  .addEventListener('click', openPreviousDayForChannel);
document.getElementById('channel-next')
  .addEventListener('click', openNextDayForChannel);

function openNextNonReadyDay() {
  var dayCount = slackDump.channelDates.length;
  var start = slackDump.channelDates.indexOf(
    currentSlackChannel + '/' + currentSlackDate);
  var nextDayIndex = start;
  var status;

  // advance as long as the next day is ready
  do {
    nextDayIndex = (nextDayIndex + 1) % dayCount;
    status = reslackStatusesByChannelDate &&
      reslackStatusesByChannelDate.get(slackDump.channelDates[nextDayIndex]);
  } while (nextDayIndex != start && status == 'ready');

  // if all days are found to be ready, just go to the next one
  if (nextDayIndex == start) nextDayIndex = (nextDayIndex + 1) % dayCount;

  openDay.apply(null, slackDump.channelDates[nextDayIndex].split('/'));
}

function saveIncompleteDay() {
  currentDayReslacked.status = 'incomplete';
  return saveCurrentDay();
}

function saveReadyDay() {
  currentDayReslacked.status = 'ready';
  return saveCurrentDay();
}

function initSlack(archive) {
  slackDump = archive;
  if (migrationProfile) migrationProfile.loadSlackArchive(archive);
  var channelDates = archive.channelDates;
  for (var i = 0; i < channelDates.length; i++) {
    elDaysList.appendChild(
      createDayListItem.apply(null, channelDates[i].split('/')));
  }
  // HACK: We open the *first* non-ready day by pretending we're at the last
  // day, then wrapping around.
  var lastDay = channelDates[channelDates.length-1].split('/');
  currentSlackChannel = lastDay[0];
  currentSlackDate = lastDay[1];
  openNextNonReadyDay();
}

function importSlackZip(file) {
  var fileReader = new FileReader();
  fileReader.onload = function() {
    initSlack(slackArchive(this.result));
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
var migrationProfileTextArea = document.getElementById('migration');
var saveButton = document.getElementById('save');
var anotherButton = document.getElementById('another');
var setSyncAddressButton = document.getElementById('export');
var syncAddressInput = document.getElementById('sync-address');

function toggleVisibility(element) {
  element.hidden = !element.hidden;
}

showDaysButton.addEventListener('click',
  toggleVisibility.bind(null, elDaysList));

function loadMigrationPlan(planYaml) {
  migrationProfile = reslackPlan(jsyaml.safeLoad(planYaml));
  if (slackDump) migrationProfile.loadSlackArchive(slackDump);

  removeChildren(globalGroup);
  populateSelect(globalGroup);
  // TODO: reload more stuff to reflect changes to plan
}

setGroupsButton.addEventListener('click', function setGroups() {
  if (migrationProfileTextArea.hidden) {
    migrationProfileTextArea.hidden = false;
  } else {
    try {
      reslackYaml = migrationProfileTextArea.value;
      // load the plan
      loadMigrationPlan(reslackYaml);
      // save the plan for future visits
      localStorage.setItem('reslackPlan', reslackYaml);
      // hide the plan edit region
      migrationProfileTextArea.hidden = true;
    } catch (err) {
      // TODO: handle invalid YAML better
      console.error(err);
    }
  }
});

var reslackYaml = localStorage.getItem('reslackPlan');
if (reslackYaml) {
  migrationProfileTextArea.value = reslackYaml;
  loadMigrationPlan(reslackYaml);
}

var syncAddress = localStorage.getItem('dreamcopterSyncAddress');
if (syncAddress) {
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

saveButton.addEventListener('click', saveIncompleteDay);
anotherButton.addEventListener('click', saveReadyDay);
