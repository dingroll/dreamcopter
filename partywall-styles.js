/* global partywallStyler */
var styler = partywallStyler();

// layout

styler.addStyle([
  ['.slack-message','#source-area'], ['.slack-message','#source-details']],
  'flex: none; display: flex; flex-flow: column;');
styler.addStyle([
  ['.slack-message','#description-line']],
  'flex: none; display: flex; flex-flow: row; '+
  'justify-content: space-between;');
styler.addStyle([
  ['.dingroll-message','select'], ['.dingroll-message','button']],
  'flex: none;');
styler.addStyle([['.dingroll-message','#message-tags']],
  'flex: 1;');

// style
