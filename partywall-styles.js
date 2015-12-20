/* global partywallStyler */
var styler = partywallStyler();

styler.addStyle([['.slack-message','#source-area']],
  'flex: none; flex-flow: column;');
styler.addStyle([['.slack-message','#description-line']],
  'flex: none; flex-flow: row;');
styler.addStyle([['.dingroll-message','select'],
  ['.dingroll-message','button']],
  'flex: none;');
styler.addStyle([['.dingroll-message','#message-tags']],
  'flex: 1;');
