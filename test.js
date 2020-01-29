const notifyOne = require('./services/notify-one');

notifyOne(
	'http://hn.geekity.com/newstories.xml',
	'http://[::ffff:67.205.147.18]:1337/feedupdated'
).then(console.dir).catch(console.dir);
