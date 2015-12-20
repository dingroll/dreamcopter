/* global URL jsyaml cre reslackedDb slackArchive reslackPlan */

var elDaysList = document.getElementById('days');
var topTagsBar = document.getElementById('tags');

var currentSlackChannel;
var currentSlackDate;

var currentDayReslacked;

var reslackStatusesByChannelDate;
var slackDump;

var teDayListItem = cre('li.day-item');
var dayListItemsByChannelDate = new Map();

var teDingrollMessage = cre('.dingroll-message', {wall: true}, [
  cre('.tag-line',[
    cre('select', {part: 'group-select'}),
    cre('button', {type: 'button', part: 'delete-message'}, '(Delete)'),
    cre('button', {type: 'button', part: 'grab-tags'}, '^-Grab-'),
    cre('input', {type: 'text', part: 'message-tags',
      pattern: "[ a-zA-Z0-9_-]*"}),
    cre('button', {type: 'button', part: 'apply-tags'}, "<-Apply-'")
  ]),
  cre('textarea', {part: 'message-body'})
]);

var teSlackMessage = cre('.slack-message', {wall: true}, [
  cre('div', {part: 'source-area'}, [
    cre('div', {part: 'description-line'}, [
      cre('span', {part: 'username'}),
      cre('span', {part: 'timestamp'}),
      cre('button', {type: 'button', part: 'show-source'}, 'Show original'),
    ]),
    cre('div', {part: 'source-details', hidden: true}, [
      cre('p', {part: 'original-message'}),
      // This textarea holds extra JSON to accompany this Slack message's
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
      cre('button', {type: 'button', part: 'add-dingroll-message'},
        'Add DingRoll message')
    ])
  ])
]);

var migrationProfile; // aka reslackPlan

function createDayListItem(channel, date) {
  var channelDate = channel + '/' + date;
  var li = cre(teDayListItem, {textContent: channel + ' ' + date});
  var dayStatus = reslackStatusesByChannelDate &&
    reslackStatusesByChannelDate.get(channelDate);
  if (dayStatus) {
    if (dayStatus.ready) li.classList.add('ready');
    else li.classList.add('partial');
  }
  li.addEventListener('click', openDay.bind(null, channel, date));
  dayListItemsByChannelDate.set(channelDate, li);
  return li;
}

function createDingrollMessageElement(dingrollMessage) {
  var root = cre(teDingrollMessage);
  // TODO: populate group select
  root.getPart('delete-message').addEventListener('click', function() {
    root.remove();
  });
  var messageTagsBar = root.getPart('message-tags');
  root.getPart('grab-tags').addEventListener('click', function() {
    topTagsBar.value = messageTagsBar.value;
  });
  root.getPart('apply-tags').addEventListener('click', function() {
    messageTagsBar.value = topTagsBar.value;
  });
  root.getPart('message-body').value = dingrollMessage.body;
  messageTagsBar.value = dingrollMessage.tags.join(' ');
  return root;
}

function createSlackMessageElement(slackMessage) {
  var root = cre(teSlackMessage);
  root.getPart('username').textContent = slackMessage.username;
  // TODO: hook up "Show original"
  var lastMessage = root.getPart('new-dingroll-message');
  // TODO: hook up additional message creator
  var dingrollMessageContainer = root.getPart('dingroll-messages');
  var dingrollMessages = slackMessage.dingrollMessages;
  for (var i = 0; i < dingrollMessages.length; i++) {
    dingrollMessageContainer.insertBefore(
      createDingrollMessageElement(dingrollMessages[i]),
      lastMessage);
  }
  return root;
}

function dingrollMessageFromElement(root) {
  return {
    group: root.getPart('group-select').value.textContent,
    body: root.getPart('message-body').value,
    tags: root.getPart('message-tags').value.split(/\s+/g)
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

// Populates elements for named channel and date.
function openDay(channel, date) {
  removeChildren(elMessageContainer);
  // Get any existing document for the new day
  // or create an initial document if there isn't any for today
  reslackedDb.getChannelDayMessages(channel + '/' + date)
    .then(function(doc){
      currentDayReslacked = migrationProfile.freshDayDoc(channel, date, doc);
      var slackMessages = currentDayReslacked.messages;
      for (var i = 0; i < slackMessages.length; i++) {
        elMessageContainer.appendChild(
          createSlackMessageElement(slackMessages[i]));
      }
    });
}

function saveCurrentDay() {
  updateDayDocMessages();
  return reslackedDb.saveDay(
    currentSlackChannel + '/' + currentSlackDate,
    currentDayReslacked);
}

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
  } while (nextDayIndex != start && status && status.ready);

  // if all days are found to be ready, just go to the next one
  if (nextDayIndex == start) nextDayIndex = (nextDayIndex + 1) % dayCount;

  openDay.apply(null, slackDump.channelDates[nextDayIndex].split('/'));
}

function saveAndReadyAnother() {
  return saveCurrentDay().then(openNextNonReadyDay);
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

function toggleVisibility(element) {
  element.hidden = !element.hidden;
}

showDaysButton.addEventListener('click',
  toggleVisibility.bind(null, elDaysList));

function loadMigrationPlan(planYaml) {
  migrationProfile = reslackPlan(jsyaml.safeLoad(planYaml));
  if (slackDump) migrationProfile.loadSlackArchive(slackDump);
  // TODO: reload stuff to reflect changes to plan
}

setGroupsButton.addEventListener('click', function setGroups() {
  if (migrationProfileTextArea.hidden) {
    migrationProfileTextArea.hidden = false;
  } else {
    try {
      loadMigrationPlan(migrationProfileTextArea.value);
      migrationProfileTextArea.hidden = true;
    } catch (err) {
      // TODO: handle invalid YAML better
      console.error(err);
    }
  }
});

// TODO: load ready statuses
// TODOL update ready statuses in UI on retrieval
// TODO: update ready statuses in UI on save

saveButton.addEventListener('click', saveCurrentDay);
anotherButton.addEventListener('click', saveAndReadyAnother);
