/* global URL fetch cre */

// v4 UUID generator, adapted from https://gist.github.com/LeverOne/1308368
function uuid() {
  var a = 0;
  var b = '';
  while(a++<36)
    b+=a*51&52?(a!=15?8^Math.random()*(a!=20?16:4):4).toString(16):'-';
  return b;
}

var daysList = document.getElementById('days');

var content;

var currentSlackChannelIndex;
var currentSlackDayIndex;
var currentDay;

function createDingrollVersionOfMessage(slackMessage) {
  return slackMessage.replace(/<([^>]+)>/, function(match, inside) {
    if (inside.slice(0, 1) == '#') {
      return content.dingroll.channels[inside.slice(1)].name;
    } else if (inside.slice(0,1) == '@' && inside.indexOf('|') > -1) {
      return content.dingroll.users[inside.slice(1, inside.indexOf('|'))].name;
    } else return match;
  });
}

function createCurrentDayMessages() {
  var slackChannel = content.slack.channels[currentSlackChannelIndex];
  var slackChannelId = slackChannel.id;
  var slackDayDate = slackChannel.days[currentSlackDayIndex];
}

var dayListItem = cre('li.day-item');
function createDayListItem(channel, day) {
  var slackChannel = content.slack.channels[channel];
  var slackDay = slackChannel.days[day];
  var dayDate = slackDay.date;
  var dingrollChannel = content.dingroll.channels[slackChannel.id];
  var dingrollDay = dingrollChannel[dayDate];
  var li = cre(dayListItem,
    {textContent: dingrollChannel.name + ' ' + dayDate});
  if (dingrollDay) {
    if (dingrollDay.ready) li.classList.add('ready');
    else li.classList.add('partial');
  }
}

function saveCurrentDay() {

}

function readyAnother() {

  saveCurrentDay();
}

function initElements() {

}

function importSlackDump(slackDump) {
  // TODO: integrate updates from new Slack dumps
  if (localStorage.getItem('savedStateJson')) {
    return alert("Not importing Slack dump since you have a currently saved " +
      "state. If you wish to import this dump, you must first clear your " +
      "state in the console with " +
      "localStorage.setItem('savedStateJson', null).");
  }
  content = {slack: slackDump};

  var dingrollItems = {users: {}, channels: {}};
  content.dingroll = dingrollItems;

  for (var i = 0; i < slackDump.users.length; i++) {
    var user = slackDump.users[i];
    dingrollItems.users[user.id] = dingrollItems.users[user.id] || {
      id: uuid(),
      name: user.name
    };
  }
  for (var i = 0; i < slackDump.channels.length; i++) {
    var channel = slackDump.channels[i];
    dingrollItems.channels[channel.id] =
      dingrollItems.channels[channel.id] || {
        name: channel.name,
        dayMessages: {}
      };
  }
  initElements();
}

function importJson(file) {
  file = URL.toBlobUrl(file);

  fetch(file).then(function (body) {
    return body.text();
  }).then(function(text){
    try {
      var importedContent = JSON.parse(text);
    } catch (err) {
      return alert('Invalid JSON: ' + err.message);
    }

    if (importedContent.dingroll) {
      content = importedContent;
    } else if (importedContent.channels) {
      importSlackDump(importedContent);
    } else {
      return alert('Unrecognized JSON (no "dingroll" or "channels").');
    }
  });

}

var importInput = document.getElementById('import-file');

importInput.addEventListener('change', function () {
  var file = importInput.files[0];
  if (file) importJson(file);
});

var savedJson = localStorage.getItem('savedStateJson');

if (savedJson) {
  content = JSON.parse(savedJson);
}

var showDaysButton = document.getElementById('showdays');
var saveButton = document.getElementById('save');
var anotherButton = document.getElementById('another');

showDaysButton.addEventListener('click', function () {
  daysList.hidden=!daysList.hidden;
});
saveButton.addEventListener('click', saveCurrentDay);
anotherButton.addEventListener('click', readyAnother);
