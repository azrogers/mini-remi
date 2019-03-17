var socket = io();
var WIGGLE_ROOM = 0.5;
var isReady = false;
var queuedInfo = null;
var mediaInfo = {
	state: "stopped",
	pos: 0,
	duration: 0,
	url: null,
	vtt: null
};

var subsEnabled = true;
var options = {
	controls: ["mute", "volume", "captions", "pip", "fullscreen"],
	settings: ["captions"],
	clickToPlay: false,
	disableContextMenu: false,
	iconUrl: "/plyr.svg"
};

var player = new Plyr("#sync-video", options);
player.on("ready", function() {
	isReady = true;
	if(queuedInfo != null)
	{
		var oldMedia = mediaInfo;
		mediaInfo = queuedInfo;
		updateVideo(oldMedia, queuedInfo);
	}
});

function setSource(newSource, newVtt)
{
	player.source = {
		type: "video",
		sources: [
			{ src: newSource }
		],
		tracks: [
			{
				kind: "captions",
				label: "Subtitles",
				srclang: "en",
				src: newVtt
			}
		]
	};
}

function updateVideo(oldMedia, newMedia)
{
	if(
		oldMedia.url != newMedia.url ||
		oldMedia.vtt != newMedia.vtt)
	{
		setSource(baseUrl + newMedia.url, "/subs/" + newMedia.vtt);
	}

	var diff = Math.abs(newMedia.pos - player.currentTime);
	if(diff > WIGGLE_ROOM)
	{
		player.currentTime = newMedia.pos;
	}

	if(newMedia.state == "playing" && !player.playing)
	{
		player.play();
	}
	else if(newMedia.state == "paused" && !player.paused)
	{
		player.pause();
	}
	else if(newMedia.state == "stopped" && !player.stopped)
	{
		player.stop();
	}
}

socket.on("sync.update", (msg) => {
	if(!isReady)
	{
		queuedInfo = msg;
		return;
	}
	var oldMedia = mediaInfo;
	mediaInfo = msg;
	updateVideo(oldMedia, mediaInfo);
});