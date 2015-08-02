// v4 UUID generator, adapted from https://gist.github.com/LeverOne/1308368
function uuid() {
  var a = 0;
  var b = '';
  while(a++<36)
    b+=a*51&52?(a!=15?8^Math.random()*(a!=20?16:4):4).toString(16):'-';
  return b;
}
