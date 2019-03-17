const levelup = require("levelup");
const leveldown = require("leveldown");
const probe = require("node-ffprobe");
const path = require("path");
const fs = require("fs");

const UPDATE_INTERVAL = 5000;

// to client:
// sync.update { url: <url>, vtt: <subs>, pos: <pos in seconds>, state: (stopped|playing|paused) }

var mediaInfo = {
	url: null,
	vtt: null,
	duration: 0,
	pos: 0,
	lastUpdate: 0,
	state: "stopped"
};

function getSyncObject()
{
	return {
		url: mediaInfo.url,
		vtt: mediaInfo.vtt,
		pos: mediaInfo.pos,
		duration: mediaInfo.duration,
		state: mediaInfo.state
	};
}

// set regular sync update
function runTick(io, db)
{
	if(mediaInfo.state == "playing")
	{
		mediaInfo.pos += (Date.now() - mediaInfo.lastUpdate) / 1000;
	}

	if(mediaInfo.pos > mediaInfo.duration)
	{
		mediaInfo.pos = mediaInfo.duration;
		mediaInfo.state = "stopped";
	}

	mediaInfo.lastUpdate = Date.now();

	io.emit("sync.update", getSyncObject());

	db.put("media:info", JSON.stringify(mediaInfo));
}

// register listeners for control panel
function registerListeners(socket, nconf, forceUpdate)
{
	// sets the state of the currently playing media
	socket.on("control.state", (msg) => {
		var newState = msg.state;
		if(newState != "stopped" && newState != "playing" && newState != "paused")
		{
			socket.emit("control.error", { msg: `Invalid state in control.state: {newState}` });
			return;
		}

		var oldState = mediaInfo.state;
		mediaInfo.state = newState;
		if(newState == "playing" && oldState != "playing")
		{
			mediaInfo.lastUpdate = Date.now();
		}
		else if(newState == "paused" && oldState == "playing")
		{
			mediaInfo.pos += (Date.now() - mediaInfo.lastUpdate) / 1000;
			mediaInfo.lastUpdate = Date.now();
		}
		else if(newState == "stopped")
		{
			mediaInfo.pos = 0;
			mediaInfo.lastUpdate = Date.now();
		}
		forceUpdate();
	});

	// sets the url of the currently playing media
	socket.on("control.set_url", (msg) => {
		var file = msg.file || "";
		var filePath = path.join(nconf.get("data_folder"), file);
		if(!fs.existsSync(filePath) || file.trim().length == 0)
		{
			return socket.emit("control.error", { msg: `Can't find file ${filePath}` });
		}

		probe(filePath, (err, probeData) => {
			if(err) 
			{
				socket.emit("control.error", { msg: "ffprobe error: " + err });
				return;
			}

			mediaInfo.url = file;
			mediaInfo.pos = 0;
			mediaInfo.duration = probeData.format.duration;
			forceUpdate();
		});
	});

	// sets the vtt file of the currently playing media
	socket.on("control.set_vtt", (msg) => {
		var vtt = msg.vtt || "";
		mediaInfo.vtt = vtt;
		forceUpdate();
	});

	// sets the position of the currently playing media
	socket.on("control.set_pos", (msg) => {
		var pos = msg.pos || 0;
		if(pos > mediaInfo.duration)
		{
			socket.emit("control.error", { msg: "Position past the end of media." });
			return;
		}

		mediaInfo.pos = pos;
		mediaInfo.lastUpdate = Date.now();
		forceUpdate();
	});
}

module.exports = function(io, nconf, cb) {
	var db = levelup(leveldown("./state"));
	db.get("media:info", (err, value) => {
		if(err && !err.notFound)
		{
			return cb(err);
		}

		io.on("connection", (socket) => {
			runTick(io, db);
			registerListeners(socket, nconf, () => runTick(io, db));
		});

		setInterval(() => runTick(io, db), UPDATE_INTERVAL);

		if(err == null || !err.notFound)
		{
			mediaInfo = JSON.parse(value);
		}

		return cb(null);
	});
}