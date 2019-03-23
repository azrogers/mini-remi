const levelup = require("levelup");
const leveldown = require("leveldown");
const probe = require("node-ffprobe");
const path = require("path");
const fs = require("fs");
const Youtube = require("youtube-api");
const util = require("./util");

const UPDATE_INTERVAL = 5000;

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/;

// to client:
// sync.update { url: <url>, vtt: <subs>, pos: <pos in seconds>, state: (stopped|playing|paused), type: (youtube|file) }

var mediaInfo = {
	url: null,
	type: "file",
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
		type: mediaInfo.type,
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

function handleYoutube(socket, msg, forceUpdate)
{
	var id = YOUTUBE_REGEX.exec(msg.file || "")[1];
	Youtube.videos.list({ part: "contentDetails", id: id }, (err, data) => {
		if(err)
		{
			return socket.emit("control.error", { msg: "youtube api error: " + err });
		}
		if(!data.items || !data.items[0] || !data.items[0].contentDetails)
		{
			return socket.emit("control.error", { msg: "youtube video not found" });
		}

		var duration = util.convertYoutubeTime(data.items[0].contentDetails.duration);
		if(duration == 0)
		{
			return socket.emit("control.error", { msg: "invalid duration" });
		}

		mediaInfo.duration = duration;
		mediaInfo.pos = 0;
		mediaInfo.type = "youtube";
		mediaInfo.url = id;
		forceUpdate();
	});
}

function handleFile(socket, msg, forceUpdate)
{
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

		mediaInfo.type = "file";
		mediaInfo.url = file;
		mediaInfo.pos = 0;
		mediaInfo.duration = probeData.format.duration;
		forceUpdate();
	});
}

// register listeners for control panel
function registerListeners(socket, nconf, forceUpdate)
{
	var session = socket.handshake.session;
	var isAdmin = session.discordId == null ? false : nconf.get("admins").indexOf(session.discordId) != -1;

	function registerListener(name, cb)
	{
		socket.on(name, (msg) => {
			if(!isAdmin)
			{
				socket.emit("control.error", { msg: "Not logged in. Refresh the page. "});
				return;
			}

			cb(msg);
		})
	}

	// sets the state of the currently playing media
	registerListener("control.state", (msg) => {
		if(!isAdmin) return;

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
	registerListener("control.set_url", (msg) => {
		if(!isAdmin) return;
		
		var file = msg.file || "";
		if(YOUTUBE_REGEX.test(file))
		{
			handleYoutube(socket, msg, forceUpdate);
		}
		else
		{
			handleFile(socket, msg, forceUpdate);
		}
	});

	// sets the vtt file of the currently playing media
	registerListener("control.set_vtt", (msg) => {
		if(!isAdmin) return;
		
		var vtt = msg.vtt || "";
		mediaInfo.vtt = vtt;
		forceUpdate();
	});

	// sets the position of the currently playing media
	registerListener("control.set_pos", (msg) => {
		if(!isAdmin) return;
		
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
	Youtube.authenticate({
		type: "key",
		key: nconf.get("youtube_api_key")
	});

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